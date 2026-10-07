const test = require('node:test');
const assert = require('node:assert/strict');
const { page, makeHost, copy } = require('./helpers.cjs');

test('two windows start/stop the same timer without resetting it or double-counting history', async t => {
  const native = makeHost();
  const a = await page('index.html', null, native.host); t.after(a.close);
  const b = await page('sidepanel.html', null, native.host); t.after(b.close);
  const task = await a.TaskManager.addTask({ title: 'Shared timer' });
  await Promise.all([a.TimeTracking.startTimer(task.id), b.TimeTracking.startTimer(task.id)]);
  const first = native.disk().activeTimers[task.id].startTime;
  await b.TimeTracking.startTimer(task.id);
  assert.equal(native.disk().activeTimers[task.id].startTime, first);
  await Promise.all([a.TimeTracking.stopTimer(task.id), b.TimeTracking.stopTimer(task.id), a.TimeTracking.stopTimer(task.id)]);
  assert.equal(native.disk().tasks[0].timeEntries.length, 1);
  assert.deepEqual(native.disk().activeTimers, {});
  await a.TimeTracking.startTimer(task.id);
  const restarted = native.disk().activeTimers[task.id];
  await native.host.saveData({ timerAction: { type: 'stop', taskId: task.id, startTime: first - 1, stoppedAt: Date.now() } });
  assert.deepEqual(native.disk().activeTimers[task.id], restarted);
});

test('local repeated stop is idempotent; deleted tasks never acquire orphan timers', async t => {
  const p = await page(); t.after(p.close);
  const task = await p.TaskManager.addTask({ title: 'Local timer' });
  await p.TimeTracking.startTimer(task.id);
  await Promise.all([p.TimeTracking.stopTimer(task.id), p.TimeTracking.stopTimer(task.id)]);
  assert.equal((await p.Storage.getAll()).tasks[0].timeEntries.length, 1);
  await p.TaskManager.deleteTask(task.id);
  assert.equal(await p.TimeTracking.startTimer(task.id), null);
  assert.deepEqual(copy((await p.Storage.getAll()).activeTimers), {});
});

test('backup validation rejects the entire payload and preserves data on failure', async t => {
  const native = makeHost();
  const p = await page('index.html', null, native.host); t.after(p.close);
  const task = await p.TaskManager.addTask({ title: 'Original' });
  const original = native.disk();
  const importFile = data => new p.win.File([JSON.stringify(data)], 'backup.json', { type: 'application/json' });
  for (const payload of [
    { tasks: [{ ...task, id: 'new' }, { id: 'bad', completed: false }] },
    { tasks: [task, task] },
    { tasks: [{ ...task, tags: {} }] },
    { tasks: [], customTags: [{ id: 'x' }] },
    { tasks: [], settings: [] }
  ]) {
    await assert.rejects(p.DataManager.importData(importFile(payload), 'replace'));
    assert.deepEqual(native.disk(), original);
  }
  native.failWrites(true);
  await assert.rejects(p.DataManager.importData(importFile({ tasks: [] }), 'replace'), /disk full/);
  assert.deepEqual(native.disk(), original);
});

test('merge retains existing task contents; replace restores templates/history and discards historical timers', async t => {
  const p = await page(); t.after(p.close);
  const task = await p.TaskManager.addTask({ title: 'Current' });
  const importFile = data => new p.win.File([JSON.stringify(data)], 'backup.json');
  const backup = { tasks: [{ ...task, title: 'Old' }, { ...task, id: 'new', title: 'New' }],
    customTags: [{ id: 'tag', name: 'Tag' }], customTemplates: [{ id: 'tpl', name: 'Template', task: { title: 'Template' } }],
    searchHistory: ['query'], activeTimers: { new: { startTime: 1 } } };
  const result = await p.DataManager.importData(importFile(backup), 'merge');
  assert.equal(result.imported, 1);
  assert.equal(p.TaskManager.getTaskById(task.id).title, 'Current');
  await p.DataManager.importData(importFile(backup), 'replace');
  const restored = await p.Storage.getAll();
  assert.equal(restored.tasks[0].title, 'Old');
  assert.deepEqual(copy(restored.activeTimers), {});
  assert.deepEqual(copy(restored.searchHistory), ['query']);
  assert.equal(p.Templates.customTemplates[0].name, 'Template');
  await p.DataManager.importData(importFile({ tasks: [] }), 'replace');
  assert.equal(p.TaskManager.getTasks().length, 0);
});

