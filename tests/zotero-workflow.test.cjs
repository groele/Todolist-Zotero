const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { page, makeHost, waitFor, JSDOM, read } = require('./helpers.cjs');
const wf = vm.runInNewContext(read('chrome/content/js/literatureWorkflow.js') + ';LiteratureWorkflow');
const paper = (id = 1, key = 'PAPER', libraryID = 1) => ({ id, key, libraryID, isRegularItem: () => true,
  getField: field => field === 'title' ? 'Old paper title' : '', getCreators: () => [], getTags: () => [] });
const date = days => wf.dateAfter(days);
function referenceHost(native, items) {
  native.context.Zotero.Items.get = id => items.find(item => item.id === id) || null;
  native.context.Zotero.Items.getByLibraryAndKey = (libraryID, key) => items.find(item => item.libraryID === libraryID && item.key === key) || null;
}
async function paneFixture(t, native, item) {
  const dom = new JSDOM('<body><div id="pane"></div></body>'); t.after(() => dom.window.close());
  const doc = dom.window.document, body = doc.getElementById('pane');
  native.host.registerItemPaneSection(); const pane = native.pane();
  const refresh = async () => { pane.onRender({ body, item }); await pane.onAsyncRender({ doc, body, item }); };
  pane.onInit({ doc, body, item, refresh }); t.after(() => pane.onDestroy({ body }));
  await refresh(); return { dom, doc, body, pane, refresh };
}

test('bulk creation handles mixed libraries, child attachments, pre-existing tasks and concurrent submissions', async () => {
  const native = makeHost(); const a = paper(), b = paper(2, 'PAPER', 2), c = paper(3, 'OTHER');
  const attachment = { id: 4, parentItemID: a.id, isAttachment: () => true };
  referenceHost(native, [a, b, c, attachment]);
  const win = { ZoteroPane: { getSelectedItems: () => [a, attachment, b, c, { id: 5, isNote: () => true }] } };
  await native.host.addLiteratureReadingTask(a);
  const outcomes = await Promise.all([native.host.addSelectedLiteratureTasks(win), native.host.addSelectedLiteratureTasks(win)]);
  assert.equal(native.disk().tasks.length, 3);
  assert.equal(outcomes.reduce((sum, value) => sum + value.added, 0), 2);
  assert(native.disk().tasks.every(task => task.dueDate === date(7)));
  assert.equal(new Set(native.disk().tasks.map(task => task.zoteroLibraryID + ':' + task.zoteroItemKey)).size, 3);
  assert.equal(native.disk().deduplicateLiterature, undefined);
});

test('bulk write failure is atomic and retry creates every selected paper', async () => {
  const native = makeHost(); const items = [paper(), paper(2, 'OTHER')]; referenceHost(native, items);
  const win = { ZoteroPane: { getSelectedItems: () => items } };
  native.failWrites(true); await assert.rejects(native.host.addSelectedLiteratureTasks(win), /disk full/);
  assert.equal(native.disk().tasks.length, 0);
  native.failWrites(false); assert.equal((await native.host.addSelectedLiteratureTasks(win)).added, 2);
});

test('right-click batch menu uses the owning Zotero window and handles asynchronous errors', async () => {
  const native = makeHost(); let options;
  native.context.Zotero.MenuManager = { registerMenu: value => { options = value; return 'menu'; } };
  native.host.registerMenus();
  const win = { ZoteroPane: { getSelectedItems: () => [paper()] } };
  await options.menus.find(menu => menu.label === '批量加入研读待办').onCommand({ target: { ownerDocument: { defaultView: win } } });
  assert.equal(native.disk().tasks.length, 1);
});

test('rescheduling runs on the latest snapshot, keeps reminders/time/subtasks, and re-arms notification', async () => {
  const native = makeHost({ tasks: [{ id: 'a', title: 'Reading', dueDate: date(7), dueTime: '09:30',
    reminder: { enabled: true, before: 30, notified: true }, subtasks: [{ id: 's', title: 'Question', completed: false }] }], settings: {} });
  await Promise.all([native.host.rescheduleLiteratureTask('a', 3, true), native.host.rescheduleLiteratureTask('a', 7, true)]);
  const task = native.disk().tasks[0]; assert.equal(task.dueDate, date(17));
  assert.equal(task.dueTime, '09:30'); assert.equal(task.subtasks[0].title, 'Question');
  assert.deepEqual(task.reminder, { enabled: true, before: 30, notified: false });
  await native.host.rescheduleLiteratureTask('a', 0); assert.equal(native.disk().tasks[0].dueDate, date(0));
  await native.host.rescheduleLiteratureTask('a', 3, true); assert.equal(native.disk().tasks[0].dueDate, date(3));
  await assert.rejects(native.host.rescheduleLiteratureTask('a', 2), /不支持/);
  await assert.rejects(native.host.rescheduleLiteratureTask('gone', 0), /已被删除/);
});

