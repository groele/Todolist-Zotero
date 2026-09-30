const test = require('node:test');
const assert = require('node:assert/strict');
const { page, makeHost, waitFor, copy, read } = require('./helpers.cjs');

for (const file of ['index.html', 'sidepanel.html']) {
  test(file + ': create, delete, undo, reload persistence and modal deletion', async t => {
    const p = await page(file); t.after(p.close);
    p.Modal.openAdd({ title: '删除回归测试', dueDate: p.Utils.getTodayISO(), academicType: 'writing' });
    assert(p.doc.getElementById('btn-delete-task').classList.contains('hidden'));
    await p.Modal.handleSubmit();
    assert.equal(p.TaskManager.getTasks().length, 1);
    const task = p.TaskManager.getTasks()[0];
    assert.equal(task.academicType, 'writing');
    assert.equal(task.category, '论文写作');
    const button = p.doc.querySelector('.task-action.delete');
    assert.equal(button.textContent.trim(), '删除');
    button.click();
    await waitFor(() => p.TaskManager.getTasks().length === 0 && p.doc.getElementById('toast-message').textContent === '任务已删除');
    assert.equal((await p.Storage.getTasks()).length, 0);
    p.doc.getElementById('toast-action').click();
    await waitFor(() => p.TaskManager.getTasks().length === 1);
    await p.Modal.openEdit(task.id);
    assert(!p.doc.getElementById('btn-delete-task').classList.contains('hidden'));
    p.doc.getElementById('btn-delete-task').click();
    await waitFor(() => !p.Modal.dialog.open && p.TaskManager.getTasks().length === 0);
    const reopened = await page(file, await p.Storage.getAll()); t.after(reopened.close);
    assert.equal(reopened.TaskManager.getTasks().length, 0);
    assert.deepEqual(p.errors, []);
  });
  test(file + ': kanban completion, delete and undo use actual DOM events', async t => {
    const p = await page(file); t.after(p.close);
    const task = await p.TaskManager.addTask({ title: '看板任务', dueDate: p.Utils.getTodayISO() });
    await p.UI.switchView('kanban');
    p.doc.querySelector('.kanban-task-checkbox').click();
    await waitFor(() => p.TaskManager.getTaskById(task.id)?.completed);
    assert(p.doc.querySelector('.kanban-column.done .kanban-task'));
    assert.match(p.doc.getElementById('header-progress-widget').textContent, /1\/1 \(100%\)/);
    p.doc.querySelector('.kanban-delete').click();
    await waitFor(() => p.TaskManager.getTasks().length === 0 && p.doc.getElementById('toast-message').textContent === '任务已删除');
    assert(!p.Modal.dialog.open);
    p.doc.getElementById('toast-action').click();
    await waitFor(() => p.TaskManager.getTasks().length === 1);
    assert.deepEqual(p.errors, []);
  });
}

test('sequential and batch deletes restore exact IDs, order, subtasks and metadata', async t => {
  const p = await page(); t.after(p.close);
  const tasks = [];
  for (let i = 0; i < 5; i++) tasks.push(await p.TaskManager.addTask({ title: 'Task ' + i,
    subtasks: [{ id: 'sub' + i, title: 'subtask', completed: false }], zoteroPage: 12, zoteroQuote: 'quote' }));
  await p.TaskManager.deleteTask(tasks[1].id);
  await p.TaskManager.deleteTask(tasks[3].id);
  await p.TaskManager.undoDelete();
  assert.deepEqual(copy(p.TaskManager.getTasks()).map(t => t.id), tasks.map(t => t.id));
  for (const task of tasks) p.TaskManager.toggleSelection(task.id);
  assert.equal(await p.TaskManager.batchDelete(), 5);
  assert.equal(p.TaskManager.getSelectedCount(), 0);
  await p.TaskManager.undoDelete();
  assert.deepEqual(copy(p.TaskManager.getTasks()).map(t => t.id), tasks.map(t => t.id));
  assert.equal(p.TaskManager.getTasks()[1].subtasks[0].id, 'sub1');
  assert.equal(p.TaskManager.getTasks()[1].zoteroPage, 12);
});

