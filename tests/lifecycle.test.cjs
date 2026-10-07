const test = require('node:test');
const assert = require('node:assert/strict');
const { page, makeHost } = require('./helpers.cjs');

test('clearing from a second window retires the first window undo buffer', async t => {
  const native = makeHost();
  const a = await page('index.html', null, native.host); t.after(a.close);
  const b = await page('sidepanel.html', null, native.host); t.after(b.close);
  const task = await a.TaskManager.addTask({ title: 'Must stay cleared' });
  await a.TaskManager.deleteTask(task.id);
  await b.DataManager.clearAllTasks();
  assert.equal(await a.TaskManager.undoDelete(), false);
  assert.equal(native.disk().tasks.length, 0);
});

test('two windows deliver only one due reminder and acknowledge it', async t => {
  const native = makeHost();
  const a = await page('index.html', null, native.host); t.after(a.close);
  const b = await page('sidepanel.html', null, native.host); t.after(b.close);
  const due = new Date(Date.now() + 10 * 60000);
  const dueDate = a.Utils.toDateISO(due), dueTime = due.toTimeString().slice(0, 5);
  await a.TaskManager.addTask({ title: 'Remind once', dueDate, dueTime,
    reminder: { enabled: true, before: 15, notified: false } });
  let delivered = 0;
  for (const p of [a, b]) p.Notifications.show = async () => {
    delivered++; await new Promise(resolve => setTimeout(resolve, 15)); return true;
  };
  await Promise.all([a.Notifications.checkReminders(), b.Notifications.checkReminders()]);
  assert.equal(delivered, 1);
  assert.equal(native.disk().tasks[0].reminder.notified, true);
});

test('a reminder-setting edit re-arms a previously delivered reminder', async t => {
  const p = await page(); t.after(p.close);
  const task = await p.TaskManager.addTask({ title: 'Changed reminder', dueDate: '2030-01-01', dueTime: '09:00',
    reminder: { enabled: true, before: 15, notified: true } });
  await p.TaskManager.updateTask(task.id, { reminder: { enabled: true, before: 30 } });
  assert.equal(p.TaskManager.getTaskById(task.id).reminder.notified, false);
});

test('a stale task mutation cannot resurrect data after another window replaces the task collection', async t => {
  const native = makeHost();
  const a = await page('index.html', null, native.host); t.after(a.close);
  const b = await page('sidepanel.html', null, native.host); t.after(b.close);
  const task = await a.TaskManager.addTask({ title: 'Stale task' });
  await a.TaskManager.loadTasks();
  await b.DataManager.clearAllTasks();
  assert.equal(await a.TaskManager.updateTask(task.id, { title: 'Must reject' }), null);
  assert.deepEqual(native.disk().tasks, []);
});

test('failed notification delivery releases its lease and allows the next check to retry', async t => {
  const p = await page(); t.after(p.close);
  const due = new Date(Date.now() + 5 * 60000);
  const task = await p.TaskManager.addTask({ title: 'Retry reminder', dueDate: p.Utils.toDateISO(due),
    dueTime: due.toTimeString().slice(0, 5), reminder: { enabled: true, before: 10, notified: false } });
  let attempts = 0;
  p.Notifications.show = async () => { attempts++; if (attempts === 1) throw new Error('temporary'); };
  await assert.rejects(p.Notifications.checkReminders());
  assert.equal((await p.Storage.getAll()).tasks[0].reminder.notified, false);
  assert.equal(Object.keys((await p.Storage.getAll()).notificationLeases || {}).length, 0);
  p.Notifications.show = async () => true;
  await p.Notifications.checkReminders();
  assert.equal((await p.Storage.getAll()).tasks[0].reminder.notified, true);
  assert.equal((await p.Storage.getAll()).tasks[0].id, task.id);
});