test('native sidebar exposes keyboard-accessible edit and date controls that persist through real DOM events', async t => {
  const native = makeHost(); const item = paper(); referenceHost(native, [item]);
  const task = (await native.host.addLiteratureReadingTask(item)).task;
  const { body } = await paneFixture(t, native, item);
  const opened = []; native.host.openTodolist = options => opened.push(options);
  body.querySelector('.td-task-edit').click(); assert.equal(opened[0].mode, 'edit_task'); assert.equal(opened[0].taskId, task.id);
  assert.equal(body.querySelector('.td-task-title').tagName, 'BUTTON');
  const option = [...body.querySelectorAll('.td-reschedule-option')].find(btn => btn.textContent === '延后三天');
  option.click(); await waitFor(() => native.disk().tasks[0].dueDate === date(10));
});

test('item-pane synchronous render keeps add and per-task Zotero jump buttons visible before async rendering', async t => {
  const item = paper(1, 'PAPER', 1);
  const linked = { id: 'linked-task', title: 'Read the paper', zoteroItemKey: 'PAPER', zoteroLibraryID: 1,
    zoteroItemTitle: 'Old paper title', zoteroUri: 'zotero://select/library/items/PAPER', completed: false };
  const native = makeHost({ tasks: [linked], settings: {} });
  native.host.registerItemPaneSection();
  const dom = new JSDOM('<body><div id="pane"></div></body>'); t.after(() => dom.window.close());
  const doc = dom.window.document, body = doc.getElementById('pane'), pane = native.pane();
  native.context.Zotero.getMainWindow = () => ({ ZoteroPane: { getSelectedItems: () => [item] } });
  pane.onInit({ doc, body, item: null, refresh: () => {} }); t.after(() => pane.onDestroy({ body }));
  let enabled = false;
  pane.onItemChange({ body, item: null, setEnabled: value => { enabled = value; } });
  pane.onRender({ body, item: null });
  assert.equal(enabled, true);
  assert.equal(body.querySelector('.td-add-reading')?.textContent, '＋ 添加到论文研读');
  assert.equal(body.querySelector('.td-add-reading').disabled, false);
  await waitFor(() => body.querySelector('.td-task-card-fallback'));
  const taskRows = body.querySelectorAll('.td-task-card-fallback');
  assert.equal(taskRows.length, 1);
  const jump = taskRows[0].querySelector('.td-task-locate');
  assert.equal(jump?.textContent, '↗ Zotero');
  const calls = [];
  native.host.locateLiteratureItem = async (...args) => { calls.push(args); return true; };
  jump.click(); await waitFor(() => calls.length === 1);
  assert.equal(calls[0][0], linked.zoteroUri);
  assert.equal(calls[0][1], linked.zoteroLibraryID);
});

test('item-pane keeps the add button available when task storage cannot be read', async t => {
  const native = makeHost(); const item = paper();
  native.host.registerItemPaneSection();
  native.failReads(new Error('storage unavailable'));
  const dom = new JSDOM('<body><div id="pane"></div></body>'); t.after(() => dom.window.close());
  const doc = dom.window.document, body = doc.getElementById('pane'), pane = native.pane();
  pane.onInit({ doc, body, item, refresh: () => {} }); t.after(() => pane.onDestroy({ body }));
  pane.onRender({ body, item });
  await pane.onAsyncRender({ doc, body, item });
  assert.equal(body.querySelector('.td-add-reading')?.textContent, '＋ 添加到论文研读');
  assert(body.textContent.includes('读取失败'));
});

test('item-pane styles keep only the Todolist sidenav icon visible and preserve accessible labels', async t => {
  const native = makeHost(); const dom = new JSDOM('<body><div id="pane"></div></body>'); t.after(() => dom.window.close());
  native.host.registerItemPaneSection();
  const doc = dom.window.document, body = doc.getElementById('pane');
  native.pane().onInit({ doc, body, item: paper(), refresh: () => {} });
  const styles = doc.getElementById('todolist-itempane-styles').textContent;
  assert.match(styles, /item-pane-sidenav\s+\.btn\[data-pane\*="todolist-item-pane"\]/);
  assert.match(styles, /font-size\s*:\s*0/);
  assert.doesNotMatch(styles, /item-pane-sidenav\s+\.btn(?!\[data-pane\*="todolist-item-pane"\])/);
  const zh = read('locale/zh-CN/todolist.ftl'), en = read('locale/en-US/todolist.ftl');
  for (const locale of [zh, en]) {
    const message = locale.match(/todolist-item-pane-sidenav =([\s\S]*?)(?=\ntodolist-|$)/)?.[1] || '';
    assert.match(message, /\.title\s*=/);
    assert.match(message, /\.aria-label\s*=/);
    assert.doesNotMatch(message, /\n\s{4,}[^.\s]/, 'sidenav message must not have a visible Fluent value');
  }
});