test('failed deletes and edits leave disk, task cache, selection and undo intact; retry works', async t => {
  const native = makeHost(); const p = await page('index.html', null, native.host); t.after(p.close);
  const task = await p.TaskManager.addTask({ title: '原始任务' });
  p.TaskManager.toggleSelection(task.id);
  native.failWrites(true);
  await assert.rejects(p.TaskManager.deleteTask(task.id), /disk full/);
  assert.equal(p.TaskManager.getTasks().length, 1);
  assert.equal(p.TaskManager.getSelectedCount(), 1);
  assert.equal(p.TaskManager._deletedTasks.length, 0);
  await assert.rejects(p.TaskManager.updateTask(task.id, { title: '失败的编辑' }), /disk full/);
  assert.equal(p.TaskManager.getTaskById(task.id).title, '原始任务');
  assert.equal(native.disk().tasks[0].title, '原始任务');
  native.failWrites(false);
  await p.TaskManager.deleteTask(task.id);
  native.failWrites(true);
  await assert.rejects(p.TaskManager.undoDelete(), /disk full/);
  assert.equal(p.TaskManager.getTasks().length, 0);
  assert.equal(p.TaskManager._deletedTasks.length, 1);
  native.failWrites(false);
  await p.TaskManager.undoDelete();
  assert.equal(p.TaskManager.getTasks().length, 1);
});

test('queued rapid additions, edits, and deletions never overwrite neighboring tasks', async t => {
  const p = await page(); t.after(p.close);
  await Promise.all(Array.from({ length: 12 }, (_, i) => p.TaskManager.addTask({ title: 'Task ' + i })));
  assert.equal(p.TaskManager.getTasks().length, 12);
  const tasks = copy(p.TaskManager.getTasks());
  await Promise.all(tasks.slice(0, 6).map(task => p.TaskManager.deleteTask(task.id)));
  assert.equal((await p.Storage.getTasks()).length, 6);
  await p.TaskManager.undoDelete();
  assert.equal(p.TaskManager.getTasks().length, 12);
});

test('completion transitions synchronize parent and children across all mutation paths', async t => {
  const p = await page(); t.after(p.close);
  const task = await p.TaskManager.addTask({ title: 'Parent', subtasks: [
    { id: 'a', title: 'A', completed: true }, { id: 'b', title: 'B', completed: false }] });
  await p.TaskManager.deleteSubtask(task.id, 'b');
  assert(p.TaskManager.getTaskById(task.id).completed);
  await p.TaskManager.addSubtask(task.id, 'C');
  assert(!p.TaskManager.getTaskById(task.id).completed);
  p.TaskManager.toggleSelection(task.id);
  await p.TaskManager.batchComplete();
  assert(p.TaskManager.getTaskById(task.id).subtasks.every(s => s.completed));
  await p.TaskManager.toggleSubtask(task.id, 'a');
  assert(!p.TaskManager.getTaskById(task.id).completed);
  await p.TaskManager.moveTaskToKanbanColumn(task.id, 'done');
  assert(p.TaskManager.getTaskById(task.id).subtasks.every(s => s.completed));
  await p.TaskManager.updateTask(task.id, { subtasks: [{ id: 'a', title: 'A', completed: false }] });
  assert(!p.TaskManager.getTaskById(task.id).completed);
  assert.equal(p.TaskManager.getTaskById(task.id).completedAt, null);
});

test('copies reset status, timers, reminders and recurrence while preserving literature anchors', async t => {
  const p = await page(); t.after(p.close);
  const task = await p.TaskManager.addTask({ title: 'Paper', completed: true, zoteroPage: 9,
    zoteroQuote: 'quoted text', zoteroPublication: 'Journal', zoteroLibraryID: 22,
    reminder: { enabled: true, before: 15, notified: true }, subtasks: [{ id: 'a', title: 'A', completed: true }] });
  await p.TaskManager.updateTask(task.id, { timeEntries: [{ date: new Date().toISOString(), duration: 90000 }], recurringGenerated: true });
  const duplicate = await p.TaskManager.duplicateTask(task.id);
  assert.equal(duplicate.status, 'todo');
  assert.equal(duplicate.completed, false);
  assert.equal(duplicate.recurringGenerated, false);
  assert.equal(duplicate.reminder.notified, false);
  assert.equal(duplicate.timeEntries.length, 0);
  assert.equal(duplicate.zoteroLibraryID, 22);
  assert.equal(duplicate.zoteroQuote, 'quoted text');
  assert.notEqual(duplicate.subtasks[0].id, 'a');
  assert(!duplicate.subtasks[0].completed);
});

