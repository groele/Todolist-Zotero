const test = require('node:test');
const assert = require('node:assert/strict');
const { page, makeHost, waitFor, copy, read, JSDOM } = require('./helpers.cjs');

test('two windows merge independent edits/additions/deletions and reload the saved state', async t => {
  const native = makeHost();
  const a = await page('index.html', null, native.host); t.after(a.close);
  const b = await page('sidepanel.html', null, native.host); t.after(b.close);
  const [ta, tb] = await Promise.all([a.TaskManager.addTask({ title: 'A' }), b.TaskManager.addTask({ title: 'B' })]);
  assert.equal(native.disk().tasks.length, 2);
  await Promise.all([a.TaskManager.updateTask(ta.id, { title: 'A edited' }), b.TaskManager.updateTask(tb.id, { title: 'B edited' })]);
  assert.deepEqual(native.disk().tasks.map(t => t.title).sort(), ['A edited', 'B edited']);
  const stale = copy((await b.Storage.getTasks()));
  await a.TaskManager.deleteTask(ta.id);
  stale.find(task => task.id === tb.id).description = 'stale-window edit';
  await b.Storage.saveTasks(stale, stale.map(task => ({ ...task, description: '' })));
  assert.equal(native.disk().tasks.length, 1);
  assert.equal(native.disk().tasks[0].id, tb.id);
  assert.equal(native.disk().tasks[0].description, 'stale-window edit');
  assert.equal(a.TaskManager.getTasks().length, 1);
  assert.equal(b.TaskManager.getTasks().length, 1);
  const reopened = await page('index.html', null, native.host); t.after(reopened.close);
  assert.equal(reopened.TaskManager.getTasks().length, 1);
});

test('host snapshots and listener payloads cannot mutate the saved cache', async () => {
  const native = makeHost({ tasks: [{ id: 'a', title: 'Original', completed: false }], settings: { theme: 'light' } });
  const data = await native.host.loadData(); data.tasks[0].title = 'Leaked edit';
  assert.equal((await native.host.loadData()).tasks[0].title, 'Original');
  native.host.registerDataListener(data => { data.tasks.length = 0; });
  await native.host.saveData({ settings: { theme: 'dark' } });
  assert.equal((await native.host.loadData()).tasks.length, 1);
});

test('host read errors propagate and never overwrite the original data with an empty file', async () => {
  const native = makeHost({ tasks: [{ id: 'a', title: 'Original' }] });
  native.failReads(new Error('simulated corrupted JSON'));
  await assert.rejects(native.host.loadData(), /corrupted/);
  await assert.rejects(native.host.saveData({ tasks: [] }), /corrupted/);
  assert.equal(native.writes(), 0);
  assert.equal(native.disk().tasks.length, 1);
});

test('host write queue serializes atomic writes and recovers after a failed write', async () => {
  const native = makeHost();
  await Promise.all(Array.from({ length: 8 }, (_, i) => native.host.saveData({ taskChanges: { added: [{ id: 't' + i, title: 'T' + i }] } })));
  assert.equal(native.disk().tasks.length, 8);
  native.failWrites(true);
  await assert.rejects(native.host.saveData({ taskChanges: { deleted: ['t0'] } }));
  assert.equal((await native.host.loadData()).tasks.length, 8);
  native.failWrites(false);
  await native.host.saveData({ taskChanges: { deleted: ['t0'] } });
  assert.equal(native.disk().tasks.length, 7);
});

test('native side-pane deletion is visible, preserves newer tasks, and supports undo', async t => {
  const target = { id: 1, key: 'PAPER', libraryID: 1, isRegularItem: () => true,
    getField: field => field === 'title' ? 'Test Paper' : '', getCreators: () => [], getTags: () => [] };
  const native = makeHost({ tasks: [{ id: 'a', title: 'Delete me', completed: false, zoteroItemKey: 'PAPER', subtasks: [] }], settings: {}, customTags: [] });
  native.context.Zotero.Items.getByLibraryAndKey = () => target;
  const dom = new JSDOM('<body><div id="pane"></div></body>'); t.after(() => dom.window.close());
  const doc = dom.window.document, body = doc.getElementById('pane');
  native.host.registerItemPaneSection();
  const pane = native.pane();
  let render;
  const refresh = () => { render = pane.onRender({ doc, body, item: target }); return render; };
  pane.onInit({ doc, body, item: target, refresh });
  t.after(() => { pane.onDestroy({ body }); clearTimeout(native.host._paneUndoTimer); });
  await refresh();
  const deleteButton = body.querySelector('.td-task-delete');
  assert.equal(deleteButton.textContent, '删除');
  await native.host.saveData({ taskChanges: { added: [{ id: 'b', title: 'Newer task', completed: false, zoteroItemKey: 'PAPER' }] } });
  deleteButton.click();
  await waitFor(() => native.disk().tasks.length === 1);
  await waitFor(() => [...body.querySelectorAll('button')].some(b => b.textContent.startsWith('撤销删除')));
  assert.equal(native.disk().tasks[0].id, 'b');
  const undoButton = [...body.querySelectorAll('button')].find(b => b.textContent.startsWith('撤销删除'));
  undoButton.click();
  await waitFor(() => native.disk().tasks.length === 2);
  assert.equal(native.disk().tasks.find(t => t.id === 'a').title, 'Delete me');
});