test('status-only task updates keep completion and subtasks consistent', async t => {
  const p = await page(); t.after(p.close);
  const task = await p.TaskManager.addTask({ title: 'Status', subtasks: [{ id: 's', title: 'Step', completed: false }] });
  await p.TaskManager.updateTask(task.id, { status: 'done' });
  assert.equal(p.TaskManager.getTaskById(task.id).completed, true);
  assert.equal(p.TaskManager.getTaskById(task.id).subtasks[0].completed, true);
  await p.TaskManager.updateTask(task.id, { status: 'in-progress' });
  assert.equal(p.TaskManager.getTaskById(task.id).completed, false);
  assert.equal(p.TaskManager.getTaskById(task.id).status, 'in-progress');
});

test('throwing storage observers cannot turn a committed write into a reported failure', async t => {
  const p = await page(); t.after(p.close);
  const unsubscribe = p.Storage.subscribe(() => { throw new Error('observer failure'); });
  const task = await p.TaskManager.addTask({ title: 'Saved' });
  assert.equal((await p.Storage.getAll()).tasks[0].id, task.id);
  assert.equal(p.TaskManager.getTasks().length, 1);
  unsubscribe();
});

test('saved display settings apply at startup and update live without hiding the completed filter', async t => {
  const p = await page('index.html', { settings: { defaultView: 'kanban', sortOrder: 'alpha', showCompleted: false, theme: 'dark' },
    tasks: [{ id: 'a', title: 'Pending', completed: false }, { id: 'b', title: 'Done', completed: true }] });
  t.after(p.close);
  assert.equal(p.UI.currentView, 'kanban');
  assert.equal(p.UI.currentSortOrder, 'alpha');
  assert.equal(p.doc.querySelectorAll('.kanban-task').length, 1);
  await p.Storage.saveSettings({ defaultView: 'list', theme: 'light', sortOrder: 'priority' });
  assert.equal(p.UI.currentView, 'list');
  assert.equal(p.UI.currentSortOrder, 'priority');
  assert.equal(p.doc.documentElement.dataset.theme, 'light');
  assert.equal(p.doc.querySelectorAll('.task-card').length, 1);
  p.UI.currentFilter = 'completed'; p.UI.render();
  assert.equal(p.doc.querySelectorAll('.task-card').length, 1);
  assert.equal(p.doc.querySelector('.task-card').dataset.taskId, 'b');
});

test('UI changes update linked items after commit, including old and new libraries, and sync failure preserves the task', async t => {
  const native = makeHost();
  const p = await page('index.html', null, native.host); t.after(p.close);
  const effects = [];
  native.host.resolveItemReference = (key, libraryID) => ({ key, libraryID });
  native.host.tagItemOnTaskEvent = async (key, event, libraryID) => {
    effects.push(['tag', key, libraryID]);
    assert.equal(native.disk().tasks.length, 1);
  };
  native.host.getPref = () => true;
  native.host.syncTasksToChildNote = async item => { effects.push(['note', item.key, item.libraryID]); return {}; };
  const task = await p.TaskManager.addTask({ title: 'Linked', zoteroItemKey: 'SAMEKEY', zoteroLibraryID: 1 });
  assert.deepEqual(effects.map(e => e[0]), ['tag', 'note']);
  effects.length = 0;
  await p.TaskManager.updateTask(task.id, { zoteroLibraryID: 2 });
  assert.deepEqual(effects.filter(e => e[0] === 'note').map(e => e[2]).sort(), [1, 2]);
  native.host.syncTasksToChildNote = async () => { throw new Error('note unavailable'); };
  await p.TaskManager.updateTask(task.id, { title: 'Still saved' });
  assert.equal(native.disk().tasks[0].title, 'Still saved');
  assert(native.logs.some(log => log.includes('note unavailable')));
  native.failWrites(true); effects.length = 0;
  await assert.rejects(p.TaskManager.updateTask(task.id, { title: 'Not saved' }), /disk full/);
  assert.equal(effects.length, 0);
});

test('host milestone creation uses additions and unique IDs even when another window commits after its read', async () => {
  const native = makeHost();
  const item = { id: 1, key: 'PAPER', libraryID: 1, title: 'Paper', isRegularItem: () => true };
  native.host.openTodolist = () => {};
  const load = native.host.loadData.bind(native.host);
  let interleaved = false;
  native.host.loadData = async () => {
    const data = await load();
    if (!interleaved) {
      interleaved = true;
      await native.host.saveData({ taskChanges: { added: [{ id: 'other', title: 'Other window', completed: false }] } });
    }
    return data;
  };
  await Promise.all([native.host.createReadingMilestones(item), native.host.createReadingMilestones(item)]);
  assert.equal(native.disk().tasks.length, 3);
  assert.equal(new Set(native.disk().tasks.map(t => t.id)).size, 3);
});