test('quick date pills persist ISO dates and kanban quick-add honors the chosen column', async t => {
  const p = await page(); t.after(p.close);
  p.Modal.openAdd({ title: '日期快捷键' });
  p.doc.querySelector('.date-pill[data-date="tomorrow"]').click();
  const tomorrow = new p.win.Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  assert.equal(p.doc.getElementById('task-due-date').value, p.Utils.toDateISO(tomorrow));
  await p.Modal.handleSubmit();
  await p.UI.switchView('kanban');
  p.doc.querySelector('.kanban-quick-add-btn[data-column="in-progress"]').click();
  p.doc.getElementById('task-title').value = '进行中任务';
  await p.Modal.handleSubmit();
  assert.equal(p.TaskManager.getTasks().find(t => t.title === '进行中任务').status, 'in-progress');
  p.doc.querySelector('.kanban-quick-add-btn[data-column="done"]').click();
  p.doc.getElementById('task-title').value = '完成列新任务';
  await p.Modal.handleSubmit();
  assert(p.TaskManager.getTasks().find(t => t.title === '完成列新任务').completed);
});

test('kanban drag preserves due dates; list reorder computes indices after removing source', async t => {
  const p = await page(); t.after(p.close);
  const a = await p.TaskManager.addTask({ title: 'A', dueDate: '2020-01-01' });
  const b = await p.TaskManager.addTask({ title: 'B' });
  const c = await p.TaskManager.addTask({ title: 'C' });
  await p.TaskManager.moveTaskToKanbanColumn(a.id, 'in-progress');
  assert.equal(p.TaskManager.getTaskById(a.id).dueDate, '2020-01-01');
  assert.equal(p.TaskManager.getKanbanStatus(p.TaskManager.getTaskById(a.id)), 'overdue');
  assert.equal(await p.TaskManager.moveTaskToKanbanColumn(b.id, 'overdue'), null);
  await p.TaskManager.moveTaskInList(a.id, c.id, false, null);
  assert.deepEqual(copy(p.TaskManager.getTasks()).map(t => t.title), ['B', 'A', 'C']);
  await p.TaskManager.moveTaskInList(a.id, c.id, true, null);
  assert.deepEqual(copy(p.TaskManager.getTasks()).map(t => t.title), ['B', 'C', 'A']);
});