test('native side-pane completion persists status and subtask completion; recurrence uses shared rules', async t => {
  const target = { id: 1, key: 'PAPER', libraryID: 1, isRegularItem: () => true,
    getField: () => 'Paper', getCreators: () => [], getTags: () => [] };
  const native = makeHost({ tasks: [{ id: 'a', title: 'Monthly', completed: false, repeat: 'monthly', dueDate: '2026-01-31',
    zoteroItemKey: 'PAPER', subtasks: [{ id: 's', title: 'Read', completed: false }] }], settings: {} });
  native.context.Zotero.Items.getByLibraryAndKey = () => target;
  const dom = new JSDOM('<body><div id="pane"></div></body>'); t.after(() => dom.window.close());
  const doc = dom.window.document, body = doc.getElementById('pane');
  native.host.registerItemPaneSection(); const pane = native.pane();
  pane.onInit({ doc, body, item: target, refresh: () => {} }); t.after(() => pane.onDestroy({ body }));
  await pane.onRender({ doc, body, item: target });
  const checkbox = body.querySelector('.td-task-row input');
  checkbox.checked = true; checkbox.dispatchEvent(new dom.window.Event('change'));
  await waitFor(() => native.disk().tasks.length === 2);
  const parent = native.disk().tasks.find(t => t.id === 'a');
  assert.equal(parent.status, 'done'); assert(parent.subtasks.every(s => s.completed));
  assert.equal(native.disk().tasks.find(t => t.recurringFrom === 'a').dueDate, '2026-02-28');
});

test('native side-pane quick-add suppresses a double click while saving', async t => {
  const target = { id: 1, key: 'PAPER', libraryID: 1, isRegularItem: () => true,
    getField: () => 'Paper', getCreators: () => [], getTags: () => [] };
  const native = makeHost(); native.context.Zotero.Items.getByLibraryAndKey = () => target;
  const dom = new JSDOM('<body><div id="pane"></div></body>'); t.after(() => dom.window.close());
  const doc = dom.window.document, body = doc.getElementById('pane');
  native.host.registerItemPaneSection(); const pane = native.pane();
  pane.onInit({ doc, body, item: target, refresh: () => {} }); t.after(() => pane.onDestroy({ body }));
  let sectionSummary = '';
  await pane.onRender({ doc, body, item: target, setSectionSummary: value => { sectionSummary = value; } });
  const paneContent = body.querySelector('.td-pane-wrap');
  assert.equal(paneContent.children[0].className, 'td-header-card');
  assert.equal(paneContent.children[1].className, 'td-quick-box');
  assert.equal(sectionSummary, '展开后快速新建');
  assert.equal(body.querySelector('.td-quick-input').getAttribute('aria-label'), '新待办事项');
  assert.equal(body.querySelector('.td-quick-submit').getAttribute('aria-label'), '添加待办任务');
  body.querySelector('.td-quick-input').value = 'New Task';
  const button = body.querySelector('.td-quick-submit'); button.click(); button.click();
  await waitFor(() => native.disk().tasks.length > 0);
  assert.equal(native.disk().tasks.length, 1);
  assert.equal(native.disk().tasks[0].zoteroLibraryID, 1);
});

test('bridge waits for handshake and accepts save success only after a host acknowledgement', async t => {
  const dom = new JSDOM('<body></body>', { url: 'chrome://todolist/content/index.html', runScripts: 'outside-only' }); t.after(() => dom.window.close());
  const parent = new JSDOM('<body></body>', { url: 'https://host.test/' }); t.after(() => parent.window.close());
  const win = dom.window; const messages = [];
  parent.window.postMessage = msg => messages.push(msg);
  Object.defineProperty(win, 'parent', { value: parent.window });
  win.eval(read('chrome/content/js/storage.js') + read('chrome/content/js/zoteroBridge.js') + '\nwindow.__test = {Storage, ZoteroBridge};');
  const { Storage, ZoteroBridge } = win.__test;
  let loaded = false; const get = Storage.getAll().then(data => { loaded = true; return data; });
  await new Promise(resolve => setTimeout(resolve, 10)); assert(!loaded);
  win.dispatchEvent(new win.MessageEvent('message', { source: parent.window, data: { type: 'TODOLIST_INIT_DATA', data: { tasks: [{ id: 'a', title: 'Host task' }] } } }));
  assert.equal((await get).tasks.length, 1);
  const save = Storage.saveAll({ settings: { theme: 'dark' } }); let saved = false; save.then(() => { saved = true; });
  await waitFor(() => messages.some(m => m.type === 'TODOLIST_STORAGE_SET'));
  assert(!saved);
  const request = messages.find(m => m.type === 'TODOLIST_STORAGE_SET');
  win.dispatchEvent(new win.MessageEvent('message', { source: parent.window, data: { requestId: request.requestId, success: true,
    data: { tasks: [{ id: 'a', title: 'Host task' }], settings: { theme: 'dark' } } } }));
  assert.equal((await save).settings.theme, 'dark');
  const failure = ZoteroBridge.saveStorage({ tasks: [] });
  const failRequest = messages.at(-1);
  win.dispatchEvent(new win.MessageEvent('message', { source: parent.window, data: { requestId: failRequest.requestId, success: false, error: 'disk full' } }));
  await assert.rejects(failure, /disk full/);
});