test('native Fluent header localization preserves the collapsible section body and controls', () => {
  for (const locale of ['zh-CN', 'en-US']) {
    const ftl = read(`locale/${locale}/todolist.ftl`);
    for (const [id, attribute] of [['todolist-item-pane-header', 'label'], ['todolist-item-pane-sidenav', 'aria-label']]) {
      const message = ftl.match(new RegExp(`(?:^|\\n)${id}[ \\t]*=([\\s\\S]*?)(?=\\r?\\ntodolist-|$)`))?.[1];
      assert(message, `${locale}: missing ${id}`);
      // Zotero localizes the entire native widget. A Fluent value replaces its
      // children, including the section header, body and our action buttons.
      assert.match(message, /^[ \t]*\r?\n/, `${locale}: ${id} must be attribute-only`);
      assert.match(message, new RegExp(`\\.${attribute}\\s*=`));
      assert.doesNotMatch(message, /\n[ \t]+[^.\s#]/, `${locale}: ${id} must not have a multiline value`);
    }
  }
});

test('failed sidebar reschedule preserves deadline and leaves controls available for retry', async t => {
  const native = makeHost(); const item = paper(); referenceHost(native, [item]);
  await native.host.addLiteratureReadingTask(item); const { body } = await paneFixture(t, native, item);
  const notices = []; native.host.showNotice = title => notices.push(title);
  native.failWrites(true);
  [...body.querySelectorAll('.td-reschedule-option')].find(btn => btn.textContent === '今天').click();
  await waitFor(() => notices.includes('改期失败'));
  assert.equal(native.disk().tasks[0].dueDate, date(7));
  await waitFor(() => !body.querySelector('.td-reschedule-option').disabled);
});

test('discipline presets differ and custom deadlines use calendar dates across leap-day/month boundaries', async () => {
  assert.equal(wf.dateAfter(7, '2028-02-26T12:00:00'), '2028-03-04');
  assert.equal(wf.dateAfter(7, '2026-12-28T12:00:00'), '2027-01-04');
  assert.equal(wf.days('14'), 14); assert.equal(wf.days(-1), 7);
  assert(!wf.profile('theory').steps.join(' ').includes('消融'));
  assert(wf.profile('experiment').steps.join(' ').includes('误差'));
  assert(wf.profile('review').steps.join(' ').includes('原始文献'));
  const native = makeHost(); native.host.openTodolist = () => {};
  native.context.Zotero.Prefs.get = key => key.endsWith('defaultDueDays') ? 14 : key.includes('autoSync') ? false : undefined;
  const a = await native.host.createReadingMilestones(paper(), null, 'theory');
  const b = await native.host.createReadingMilestones(paper(), null, 'theory');
  assert.equal(a.task.dueDate, date(14)); assert.equal(a.task.subtasks.length, 5);
  assert.equal(a.task.id, b.task.id); assert.equal(b.created, false);
});

test('main dialog and gallery use the selected scientific profile and save it with the editable task', async t => {
  const p = await page(); t.after(p.close);
  await p.Templates.applyTemplate('paper-reading-theory');
  assert.equal(p.doc.getElementById('task-reading-profile').value, 'theory');
  assert(p.Modal.currentSubtasks.some(step => step.title.includes('量纲')));
  assert.equal(p.doc.getElementById('task-due-date').value, date(7));
  await p.Modal.handleSubmit();
  assert.equal(p.TaskManager.getTasks()[0].readingProfile, 'theory');
  await p.Modal.openEdit(p.TaskManager.getTasks()[0].id);
  p.doc.getElementById('task-reading-profile').value = 'experiment';
  p.doc.getElementById('btn-inject-milestones').click();
  assert(p.Modal.currentSubtasks.some(step => step.title.includes('误差')));
});

function annotationFixture() {
  const native = makeHost(); const parent = paper();
  const first = { id: 10, key: 'FIRSTPDF', libraryID: 1, parentItemID: 1, isAttachment: () => true, isPDFAttachment: () => true };
  const second = { ...first, id: 11, key: 'SECONDPDF' };
  parent.getAttachments = () => [10, 11];
  const annotation = { id: 12, key: 'ANNOTATION', libraryID: 1, parentItemID: 11, isAnnotation: () => true,
    annotationText: 'Important equation', annotationComment: 'Check dimensions', annotationPosition: '{"pageIndex":4}' };
  referenceHost(native, [parent, first, second, annotation]);
  const opened = []; native.context.Zotero.Reader = { open: async (...args) => opened.push(args) };
  return { native, parent, first, second, annotation, opened };
}

test('annotation tasks retain identity, quote and exact attachment, deduplicate and navigate using Zotero Reader API', async () => {
  const { native, annotation, opened } = annotationFixture();
  const task = await native.host.createTaskFromAnnotation({ itemID: 11 }, annotation.key);
  await native.host.createTaskFromAnnotation({ itemID: 11 }, annotation.key);
  assert.equal(native.disk().tasks.length, 1);
  assert.equal(task.zoteroAnnotationKey, annotation.key); assert.equal(task.zoteroPage, 5);
  assert.equal(task.zoteroAttachmentKey, 'SECONDPDF'); assert.equal(task.zoteroQuote, annotation.annotationText);
  assert.equal(task.dueDate, date(7));
  await native.host.openTaskPdf(task);
  assert.equal(opened[0][0], 11);
  assert.deepEqual(JSON.parse(JSON.stringify(opened[0][1])), { pageIndex: 4, annotationID: 'ANNOTATION' });
  annotation.deleted = true; await native.host.openTaskPdf(task);
  assert.deepEqual(JSON.parse(JSON.stringify(opened[1][1])), { pageIndex: 4 });
  await assert.rejects(native.host.createTaskFromAnnotation({ itemID: 10 }, annotation.key), /不属于/);
});

test('annotation metadata survives add/edit forms and task cards send exact PDF and annotation references', async t => {
  const p = await page(); t.after(p.close); const { native } = annotationFixture();
  const source = await native.host.createTaskFromAnnotation({ itemID: 11 }, 'ANNOTATION');
  p.Modal.openAdd(source); await p.Modal.handleSubmit();
  const task = p.TaskManager.getTasks()[0]; assert.equal(task.zoteroAnnotationKey, 'ANNOTATION');
  await p.Modal.openEdit(task.id); p.doc.getElementById('task-title').value = 'New question'; await p.Modal.handleSubmit();
  assert.equal(p.TaskManager.getTaskById(task.id).zoteroAttachmentKey, 'SECONDPDF');
  const calls = []; p.ZoteroBridge.openPdf = (...args) => calls.push(args);
  p.UI.render(); p.doc.querySelector('.btn-card-open-pdf').click(); await waitFor(() => calls.length === 1);
  assert.equal(calls[0][0], source.zoteroPdfUri); assert.equal(calls[0][3], 'ANNOTATION');
});

test('reader popup records selection page and quote with a one-week deadline', async () => {
  const { native } = annotationFixture();
  await native.host.createTaskFromReader(null, { itemID: 11 }, { text: 'Selected passage', position: { pageIndex: 6 } });
  const task = native.disk().tasks[0];
  assert.equal(task.zoteroPage, 7); assert.equal(task.zoteroQuote, 'Selected passage');
  assert(task.zoteroPdfUri.includes('SECONDPDF?page=7')); assert.equal(task.dueDate, date(7));
});

test('item notifications update linked metadata and deletion status without losing task contents or library identity', async t => {
  const native = makeHost(); const a = paper(), b = paper(2, 'PAPER', 2); const items = [a, b]; referenceHost(native, items);
  const ta = (await native.host.addLiteratureReadingTask(a)).task; await native.host.addLiteratureReadingTask(b);
  a.getField = field => field === 'title' ? 'Renamed paper' : '';
  assert.equal(await native.host.refreshLinkedLiterature(new Set([1])), 1);
  assert.equal(native.disk().tasks.find(task => task.id === ta.id).title, '研读：Renamed paper');
  assert.equal(native.disk().tasks.find(task => task.zoteroLibraryID === 2).zoteroItemTitle, 'Old paper title');
  const writes = native.writes(); await native.host.refreshLinkedLiterature(new Set([1])); assert.equal(native.writes(), writes);
  a.deleted = true; await native.host.refreshLinkedLiterature(new Set([1]));
  assert.equal(native.disk().tasks[0].zoteroLinkStatus, 'trashed');
  items.splice(0, 1); await native.host.refreshLinkedLiterature(new Set([1]));
  assert.equal(native.disk().tasks[0].zoteroLinkStatus, 'missing'); assert.equal(native.disk().tasks.length, 2);
  const p = await page('index.html', { tasks: native.disk().tasks }); t.after(p.close);
  assert(p.doc.querySelector('.zotero-link-warning').textContent.includes('已删除'));
});

test('metadata refresh preserves a manual title edit committed while the notifier is loading', async () => {
  const native = makeHost(); const a = paper(); referenceHost(native, [a]);
  const task = (await native.host.addLiteratureReadingTask(a)).task;
  a.getField = field => field === 'title' ? 'Renamed paper' : '';
  const save = native.host.saveData.bind(native.host);
  native.host.saveData = async patch => {
    if (patch.taskChanges?.updated?.[0]?.literatureRefresh) {
      await save({ taskChanges: { updated: [{ id: task.id, changes: { title: 'My custom question' } }] } });
    }
    return save(patch);
  };
  await native.host.refreshLinkedLiterature(new Set([1]));
  assert.equal(native.disk().tasks[0].title, 'My custom question');
  assert.equal(native.disk().tasks[0].zoteroItemTitle, 'Renamed paper');
  assert.equal(native.disk().tasks[0].zoteroAutoTitle, false);
});

test('a title customized before the first save is preserved when the linked paper is renamed', async t => {
  const p = await page(); t.after(p.close);
  p.Modal.openAdd({ title: '研读：Old paper title', zoteroAutoTitle: true,
    zoteroItemKey: 'PAPER', zoteroItemTitle: 'Old paper title', zoteroLibraryID: 1 });
  p.doc.getElementById('task-title').value = 'My new research question';
  await p.Modal.handleSubmit();
  const task = p.TaskManager.getTasks()[0]; assert.equal(task.zoteroAutoTitle, false);
  const native = makeHost({ tasks: [task], settings: {} }); const item = paper();
  item.getField = field => field === 'title' ? 'New paper title' : ''; referenceHost(native, [item]);
  await native.host.refreshLinkedLiterature();
  assert.equal(native.disk().tasks[0].title, 'My new research question');
  assert.equal(native.disk().tasks[0].zoteroItemTitle, 'New paper title');
});

test('native integration registers reader/notifier hooks once, handles annotation menus and cleans up on shutdown', async t => {
  const { native } = annotationFixture(); const hooks = new Map(); const removed = [];
  native.context.Services = { wm: { getEnumerator: () => ({ hasMoreElements: () => false }) } };
  let observer;
  native.context.Zotero.Notifier = { registerObserver: value => { observer = value; return 7; }, unregisterObserver: id => removed.push(id) };
  native.context.Zotero.Reader.registerEventListener = (type, handler) => hooks.set(type, handler);
  native.context.Zotero.Reader.unregisterEventListener = type => removed.push(type);
  native.host.registerZoteroIntegration(); native.host.registerZoteroIntegration();
  assert.equal(hooks.size, 2); assert(observer);
  let menu;
  hooks.get('createAnnotationContextMenu')({ reader: { itemID: 11 }, params: { ids: ['ANNOTATION'] }, append: value => { menu = value; } });
  menu.onCommand(); await waitFor(() => native.disk().tasks.length === 1);
  await native.host.shutdown();
  assert(removed.includes(7)); assert(removed.includes('createAnnotationContextMenu')); assert(removed.includes('renderTextSelectionPopup'));
});

test('follow-Zotero theme updates visible UI without storage writes and explicit theme choice remains authoritative', async t => {
  const native = makeHost({ tasks: [], settings: { theme: 'zotero' } });
  let dark = true, onChange;
  native.context.Zotero.getMainWindow = () => ({ matchMedia: () => ({ matches: dark,
    addEventListener: (event, handler) => { onChange = handler; }, removeEventListener: () => {} }) });
  native.host.registerZoteroIntegration();
  const p = await page('index.html', null, native.host); t.after(p.close);
  await native.host._saveQueue;
  assert.equal(p.doc.documentElement.dataset.theme, 'dark'); const writes = native.writes();
  dark = false; onChange(); await waitFor(() => p.doc.documentElement.dataset.theme === 'light');
  assert.equal(native.writes(), writes);
  await p.Storage.saveSettings({ theme: 'dark' }); dark = true; onChange(); dark = false; onChange();
  await Promise.resolve(); assert.equal(p.doc.documentElement.dataset.theme, 'dark');
  native.context.Services = { wm: { getEnumerator: () => ({ hasMoreElements: () => false }) } }; await native.host.shutdown();
});
