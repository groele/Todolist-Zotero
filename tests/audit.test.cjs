const test = require('node:test');
const assert = require('node:assert/strict');
const { page, makeHost, waitFor, copy, read, JSDOM } = require('./helpers.cjs');

test('parallel tag/template additions and deletions preserve neighboring window changes', async t => {
  const native = makeHost();
  const a = await page('index.html', null, native.host); t.after(a.close);
  const b = await page('sidepanel.html', null, native.host); t.after(b.close);
  const [tagA, tagB] = await Promise.all([a.Tags.addCustomTag('A', '#ef4444'), b.Tags.addCustomTag('B', '#ef4444')]);
  const [templateA] = await Promise.all([a.Templates.addCustomTemplate('A', { title: 'A' }), b.Templates.addCustomTemplate('B', { title: 'B' })]);
  assert.deepEqual(native.disk().customTags.map(entry => entry.name), ['A', 'B']);
  assert.deepEqual(native.disk().customTemplates.map(entry => entry.name), ['A', 'B']);
  assert.equal(a.Templates.getAllTemplates().filter(entry => entry.id.startsWith('custom_')).length, 2);
  await Promise.all([a.Tags.deleteCustomTag(tagA.id), b.Tags.addCustomTag('C', '#ef4444')]);
  await Promise.all([a.Templates.deleteCustomTemplate(templateA.id), b.Templates.addCustomTemplate('C', { title: 'C' })]);
  assert.deepEqual(native.disk().customTags.map(entry => entry.name), ['B', 'C']);
  assert.deepEqual(native.disk().customTemplates.map(entry => entry.name), ['B', 'C']);
  assert(!Object.hasOwn(native.disk(), 'customTagChanges'));
  assert(!Object.hasOwn(native.disk(), 'customTemplateChanges'));
  native.failWrites(true);
  await assert.rejects(a.Tags.deleteCustomTag(tagB.id), /disk full/);
  assert.deepEqual(copy(a.Tags.customTags).map(entry => entry.name), ['B', 'C']);
});

test('editing a title in an older modal preserves dates, subtasks and reminders changed elsewhere', async t => {
  const native = makeHost();
  const a = await page('index.html', null, native.host); t.after(a.close);
  const b = await page('sidepanel.html', null, native.host); t.after(b.close);
  const task = await a.TaskManager.addTask({ title: 'original', subtasks: [{ id: 's', title: 'step', completed: false }] });
  await a.Modal.openEdit(task.id);
  await b.TaskManager.updateTask(task.id, { dueDate: '2030-01-01', reminder: { enabled: true, before: 30 } });
  await b.TaskManager.addSubtask(task.id, 'remote step');
  a.doc.getElementById('task-title').value = 'edited title';
  await a.Modal.handleSubmit();
  const saved = native.disk().tasks[0];
  assert.equal(saved.title, 'edited title');
  assert.equal(saved.dueDate, '2030-01-01');
  assert.equal(saved.subtasks.length, 2);
  assert.equal(saved.reminder.before, 30);
});

test('post-commit category refresh failure does not report a saved task as failed', async t => {
  const native = makeHost(); const p = await page('index.html', null, native.host); t.after(p.close);
  p.Modal.openAdd({ title: 'committed task' });
  p.Modal.loadCategories = async () => { throw new Error('refresh denied'); };
  await p.Modal.handleSubmit();
  assert.equal(native.disk().tasks.length, 1);
  assert.equal(p.doc.getElementById('toast-message').textContent, '任务已添加');
  assert.equal(p.Modal.dialog.open, false);
  assert.equal(p.win.TodolistDiagnostics.records.at(-1).action, '刷新任务分类（任务已保存）');
});

test('render failure after a task commit does not reject the saved mutation', async t => {
  const p = await page(); t.after(p.close);
  const render = p.UI.render;
  p.UI.render = () => { throw new Error('render denied'); };
  const task = await p.TaskManager.addTask({ title: 'saved despite render error' });
  p.UI.render = render;
  assert.equal((await p.Storage.getAll()).tasks[0].id, task.id);
  assert.equal(p.win.TodolistDiagnostics.records.at(-1).action, '刷新任务列表');
});