test('lower-revision notifications cannot roll a window back to stale data', async t => {
  const p = await page(); t.after(p.close);
  p.Storage.acceptData({ tasks: [{ id: 'new', title: 'Current' }], revision: 5 });
  p.Storage.acceptData({ tasks: [], revision: 4 });
  assert.equal(p.TaskManager.getTasks().length, 1);
  assert.equal(p.TaskManager.getTasks()[0].id, 'new');
});

test('secondary dialog panels (like 插件市场) never receive toolbar button and any rogue button is removed', async t => {
  const native = makeHost();

  // 1. Secondary dialog (e.g. 插件市场, 偏好设置) with its own toolbar
  const dialogDom = new JSDOM('<!DOCTYPE html><html><head><title>插件市场</title></head><body><toolbar id="market-bottom-toolbar"><button id="existing-btn">Source</button></toolbar></body></html>');
  t.after(() => dialogDom.window.close());
  const dialogWin = dialogDom.window;
  const dialogDoc = dialogWin.document;

  // Simulate an already-injected rogue button
  const rogueBtn = dialogDoc.createElement('button');
  rogueBtn.id = 'todolist-toolbar-button';
  dialogDoc.getElementById('market-bottom-toolbar').appendChild(rogueBtn);
  assert(dialogDoc.getElementById('todolist-toolbar-button'));

  // Run addToWindow on the secondary dialog
  native.host.addToWindow(dialogWin);

  // Assert rogue button was purged and no Todolist button or menu was added
  assert.equal(dialogDoc.getElementById('todolist-toolbar-button'), null);
  assert.equal(dialogDoc.getElementById('todolist-tools-menu'), null);

  // 2. Main Zotero library window with items toolbar
  const mainDom = new JSDOM('<!DOCTYPE html><html><head><title>Zotero</title></head><body><div id="zotero-pane"><toolbar id="zotero-items-toolbar"><button id="btn1">Sync</button></toolbar></div></body></html>');
  t.after(() => mainDom.window.close());
  const mainWin = mainDom.window;
  mainWin.ZoteroPane = {};
  const mainDoc = mainWin.document;

  native.host.addToWindow(mainWin);
  assert(mainDoc.getElementById('todolist-toolbar-button'));
  assert.equal(mainDoc.getElementById('todolist-toolbar-button').getAttribute('label'), 'Todolist');
});

test('preference changes persist only their own key and log async host failures', async t => {
  const dom = new JSDOM('<!doctype html><html><body><div id="todolist-preferences-pane"></div>' +
    '<p id="todolist-pref-status"></p><div id="todolist-pref-window"></div><div id="todolist-pref-view"></div>' +
    '<div id="todolist-pref-literature"></div><div id="todolist-pref-sync"></div><div id="todolist-pref-tags"></div>' +
    '<div id="todolist-pref-academic"></div><div id="todolist-pref-focus"></div><div id="todolist-pref-maintenance"></div>' +
    '</body></html>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const win = dom.window;
  const writes = [];
  const logs = [];
  const preferences = new Map();
  win.Zotero = {
    Prefs: { get: key => preferences.get(key), set: (key, value) => preferences.set(key, value) },
    logError: message => logs.push(String(message)),
    Todolist: { saveData: async patch => { writes.push(patch); } }
  };
  win.eval(read('chrome/content/scripts/preferences.js'));
  win.Todolist_Preferences.init(win);

  const rows = [...win.document.querySelectorAll('#todolist-pref-sync label')];
  const includesSubtasks = rows.find(row => row.textContent.includes('完整的子任务里程碑清单'))?.querySelector('input');
  const includesQuotes = rows.find(row => row.textContent.includes('PDF 摘录内容与定位链接'))?.querySelector('input');
  assert(includesSubtasks && includesQuotes);
  includesSubtasks.checked = false;
  includesQuotes.checked = false;
  includesSubtasks.dispatchEvent(new win.Event('change'));
  includesQuotes.dispatchEvent(new win.Event('change'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [
    { settings: { childNoteIncludeSubtasks: false } },
    { settings: { childNoteIncludeQuotes: false } }
  ]);

  win.Zotero.Todolist.saveData = async () => { throw new Error('simulated write failure'); };
  includesQuotes.checked = true;
  includesQuotes.dispatchEvent(new win.Event('change'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(logs.some(message => message.includes('保存设置') && message.includes('simulated write failure')));
  assert.equal(includesQuotes.checked, false);
  assert.equal(preferences.get('extensions.todolist.childNoteIncludeQuotes'), false);
  assert.match(win.document.getElementById('todolist-pref-status').textContent, /保存设置失败/);
});
