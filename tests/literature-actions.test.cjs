const test = require('node:test');
const assert = require('node:assert/strict');
const { page, makeHost, waitFor, JSDOM } = require('./helpers.cjs');

const paper = (key = 'PAPER', libraryID = 1) => ({
  id: libraryID * 10, key, libraryID, isRegularItem: () => true,
  getField: field => ({ title: 'Two-dimensional ferroelectric materials', date: '2026', publicationTitle: 'Journal' })[field] || '',
  getCreators: () => [{ lastName: 'Author' }], getTags: () => [{ tag: 'reading' }]
});
const nextWeek = () => {
  const date = new Date(); date.setDate(date.getDate() + 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
async function sidebar(t, native, target = paper()) {
  native.context.Zotero.Items.getByLibraryAndKey = (libraryID, key) => libraryID === target.libraryID && key === target.key ? target : null;
  const dom = new JSDOM('<body><div id="pane"></div></body>'); t.after(() => dom.window.close());
  const doc = dom.window.document, body = doc.getElementById('pane');
  native.host.registerItemPaneSection(); const pane = native.pane();
  const refresh = async () => {
    pane.onRender({ doc, body, item: target });
    await pane.onAsyncRender({ doc, body, item: target });
  };
  pane.onInit({ doc, body, item: target, refresh }); t.after(() => pane.onDestroy({ body }));
  await refresh();
  return { doc, body, pane, refresh };
}

test('one-click sidebar creates linked reading task due in seven days; repeat clicks do not duplicate it', async t => {
  const native = makeHost(); const { body } = await sidebar(t, native);
  const button = body.querySelector('.td-add-reading');
  assert.equal(button.textContent, '＋ 添加到论文研读');
  button.click(); button.click();
  await waitFor(() => native.disk().tasks.length === 1);
  await waitFor(() => body.querySelector('.td-add-reading')?.textContent === '已加入论文研读');
  const task = native.disk().tasks[0];
  assert.equal(task.title, '研读：Two-dimensional ferroelectric materials');
  assert.equal(task.dueDate, nextWeek());
  assert.equal(task.dueTime, null);
  assert.equal(task.academicType, 'literature_reading');
  assert.equal(task.category, '论文研读');
  assert.equal(task.zoteroItemKey, 'PAPER');
  assert.equal(task.zoteroLibraryID, 1);
  assert.equal(task.zoteroUri, 'zotero://select/library/items/PAPER');
  assert.equal(body.querySelector('.td-add-reading').disabled, true);
  const repeat = await native.host.addLiteratureReadingTask(paper());
  assert.equal(repeat.created, false);
  assert.equal(native.disk().tasks.length, 1);
});

test('concurrent entry points deduplicate reading tasks and distinguish group library from user library', async () => {
  const native = makeHost();
  native.context.Zotero.Libraries.get = id => id === 2 ? { groupID: 123 } : {};
  const [a, b] = await Promise.all([
    native.host.addLiteratureReadingTask(paper()), native.host.addLiteratureReadingTask(paper())
  ]);
  assert.equal(a.task.id, b.task.id);
  assert.equal(native.disk().tasks.length, 1);
  await native.host.addLiteratureReadingTask(paper('PAPER', 2));
  assert.equal(native.disk().tasks.length, 2);
  assert.equal(native.disk().tasks[1].zoteroUri, 'zotero://select/groups/123/items/PAPER');
  await native.host.saveData({ taskChanges: { updated: [{ id: a.task.id, changes: { completed: true } }] } });
  await native.host.addLiteratureReadingTask(paper());
  assert.equal(native.disk().tasks.length, 3);
});

test('quick creation links a child PDF to its parent and respects custom title, priority and tag preference', async () => {
  const native = makeHost(); const target = paper();
  native.context.Zotero.Items.get = () => target;
  native.context.Zotero.Prefs.get = key => key.endsWith('autoTagFromItem') || key.includes('autoSync') ? false : undefined;
  const result = await native.host.addLiteratureReadingTask({ isAttachment: () => true, parentItemID: 10 }, {
    title: ' Read methods ', priority: 'high'
  });
  assert.equal(result.task.title, 'Read methods');
  assert.equal(result.task.priority, 'high');
  assert.equal(result.task.dueDate, nextWeek());
  assert.equal(result.task.zoteroItemKey, target.key);
  assert.deepEqual(native.disk().tasks[0].tags, []);
  await assert.rejects(native.host.addLiteratureReadingTask(null), /选中文献/);
});

test('sidebar save failure leaves data unchanged and one-click button can retry', async t => {
  const native = makeHost(); const notices = [];
  native.host.showNotice = (...args) => notices.push(args);
  const { body } = await sidebar(t, native);
  native.failWrites(true); body.querySelector('.td-add-reading').click();
  await waitFor(() => notices.some(notice => notice[0] === '保存失败'));
  await waitFor(() => !body.querySelector('.td-add-reading').disabled);
  assert.equal(native.disk().tasks.length, 0);
  native.failWrites(false); body.querySelector('.td-add-reading').click();
  await waitFor(() => native.disk().tasks.length === 1);
  await waitFor(() => body.querySelector('.td-add-reading')?.textContent === '已加入论文研读');
});

test('custom sidebar draft survives a failed save and retries with a one-week deadline', async t => {
  const native = makeHost(); const notices = [];
  native.host.showNotice = (...args) => notices.push(args);
  const { body } = await sidebar(t, native);
  body.querySelector('.td-quick-input').value = 'Check supplementary methods';
  native.failWrites(true); body.querySelector('.td-quick-submit').click();
  await waitFor(() => notices.some(notice => notice[0] === '保存失败'));
  assert.equal(body.querySelector('.td-quick-input').value, 'Check supplementary methods');
  assert.equal(body.querySelector('.td-quick-submit').disabled, false);
  native.failWrites(false); body.querySelector('.td-quick-submit').click();
  await waitFor(() => native.disk().tasks.length === 1);
  assert.equal(native.disk().tasks[0].title, 'Check supplementary methods');
  assert.equal(native.disk().tasks[0].dueDate, nextWeek());
});

test('a linked-note failure after commit does not reject a successfully created task', async () => {
  const native = makeHost();
  native.host.syncLinkedTaskChanges = async () => { throw new Error('note is read-only'); };
  const result = await native.host.addLiteratureReadingTask(paper());
  assert.equal(result.created, true);
  assert.equal(native.disk().tasks.length, 1);
  assert(native.logs.some(message => message.includes('note is read-only')));
});

test('sidebar uses async rendering and ignores stale loads when selection changes', async t => {
  const native = makeHost(); const { doc, body, pane } = await sidebar(t, native);
  let resolveOld;
  const load = native.host.loadData.bind(native.host);
  native.host.loadData = () => new Promise(resolve => { resolveOld = resolve; });
  const oldRender = pane.onAsyncRender({ doc, body, item: paper('OLD') });
  const selected = paper('NEW', 2);
  pane.onItemChange({ body, item: selected, setEnabled: () => {} });
  native.host.loadData = load;
  assert.equal(pane.onRender({ doc, body, item: selected }), undefined);
  await pane.onAsyncRender({ doc, body, item: selected });
  resolveOld({ tasks: [] }); await oldRender;
  body.querySelector('.td-add-reading').click();
  await waitFor(() => native.disk().tasks.length === 1);
  assert.equal(native.disk().tasks[0].zoteroItemKey, 'NEW');
  assert.equal(native.disk().tasks[0].zoteroLibraryID, 2);
});

test('literature title and shortcut in edit dialog locate the precise Zotero library without submitting', async t => {
  const p = await page(); t.after(p.close);
  const task = await p.TaskManager.addTask({ title: 'Reading', academicType: 'literature_reading',
    zoteroItemKey: 'PAPER', zoteroLibraryID: 2, zoteroItemTitle: 'Paper <with> "quotes"',
    zoteroUri: 'zotero://select/groups/123/items/PAPER' });
  const located = []; p.ZoteroBridge.locateItem = (...args) => located.push(args);
  await p.Modal.openEdit(task.id);
  const link = p.doc.getElementById('btn-modal-literature-link');
  assert.equal(link.type, 'button');
  assert.equal(link.querySelector('.modal-lit-title').textContent, 'Paper <with> "quotes"');
  link.click(); p.doc.getElementById('btn-modal-locate-item').click();
  assert.deepEqual(located, [
    ['zotero://select/groups/123/items/PAPER', 2], ['zotero://select/groups/123/items/PAPER', 2]
  ]);
  assert.equal(p.Modal.dialog.open, true);
  assert.equal(p.TaskManager.getTasks().length, 1);
});

test('host location brings library tab forward and selects resolved group item; missing items give feedback', async () => {
  const native = makeHost(); const events = [];
  const target = paper('PAPER', 2);
  native.context.Zotero.Groups = { getLibraryIDFromGroupID: () => 2 };
  native.context.Zotero.Items.getByLibraryAndKey = (id, key) => id === 2 && key === 'PAPER' ? target : null;
  native.context.Zotero.getMainWindow = () => ({
    focus: () => events.push('focus'),
    Zotero_Tabs: { _tabs: [{ id: 'zotero-pane', type: 'library' }], select: id => events.push(id) },
    ZoteroPane: { selectItem: async id => events.push(id) }
  });
  assert.equal(await native.host.locateLiteratureItem('zotero://select/groups/123/items/PAPER'), true);
  assert.deepEqual(events, ['zotero-pane', 'focus', 20]);
  native.host.showNotice = title => events.push(title);
  assert.equal(await native.host.locateLiteratureItem('MISSING', 2), false);
  assert.equal(events.at(-1), '无法跳转文献');
});

test('create-from-item dialog preserves library identity and defaults to one week', async t => {
  const p = await page(); t.after(p.close);
  p.ZoteroBridge.handleHostNavigation({ mode: 'create_from_item', item: {
    key: 'PAPER', libraryID: 2, title: 'Group paper', zoteroUri: 'zotero://select/groups/123/items/PAPER'
  } });
  assert.equal(p.doc.getElementById('task-due-date').value, nextWeek());
  assert.equal(p.Modal.currentZoteroLiterature.libraryID, 2);
  assert.equal(p.Modal.currentZoteroLiterature.key, 'PAPER');
});
