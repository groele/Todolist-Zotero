const test = require('node:test');
const assert = require('node:assert/strict');
const { page, makeHost, waitFor, read, JSDOM } = require('./helpers.cjs');

test('quick add preserves a failed draft and retries without duplicate Enter submissions', async t => {
  const native = makeHost();
  const p = await page('index.html', null, native.host); t.after(p.close);
  await p.TaskManager.addTask({ title: 'original' });
  native.failWrites(true);
  const enter = input => input.dispatchEvent(new p.win.KeyboardEvent('keypress', { key: 'Enter', bubbles: true }));
  p.doc.getElementById('quick-add-input').value = 'draft';
  enter(p.doc.getElementById('quick-add-input'));
  await waitFor(() => p.win.TodolistDiagnostics.records.length > 0);
  const restored = p.doc.getElementById('quick-add-input');
  assert.equal(restored.value, 'draft');
  assert.equal(restored.disabled, false);
  assert.equal(native.disk().tasks.length, 1);
  assert.match(p.doc.getElementById('toast-message').textContent, /快速添加任务失败.*disk full/);
  native.failWrites(false);
  enter(restored); enter(restored);
  await waitFor(() => native.disk().tasks.length === 2);
  await p.TaskManager._mutationQueue;
  assert.deepEqual(native.disk().tasks.map(task => task.title), ['original', 'draft']);
  assert.equal(p.win.TodolistDiagnostics.records[0].action, '快速添加任务');
  assert.match(p.win.TodolistDiagnostics.records[0].stack, /disk full/);
});

test('subtask addition preserves a failed draft and can retry', async t => {
  const native = makeHost();
  const p = await page('index.html', null, native.host); t.after(p.close);
  const task = await p.TaskManager.addTask({ title: 'parent', subtasks: [{ id: 's', title: 'first', completed: false }] });
  native.failWrites(true);
  const input = p.doc.querySelector('.card-add-subtask-input[data-task-id]');
  input.value = 'subtask draft';
  input.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await waitFor(() => p.win.TodolistDiagnostics.records.length > 0);
  const restored = p.doc.querySelector('.card-add-subtask-input[data-task-id]');
  assert.equal(restored.value, 'subtask draft');
  assert.equal(native.disk().tasks[0].subtasks.length, 1);
  native.failWrites(false);
  restored.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await waitFor(() => p.TaskManager.getTaskById(task.id).subtasks.length === 2);
});

for (const kind of ['title', 'description', 'subtask']) test(kind + ' inline edit retains failed draft and retries', async t => {
  const native = makeHost();
  const p = await page('index.html', null, native.host); t.after(p.close);
  await p.TaskManager.addTask({ title: 'original', description: 'description', subtasks: [{ id: 's', title: 'subtask', completed: false }] });
  const selector = { title: '.task-title', description: '.task-description', subtask: '.card-subtask-text' }[kind];
  p.doc.querySelector(selector).dispatchEvent(new p.win.MouseEvent('dblclick', { bubbles: true }));
  const input = p.doc.activeElement;
  input.value = 'edited draft';
  native.failWrites(true);
  const save = () => input.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: kind === 'description', bubbles: true }));
  save();
  await waitFor(() => p.win.TodolistDiagnostics.records.length > 0);
  assert(input.isConnected);
  assert.equal(input.value, 'edited draft');
  const field = task => kind === 'subtask' ? task.subtasks[0].title : task[kind];
  assert.equal(field(native.disk().tasks[0]), kind === 'title' ? 'original' : kind);
  native.failWrites(false);
  save();
  await waitFor(() => field(native.disk().tasks[0]) === 'edited draft');
});

test('diagnostic writes are bounded, serialized and separate from task storage', async () => {
  const native = makeHost({ tasks: [{ id: 'original', title: 'preserved' }], settings: {}, customTags: [] });
  await Promise.all(Array.from({ length: 65 }, (_, i) => native.host.recordDiagnostic({ action: 'probe-' + i, message: 'reason', stack: 'trace' })));
  assert.equal(native.diagnostics().length, 50);
  assert.equal(native.diagnostics()[0].action, 'probe-15');
  assert.equal(native.diagnostics()[49].action, 'probe-64');
  assert.equal(native.disk().tasks[0].title, 'preserved');
  assert.equal(native.writes(), 0);
  native.failWrites(true);
  await native.host.recordDiagnostic({ action: 'cannot write' });
  assert.match(native.logs.at(-1), /Diagnostic log write failed/);
  native.failWrites(false);
  await native.host.recordDiagnostic({ action: 'recovered' });
  assert.equal(native.diagnostics().at(-1).action, 'recovered');
});