test('monthly/yearly recurrence clamps month end, preserves metadata, and never regenerates a deleted next instance', async t => {
  const p = await page(); t.after(p.close);
  assert.equal(p.Recurring.getNextDueDate('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(p.Recurring.getNextDueDate('2024-02-29', 'yearly'), '2025-02-28');
  assert.equal(p.Recurring.getNextDueDate('2026-02-31', 'monthly'), null);
  const task = await p.TaskManager.addTask({ title: 'Recurring', repeat: 'monthly', dueDate: '2026-01-31', zoteroItemKey: 'PAPER', zoteroPage: 8 });
  await p.TaskManager.toggleComplete(task.id);
  const next = p.TaskManager.getTasks().find(t => t.recurringFrom === task.id);
  assert.equal(next.dueDate, '2026-02-28');
  assert.equal(next.zoteroPage, 8);
  await p.TaskManager.toggleComplete(task.id);
  await p.TaskManager.toggleComplete(task.id);
  assert.equal(p.TaskManager.getTasks().length, 2);
  await p.TaskManager.deleteTask(next.id);
  await p.TaskManager.updateTask(task.id, { description: 'Edit after deletion' });
  assert.equal(p.TaskManager.getTasks().length, 1);
});

test('timer history and timer removal are atomic; edits and deletes cannot lose or resurrect timer data', async t => {
  const native = makeHost(); const p = await page('index.html', null, native.host); t.after(p.close);
  const task = await p.TaskManager.addTask({ title: 'Timer task' });
  await p.TimeTracking.startTimer(task.id);
  native.failWrites(true);
  await assert.rejects(p.TimeTracking.stopTimer(task.id));
  assert(p.TimeTracking.isTimerRunning(task.id));
  assert.equal(native.disk().tasks[0].timeEntries, undefined);
  native.failWrites(false);
  await p.TimeTracking.stopTimer(task.id);
  await p.TaskManager.updateTask(task.id, { description: 'later edit' });
  assert.equal(native.disk().tasks[0].timeEntries.length, 1);
  assert.equal(Object.keys(native.disk().activeTimers).length, 0);
  await p.TimeTracking.startTimer(task.id);
  await p.TaskManager.deleteTask(task.id);
  assert(!p.TimeTracking.isTimerRunning(task.id));
  assert.equal(Object.keys(native.disk().activeTimers).length, 0);
});

test('all filters work in list and kanban, including custom tags and literature titles', async t => {
  const p = await page(); t.after(p.close);
  const tag = await p.Tags.addCustomTag('特殊标签', '#ef4444');
  const task = await p.TaskManager.addTask({ title: 'A', tags: [tag.id], zoteroItemTitle: 'Unique Paper', priority: 'high' });
  await p.TaskManager.addTask({ title: 'B', priority: 'low' });
  assert.equal(p.TaskManager.getFilteredTasks({ search: '特殊标签' }).length, 1);
  assert.equal(p.TaskManager.getFilteredTasks({ search: 'Unique Paper' }).length, 1);
  p.UI.currentPriorityFilter = 'high'; await p.UI.switchView('kanban');
  assert.equal(p.doc.querySelectorAll('.kanban-task').length, 1);
  assert.equal(p.doc.querySelector('.kanban-task').dataset.taskId, task.id);
});

test('quoted titles and imported IDs cannot create event attributes in rendered cards', async t => {
  const p = await page(); t.after(p.close);
  await p.Storage.saveAll({ tasks: [{ id: 'x" onclick="injected()', title: '<img src=x onerror=alert(1)>', completed: false,
    priority: 'medium', zoteroItemKey: 'P" onclick="injected()', zoteroItemTitle: 'Paper" onclick="injected()',
    subtasks: [{ id: 's" onclick="injected()', title: 'Subtask', completed: false }] }] });
  await p.TaskManager.loadTasks(); p.UI.render();
  assert.equal(p.doc.querySelectorAll('[onclick], [onerror]').length, 0);
  assert.equal(p.doc.querySelectorAll('.task-content img').length, 0);
  assert.equal(p.doc.querySelector('.task-card').dataset.taskId, 'x" onclick="injected()');
  await p.UI.switchView('kanban');
  assert.equal(p.doc.querySelectorAll('[onclick], [onerror]').length, 0);
});

test('empty titles are rejected at the model layer', async t => {
  const p = await page(); t.after(p.close);
  await assert.rejects(p.TaskManager.addTask({ title: '  ' }), /不能为空/);
  const task = await p.TaskManager.addTask({ title: 'A' });
  await assert.rejects(p.TaskManager.updateTask(task.id, { title: '' }), /不能为空/);
  await assert.rejects(p.TaskManager.addSubtask(task.id, ' '), /不能为空/);
});

test('custom tag/template data and print output are escaped before HTML rendering', async t => {
  const p = await page(); t.after(p.close);
  const attack = '<img src=x onerror=alert(1)>';
  p.Tags.customTags = [{ id: 'tag" onfocus="alert(1)', name: attack, color: 'red;" onmouseover="alert(1)', icon: '<svg onload=alert(1)>' }];
  p.Templates.customTemplates = [{ id: 'tpl" onclick="alert(1)', name: attack, icon: '<svg onload=alert(1)>',
    task: { subtasks: [] } }];

  const fragments = [p.Tags.renderCustomTagsManager(), p.Tags.renderTagSelector(), p.Tags.renderTagBadges(['tag" onfocus="alert(1)']),
    p.Templates.renderTemplatesPanel()];
  for (const html of fragments) {
    const holder = p.doc.createElement('div');
    holder.innerHTML = html;
    assert.equal(holder.querySelectorAll('[onerror], [onload], [onfocus], [onclick], [onmouseover]').length, 0);
    assert.equal(holder.querySelector('img'), null);
  }

  await p.Storage.saveAll({ tasks: [{ id: 'x', title: attack, description: attack, category: attack, completed: false, priority: 'medium' }] });
  const stats = await p.DataManager.renderStats();
  assert(!stats.includes('<img src=x'));

  let printed = '';
  p.win.open = () => ({ document: { write: value => { printed = value; }, close() {} }, focus() {} });
  p.Advanced.printTasks([{ id: 'x', title: attack, description: attack, category: attack, completed: false, priority: 'high' }]);
  assert(!printed.includes('<img src=x'));
  assert(printed.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('failed custom tag/template writes roll back their in-memory state', async t => {
  const native = makeHost(); const p = await page('index.html', null, native.host); t.after(p.close);
  native.failWrites(true);
  await assert.rejects(p.Tags.addCustomTag('科研', '#3b82f6'), /disk full/);
  await assert.rejects(p.Templates.addCustomTemplate('模板', { title: 'Task' }), /disk full/);
  assert.equal(p.Tags.customTags.length, 0);
  assert.equal(p.Templates.customTemplates.length, 0);
});