test('minimal imported templates render and malformed templates fail before persistence', async t => {
  const p = await page(); t.after(p.close);
  const file = payload => new p.win.File([JSON.stringify(payload)], 'backup.json');
  await p.DataManager.importData(file({ tasks: [], customTemplates: [{ id: 'minimal', name: 'Minimal', task: { title: 'Minimal' } }] }));
  p.UI.openTemplates();
  assert.match(p.doc.getElementById('templates-modal').textContent, /0 个子任务/);
  await p.Templates.applyTemplate('minimal');
  assert.equal(p.doc.getElementById('task-title').value, 'Minimal');
  const before = await p.Storage.getAll();
  await assert.rejects(p.DataManager.importData(file({ tasks: [], customTemplates: [{ id: 'bad', name: 'Bad', task: {} }] })), /模板标题/);
  assert.deepEqual(copy(await p.Storage.getAll()), copy(before));
});

test('built-in and custom writing templates preserve academic type and metadata', async t => {
  const p = await page('index.html', null, makeHost().host); t.after(p.close);
  await p.Templates.applyTemplate('paper-writing-pipeline');
  assert.equal(p.Modal.getAcademicType(), 'writing');
  p.Modal.close();
  const template = await p.Templates.addCustomTemplate('Writing', { title: 'Writing task', academicType: 'writing', tags: ['work'], repeat: 'weekly' });
  await p.Templates.applyTemplate(template.id);
  assert.equal(p.Modal.getAcademicType(), 'writing');
  assert.deepEqual(copy(p.Modal.currentTags), ['work']);
  assert.equal(p.doc.getElementById('task-repeat').value, 'weekly');
});

test('statistics safely count categories with object-prototype names', async t => {
  const p = await page(); t.after(p.close);
  for (const category of ['__proto__', 'constructor', 'toString']) await p.TaskManager.addTask({ title: category, category });
  const stats = await p.DataManager.getStats();
  assert.equal(stats.categories.__proto__, 1);
  assert.equal(stats.categories.constructor, 1);
  assert.equal(stats.categories.toString, 1);
  assert(!/NaN|Infinity/.test(await p.DataManager.renderStats()));
});

test('quoted imported IDs work in subtask creation and host navigation', async t => {
  const native = makeHost({ tasks: [{ id: 'quoted"[]', title: 'Imported', completed: false, subtasks: [{ id: 's', title: 'step', completed: false }] }], settings: {}, customTags: [] });
  const p = await page('index.html', null, native.host); t.after(p.close);
  const input = p.doc.querySelector('.card-add-subtask-input[data-task-id]');
  input.value = 'new step';
  input.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await waitFor(() => native.disk().tasks[0].subtasks.length === 2);
  await waitFor(() => p.doc.activeElement?.dataset.taskId === 'quoted"[]');
  const card = p.doc.querySelector('.task-card'); let located = false;
  card.scrollIntoView = () => { located = true; };
  p.ZoteroBridge.handleHostNavigation({ mode: 'view_task', taskId: 'quoted"[]' });
  assert.equal(located, true);
  assert.deepEqual(p.errors, []);
});

