// Storage returns detached snapshots. Writes are acknowledged before reporting success.
const Storage = {
  defaultSettings: {
    defaultView: 'list', showCompleted: true, sortOrder: 'dueDate', theme: 'light',
    dailySummary: false, summaryTime: '09:00', academicPresets: true,
    defaultTaskType: 'literature_reading'
  },
  _zoteroCache: null,
  _taskSnapshot: [],
  _listeners: new Set(),
  _saveQueue: Promise.resolve(),
  clone(value) { return JSON.parse(JSON.stringify(value)); },
  isZotero() {
    return Boolean((typeof ZoteroBridge !== 'undefined' && ZoteroBridge.isZotero) || this.getZoteroInstance());
  },
  getZoteroInstance() {
    if (typeof window === 'undefined') return null;
    try { return window.Zotero || window.parent?.Zotero || null; } catch (_) { return null; }
  },
  subscribe(listener) { this._listeners.add(listener); return () => this._listeners.delete(listener); },
  acceptData(data) {
    if (data.revision && this._zoteroCache?.revision > data.revision) return;
    data = { ...data, tasks: data.tasks || [], settings: { ...this.defaultSettings, ...data.settings },
      customTags: data.customTags || [] };
    this._zoteroCache = this.clone(data);
    for (const listener of this._listeners) {
      try { listener(this.clone(data)); } catch (error) { console.error('Storage listener failed:', error); }
    }
  },
  async getAll() {
    const host = this.getZoteroInstance()?.Todolist;
    let data;
    if (host?.loadData) data = await host.loadData();
    else if (this.isZotero()) {
      await ZoteroBridge.whenReady();
      data = this._zoteroCache;
    } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      data = await chrome.storage.local.get(null);
    } else {
      data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('todolist_')) data[key.slice(9)] = JSON.parse(localStorage.getItem(key));
      }
    }
    if (!data || (data.tasks != null && !Array.isArray(data.tasks))) throw new Error('任务数据格式无效');
    return this.clone({ ...data, tasks: data.tasks || [], settings: { ...this.defaultSettings, ...data.settings }, customTags: data.customTags || [] });
  },
  async saveAll(data) {
    const patch = this.clone(data);
    if (this.isZotero() && (patch.taskChanges || patch.tasks || patch.importRequest)) patch.syncLinkedItems = true;
    const run = async () => {
      const host = this.getZoteroInstance()?.Todolist;
      let saved;
      if (host?.saveData) saved = await host.saveData(patch);
      else if (this.isZotero()) {
        await ZoteroBridge.whenReady();
        saved = await ZoteroBridge.saveStorage(patch);
      } else {
        const current = await this.getAll();
        const prepared = patch.importRequest ? TaskRules.prepareImport(current, patch.importRequest.payload, patch.importRequest.mode) : null;
        saved = this.mergeData(current, prepared ? prepared.patch : patch);
        if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set(saved);
        else for (const [key, value] of Object.entries(saved)) localStorage.setItem('todolist_' + key, JSON.stringify(value));
        if (prepared) saved.importResult = { imported: prepared.imported };
      }
      const { importResult, ...snapshot } = saved;
      this.acceptData(snapshot);
      return this.clone(saved);
    };
    const result = this._saveQueue.then(run);
    this._saveQueue = result.catch(() => {});
    return result;
  },
  mergeData(current, patch) {
    const merged = { ...current, ...patch };
    if (patch.settings) merged.settings = patch.replaceSettings ? { ...this.defaultSettings, ...patch.settings } : { ...current.settings, ...patch.settings };
    delete merged.replaceSettings;
    if (patch.taskChanges) {
      const { added = [], updated = [], deleted = [] } = patch.taskChanges;
      const removed = new Set(deleted);
      merged.tasks = current.tasks.filter(t => !removed.has(t.id)).map(t => {
        const update = updated.find(u => u.id === t.id);
        return update ? { ...t, ...update.changes, id: t.id } : t;
      });
      for (const task of added) if (!merged.tasks.some(t => t.id === task.id)) merged.tasks.push(task);
      delete merged.taskChanges;
    }
    if (patch.activeTimerChanges) {
      merged.activeTimers = { ...current.activeTimers };
      for (const [id, timer] of Object.entries(patch.activeTimerChanges)) {
        if (timer) merged.activeTimers[id] = timer;
        else delete merged.activeTimers[id];
      }
      delete merged.activeTimerChanges;
    }
    TaskRules.applyTimerAction(merged, patch.timerAction);
    delete merged.timerAction;
    if (patch.taskChanges || patch.tasks || patch.activeTimerChanges) {
      const ids = new Set(merged.tasks.map(t => t.id));
      merged.activeTimers = Object.fromEntries(Object.entries(merged.activeTimers || {}).filter(([id]) => ids.has(id)));
    }
    merged.tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    return merged;
  },
  async getTasks() {
    const data = await this.getAll();
    this._taskSnapshot = this.clone(data.tasks);
    return data.tasks;
  },
  // Field-level changes prevent a stale window from resurrecting deletions or erasing additions.
  async saveTasks(tasks, baseline = this._taskSnapshot, extra = {}) {
    const before = new Map(baseline.map(t => [t.id, t]));
    const after = new Map(tasks.map(t => [t.id, t]));
    const taskChanges = { added: [], updated: [], deleted: [] };
    for (const [id, task] of after) {
      if (!before.has(id)) taskChanges.added.push(task);
      else {
        const changes = {};
        for (const [key, value] of Object.entries(task)) {
          if (key !== 'id' && JSON.stringify(value) !== JSON.stringify(before.get(id)[key])) changes[key] = value;
        }
        if (Object.keys(changes).length) taskChanges.updated.push({ id, changes });
      }
    }
    for (const id of before.keys()) if (!after.has(id)) taskChanges.deleted.push(id);
    const data = await this.saveAll({ ...extra, taskChanges });
    this._taskSnapshot = this.clone(data.tasks);
    return data.tasks;
  },
  async getSettings() { return (await this.getAll()).settings; },
  async saveSettings(settings) { return this.saveAll({ settings }); },
  async addTask(task) { return this.saveAll({ taskChanges: { added: [task] } }); },
  async updateTask(id, changes) { return this.saveAll({ taskChanges: { updated: [{ id, changes }] } }); },
  async deleteTask(id) { return this.saveAll({ taskChanges: { deleted: [id] } }); },
  async getTaskById(id) { return (await this.getAll()).tasks.find(t => t.id === id) || null; },
  async getCategories() {
    const categories = new Set(this.isZotero() ? ['论文研读', '论文写作', '代码实验', '会议投稿', '审稿评阅'] : []);
    for (const task of (await this.getAll()).tasks) if (task.category) categories.add(task.category);
    return [...categories];
  }
};