test('native child notes and completion tags isolate matching keys by library and honor content preferences', async () => {
  const tasks = [
    { id: 'user', title: 'User library', completed: false, zoteroItemKey: 'SAME', zoteroLibraryID: 1 },
    { id: 'group', title: 'Group library', completed: true, zoteroItemKey: 'SAME', zoteroLibraryID: 2,
      dueDate: '<img src=x>', description: 'Private quote', subtasks: [{ title: 'Private step' }] }
  ];
  const native = makeHost({ tasks, settings: {} });
  let html;
  const tags = new Set(['待研读']);
  const item = { id: 2, key: 'SAME', libraryID: 2, title: 'Group paper', isRegularItem: () => true,
    getNotes: () => [3], hasTag: tag => tags.has(tag), addTag: tag => tags.add(tag), removeTag: tag => tags.delete(tag), saveTx: async () => {} };
  const note = { isNote: () => true, getNote: () => '[Todolist]', setNote: text => { html = text; }, saveTx: async () => {} };
  native.context.Zotero.Items.get = id => id === 3 ? note : item;
  native.context.Zotero.Items.getByLibraryAndKey = () => item;
  native.host.getPref = (key, fallback) => ({ childNoteTitle: '<Custom>', childNoteIncludeSubtasks: false,
    childNoteIncludeQuotes: false }[key] ?? fallback);
  await native.host.syncTasksToChildNote(item);
  assert(html.includes('Group library'));
  assert(!html.includes('User library'));
  assert(!html.includes('Private quote'));
  assert(!html.includes('Private step'));
  assert(html.includes('&lt;Custom&gt;'));
  assert(!html.includes('<img src=x>'));
  await native.host.tagItemOnTaskEvent('SAME', 'complete_check', 2);
  assert(tags.has('精读已完成'));
  assert(!tags.has('待研读'));
});

test('queued imports merge metadata against the committed state and never persist import commands', async () => {
  const native = makeHost();
  const payload = { tasks: [], customTags: [{ id: 'import', name: 'Imported' }] };
  await Promise.all([
    native.host.saveData({ customTags: [{ id: 'new', name: 'Concurrent' }] }),
    native.host.saveData({ importRequest: { payload, mode: 'merge' } })
  ]);
  assert.deepEqual(native.disk().customTags.map(t => t.id), ['new', 'import']);
  assert.equal(native.disk().importRequest, undefined);
  assert.equal(native.disk().importResult, undefined);
});

test('clear and replacement imports retire previous undo entries only after successful persistence', async t => {
  const native = makeHost(); const p = await page('index.html', null, native.host); t.after(p.close);
  const task = await p.TaskManager.addTask({ title: 'Old task' });
  await p.TaskManager.deleteTask(task.id);
  native.failWrites(true);
  await assert.rejects(p.DataManager.clearAllTasks(), /disk full/);
  assert.equal(p.TaskManager._deletedTasks.length, 1);
  native.failWrites(false);
  await p.DataManager.clearAllTasks();
  assert.equal(await p.TaskManager.undoDelete(), false);
  assert.equal(native.disk().tasks.length, 0);
});

test('a delayed stop cannot consume a new timer session with the same millisecond timestamp', async () => {
  const native = makeHost({ tasks: [{ id: 'task', title: 'Timer', completed: false }], settings: {},
    activeTimers: { task: { sessionId: 'new', startTime: 1000 } } });
  await native.host.saveData({ timerAction: { type: 'stop', taskId: 'task', sessionId: 'old', startTime: 1000, stoppedAt: 2000 } });
  assert.equal(native.disk().activeTimers.task.sessionId, 'new');
  assert.equal(native.disk().tasks[0].timeEntries, undefined);
});

test('subtask note opt-out still updates explicit completion transitions', async () => {
  const native = makeHost(); let notes = 0;
  native.host.getPref = (key, fallback) => key === 'childNoteAutoUpdateOnSubtask' ? false : fallback;
  native.host.resolveItemReference = () => ({});
  native.host.tagItemOnTaskEvent = async () => {};
  native.host.syncTasksToChildNote = async () => { notes++; return {}; };
  const task = { id: 'task', title: 'Reading', zoteroItemKey: 'PAPER', completed: false,
    subtasks: [{ id: 'step', title: 'Step', completed: false }] };
  const partial = { ...task, subtasks: [{ ...task.subtasks[0], completed: true }] };
  await native.host.syncLinkedTaskChanges({ tasks: [task] }, { tasks: [partial] });
  assert.equal(notes, 0);
  await native.host.syncLinkedTaskChanges({ tasks: [task] }, { tasks: [{ ...task, completed: true }] });
  assert.equal(notes, 1);
});