test('native preference tag writes catch failures, preserve drafts and suppress duplicate submissions', async t => {
  const native = makeHost();
  const dom = new JSDOM('<body><div id="todolist-preferences-pane"></div><p id="todolist-pref-status"></p><div id="todolist-pref-tags-list"></div><input id="todolist-new-tag-name"><button id="todolist-btn-add-tag">Add</button></body>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const win = dom.window;
  win.Zotero = native.context.Zotero;
  win.eval(read('chrome/content/scripts/preferences.js'));
  win.Todolist_Preferences.init(win);
  const input = win.document.getElementById('todolist-new-tag-name');
  const add = win.document.getElementById('todolist-btn-add-tag');
  input.value = 'draft'; native.failWrites(true); add.click();
  await waitFor(() => !add.disabled);
  assert.equal(input.value, 'draft');
  assert.match(win.document.getElementById('todolist-pref-status').textContent, /添加自定义标签失败/);
  native.failWrites(false); add.click();
  input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await waitFor(() => !add.disabled && native.disk().customTags.length === 1);
  await waitFor(() => Boolean(win.document.querySelector('.todolist-pref-tag-delete')));
  native.failWrites(true); win.document.querySelector('.todolist-pref-tag-delete').click();
  await waitFor(() => win.document.getElementById('todolist-pref-status').textContent.includes('删除自定义标签失败'));
  assert.equal(native.disk().customTags.length, 1);
});

test('an imported backup or clear remains successful if a post-commit reload fails', async t => {
  const p = await page(); t.after(p.close);
  p.TaskManager.loadTasks = async () => { throw new Error('reload denied'); };
  const file = new p.win.File([JSON.stringify({ tasks: [{ id: 'imported', title: 'Imported', completed: false }] })], 'backup.json');
  const result = await p.DataManager.importData(file);
  assert.equal(result.imported, 1);
  assert.equal((await p.Storage.getAll()).tasks[0].id, 'imported');
  assert.equal(await p.DataManager.clearAllTasks(), true);
  assert.equal((await p.Storage.getAll()).tasks.length, 0);
});

test('unrelated windows cannot send host storage commands; owned Zotero pages still can', async t => {
  const native = makeHost({ tasks: [{ id: 'original', title: 'preserved' }], settings: {} });
  const main = new JSDOM('<body><div id="zotero-pane"><toolbar id="zotero-items-toolbar"></toolbar></div></body>');
  const unrelated = new JSDOM('<body></body>', { url: 'https://untrusted.invalid/' });
  const owned = new JSDOM('<body></body>', { url: 'chrome://todolist/content/index.html?mode=subwindow' });
  t.after(() => { main.window.close(); unrelated.window.close(); owned.window.close(); });
  main.window.ZoteroPane = {}; native.host.addToWindow(main.window);
  const send = source => main.window.dispatchEvent(new main.window.MessageEvent('message', {
    source, data: { type: 'TODOLIST_STORAGE_SET', requestId: 'probe', payload: { tasks: [] } }
  }));
  send(unrelated.window);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(native.disk().tasks.length, 1);
  assert.equal(native.writes(), 0);
  send(owned.window);
  await waitFor(() => native.disk().tasks.length === 0);
});

test('an unrelated message sender cannot replace frontend task snapshots', async t => {
  const p = await page(); t.after(p.close);
  const unrelated = new JSDOM('<body></body>', { url: 'https://untrusted.invalid/' }); t.after(() => unrelated.window.close());
  await p.TaskManager.addTask({ title: 'preserved' });
  p.win.dispatchEvent(new p.win.MessageEvent('message', { source: unrelated.window,
    data: { type: 'TODOLIST_DATA_CHANGED', data: { tasks: [], revision: 999 } } }));
  assert.equal(p.TaskManager.getTasks().length, 1);
});

test('concurrent search history edits merge without dropping queries and failed saves roll back', async t => {
  const native = makeHost();
  const a = await page('index.html', null, native.host); t.after(a.close);
  const b = await page('sidepanel.html', null, native.host); t.after(b.close);
  await Promise.all([a.Advanced.addToSearchHistory('query A'), b.Advanced.addToSearchHistory('query B')]);
  assert.deepEqual(native.disk().searchHistory, ['query B', 'query A']);
  assert(!Object.hasOwn(native.disk(), 'searchHistoryAdd'));
  native.failWrites(true);
  await assert.rejects(a.Advanced.addToSearchHistory('query C'), /disk full/);
  assert.deepEqual(copy(a.Advanced.searchHistory), ['query B', 'query A']);
});

test('native maintenance actions catch rejected promises and canceled clear does not report success', async t => {
  const native = makeHost();
  const dom = new JSDOM('<body><div id="todolist-preferences-pane"></div><p id="todolist-pref-status"></p><button id="todolist-btn-clear-all">Clear</button><button id="todolist-btn-copy-summary">Copy</button></body>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const win = dom.window; win.Zotero = native.context.Zotero;
  let confirmations = 0;
  win.confirm = () => { confirmations++; return false; };
  native.host.copyTasksSummary = async () => { throw new Error('copy denied'); };
  win.eval(read('chrome/content/scripts/preferences.js')); win.Todolist_Preferences.init(win);
  win.document.getElementById('todolist-btn-clear-all').click();
  await waitFor(() => win.document.getElementById('todolist-pref-status').textContent === '数据未清空。');
  assert.equal(confirmations, 1);
  win.document.getElementById('todolist-btn-copy-summary').click();
  await waitFor(() => win.document.getElementById('todolist-pref-status').textContent.includes('复制任务摘要失败'));
});

test('the item-pane and welcome switches and default academic type affect their consumers', async t => {
  const native = makeHost({ tasks: [], settings: { showWelcomeOnStartup: false, defaultTaskType: 'writing' } });
  native.context.Zotero.Prefs.get = key => key.endsWith('enableItemPane') ? false : undefined;
  native.host.registerItemPaneSection();
  assert.equal(native.pane(), undefined);
  const p = await page('index.html', null, native.host); t.after(p.close);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(native.disk().firstTimeShown, undefined);
  p.Modal.openAdd();
  assert.equal(p.Modal.getAcademicType(), 'writing');
});

test('settings without runtime consumers are visibly unavailable and controls have labels', t => {
  const groups = ['window', 'view', 'literature', 'sync', 'tags', 'academic', 'focus', 'maintenance'];
  const dom = new JSDOM('<body><div id="todolist-preferences-pane"></div>' +
    groups.map(group => `<div id="todolist-pref-${group}"></div>`).join('') + '</body>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const win = dom.window;
  win.Zotero = makeHost().context.Zotero;
  win.eval(read('chrome/content/scripts/preferences.js'));
  win.Todolist_Preferences.init(win);
  for (const key of ['subwindowCompactMode', 'locateOnTaskClick', 'dragDropFromLibrary', 'academicPresets',
    'pdfReaderJumpPage', 'enableSound', 'pomodoroFocus', 'pomodoroShortBreak', 'pomodoroLongBreak', 'autoArchiveDays']) {
    const control = win.document.getElementById(`pref-${key}`);
    assert.equal(control.disabled, true, key);
    assert.match(control.labels[0].textContent, /此设置尚未接入/);
  }
  assert.equal(win.document.getElementById('pref-defaultView').disabled, false);
  for (const control of win.document.querySelectorAll('input, select')) assert(control.labels.length > 0, control.id);
});

test('resetting preferences commits once, refreshes controls and rolls back on disk failure', async t => {
  const native = makeHost({ tasks: [], settings: { defaultView: 'kanban', theme: 'dark' } });
  const preferences = new Map([['extensions.todolist.defaultView', 'kanban'], ['extensions.todolist.theme', 'dark']]);
  native.context.Zotero.Prefs = { get: key => preferences.get(key), set: (key, value) => preferences.set(key, value) };
  const dom = new JSDOM('<body><div id="todolist-preferences-pane"></div><p id="todolist-pref-status"></p>' +
    '<div id="todolist-pref-view"></div><button id="todolist-btn-reset-defaults">Reset</button></body>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const win = dom.window; win.Zotero = native.context.Zotero; win.confirm = () => true;
  win.eval(read('chrome/content/scripts/preferences.js')); win.Todolist_Preferences.init(win);
  const reset = win.document.getElementById('todolist-btn-reset-defaults');
  native.failWrites(true); reset.click();
  await waitFor(() => win.document.getElementById('todolist-pref-status').textContent.includes('恢复默认设置失败'));
  assert.equal(preferences.get('extensions.todolist.defaultView'), 'kanban');
  assert.equal(native.disk().settings.theme, 'dark');
  assert.equal(win.document.getElementById('pref-defaultView').value, 'kanban');
  native.failWrites(false); reset.click(); reset.click();
  await waitFor(() => win.document.getElementById('todolist-pref-status').textContent === '默认设置已恢复。');
  assert.equal(native.writes(), 1);
  assert.equal(native.disk().settings.defaultView, 'list');
  assert.equal(win.document.getElementById('pref-defaultView').value, 'list');
  assert.equal(win.document.getElementById('pref-theme').value, 'light');
  assert.equal(reset.disabled, false);
});