function bridgeFixture(t, host) {
  const dom = new JSDOM('<html><body></body></html>', { url: 'https://test.invalid/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  dom.window.Zotero = { Todolist: host };
  dom.window.eval('const Storage = {getZoteroInstance: () => window.Zotero, acceptData: () => {}}; const Diagnostics = { report: () => {} };\n' + read('chrome/content/js/zoteroBridge.js') + '\nwindow.bridge = ZoteroBridge;');
  return dom.window;
}

test('direct bridge initialization reports the underlying error immediately', async t => {
  const win = bridgeFixture(t, { loadData: async () => { throw new Error('read denied'); } });
  win.bridge.init();
  await assert.rejects(win.bridge.whenReady(), /read denied/);
});

test('message bridge initialization failure rejects readiness', async t => {
  const win = bridgeFixture(t, { loadData: () => new Promise(() => {}) });
  win.bridge.init();
  win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'TODOLIST_INIT_ERROR', error: 'corrupt JSON' } }));
  await assert.rejects(win.bridge.whenReady(), /corrupt JSON/);
});

test('direct bridge note sync returns a failed response without leaking a rejection', async t => {
  const win = bridgeFixture(t, { resolveItemReference: () => ({ id: 1 }), syncTasksToChildNote: async () => { throw new Error('note denied'); } });
  win.bridge.isZotero = true;
  const result = await win.bridge.syncChildNote('PAPER', 1);
  assert.equal(result.success, false);
  assert.equal(result.error, 'note denied');
  assert.equal(win.bridge._requestCallbacks.size, 0);
});

test('switching to statistics awaits its render and stale results cannot overwrite a newer render', async t => {
  const p = await page(); t.after(p.close);
  let finish;
  p.DataManager.renderStats = () => new Promise(resolve => { finish = resolve; });
  let ready = false;
  const switching = p.UI.switchView('stats').then(() => { ready = true; });
  await waitFor(() => Boolean(finish));
  assert.equal(ready, false);
  p.DataManager.renderStats = async () => '<p>newer statistics</p>';
  await p.UI.showStats();
  finish('<p>stale statistics</p>');
  await switching;
  assert.match(p.doc.getElementById('stats-view').textContent, /newer statistics/);
  assert.deepEqual(p.errors, []);
});

test('a pending statistics render completes safely after its window closes', async () => {
  const p = await page();
  let finish;
  p.DataManager.renderStats = () => new Promise(resolve => { finish = resolve; });
  const rendering = p.UI.switchView('stats');
  await waitFor(() => Boolean(finish));
  p.close();
  finish('<p>statistics</p>');
  await rendering;
  assert.deepEqual(p.errors, []);
});

test('host message failures return the original error and persist a diagnostic', async t => {
  const native = makeHost();
  const main = new JSDOM('<html><body><div id="zotero-pane"><toolbar id="zotero-items-toolbar"></toolbar></div></body></html>');
  const child = new JSDOM('<body></body>');
  t.after(() => { main.window.close(); child.window.close(); });
  main.window.ZoteroPane = {};
  native.host.addToWindow(main.window);
  const replies = [];
  child.window.postMessage = reply => replies.push(reply);
  const send = data => main.window.dispatchEvent(new main.window.MessageEvent('message', { data, source: child.window }));
  native.failReads(new Error('read denied'));
  send({ type: 'TODOLIST_READY' });
  await waitFor(() => replies.some(reply => reply.type === 'TODOLIST_INIT_ERROR'));
  assert.equal(replies.at(-1).error, 'read denied');
  native.failReads(null);
  native.context.Zotero.Items.getByLibraryAndKey = () => ({ id: 1 });
  native.host.syncTasksToChildNote = async () => { throw new Error('note denied'); };
  send({ type: 'TODOLIST_SYNC_NOTE', key: 'PAPER', libraryID: 1, requestId: 'probe' });
  await waitFor(() => replies.some(reply => reply.requestId === 'probe'));
  assert.equal(replies.at(-1).success, false);
  assert.equal(replies.at(-1).error, 'note denied');
  await native.host._diagnosticQueue;
  assert(native.diagnostics().some(record => record.action.includes('TODOLIST_SYNC_NOTE') && record.message === 'note denied'));
});
