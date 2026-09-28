// Storage abstraction layer supporting Zotero desktop, Chrome Extension, and localStorage fallback

const Storage = {
  // Default settings
  defaultSettings: {
    defaultView: 'list',
    showCompleted: true,
    sortOrder: 'dueDate',
    theme: 'light',
    dailySummary: false,
    summaryTime: '09:00',
    academicPresets: true,
    defaultTaskType: 'literature_reading'
  },

  _zoteroCache: null,

  isZotero() {
    return Boolean(
      (typeof ZoteroBridge !== 'undefined' && ZoteroBridge.isZotero) ||
      (typeof window !== 'undefined' && (window.Zotero || window.parent?.Zotero))
    );
  },

  getZoteroInstance() {
    if (typeof window === 'undefined') return null;
    return window.Zotero || window.parent?.Zotero || null;
  },

  // Get all data (tasks + settings + customTags)
  async getAll() {
    const zotero = this.getZoteroInstance();
    if (zotero?.Todolist?.loadData) {
      const data = await zotero.Todolist.loadData();
      return {
        tasks: data.tasks || [],
        settings: { ...this.defaultSettings, ...data.settings },
        customTags: data.customTags || []
      };
    }

    if (this._zoteroCache) {
      return {
        tasks: this._zoteroCache.tasks || [],
        settings: { ...this.defaultSettings, ...this._zoteroCache.settings },
        customTags: this._zoteroCache.customTags || []
      };
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(['tasks', 'settings', 'customTags'], (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve({
            tasks: result.tasks || [],
            settings: { ...this.defaultSettings, ...result.settings },
            customTags: result.customTags || []
          });
        });
      });
    }

    // LocalStorage fallback
    try {
      const tasks = JSON.parse(localStorage.getItem('todolist_tasks') || '[]');
      const settings = JSON.parse(localStorage.getItem('todolist_settings') || '{}');
      const customTags = JSON.parse(localStorage.getItem('todolist_customTags') || '[]');
      return {
        tasks,
        settings: { ...this.defaultSettings, ...settings },
        customTags
      };
    } catch (_) {
      return { tasks: [], settings: { ...this.defaultSettings }, customTags: [] };
    }
  },

  // Save all data
  async saveAll(data) {
    const current = await this.getAll();
    const merged = { ...current, ...data };

    const zotero = this.getZoteroInstance();
    if (zotero?.Todolist?.saveData) {
      await zotero.Todolist.saveData(merged);
      this._zoteroCache = merged;
      return;
    }

    if (typeof ZoteroBridge !== 'undefined' && ZoteroBridge.isZotero) {
      this._zoteroCache = merged;
      ZoteroBridge.sendToHost({ type: 'TODOLIST_STORAGE_SET', payload: merged });
      return;
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set(merged, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      });
    }

    // LocalStorage fallback
    try {
      if (data.tasks !== undefined) localStorage.setItem('todolist_tasks', JSON.stringify(data.tasks));
      if (data.settings !== undefined) localStorage.setItem('todolist_settings', JSON.stringify(data.settings));
      if (data.customTags !== undefined) localStorage.setItem('todolist_customTags', JSON.stringify(data.customTags));
    } catch (_) {}
  },

  // Get tasks array
  async getTasks() {
    const data = await this.getAll();
    return data.tasks;
  },

  // Save tasks array
  async saveTasks(tasks) {
    return this.saveAll({ tasks });
  },

  // Get settings
  async getSettings() {
    const data = await this.getAll();
    return data.settings;
  },

  // Save settings
  async saveSettings(settings) {
    return this.saveAll({ settings });
  },

  // Add a single task (deduplicating by ID)
  async addTask(task) {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === task.id);
    if (index === -1) {
      tasks.push(task);
    } else {
      tasks[index] = task;
    }
    await this.saveTasks(tasks);
    return task;
  },

  // Update a task by ID
  async updateTask(id, changes) {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

    tasks[index] = { ...tasks[index], ...changes };
    await this.saveTasks(tasks);
    return tasks[index];
  },

  // Delete a task by ID
  async deleteTask(id) {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

    const deleted = tasks.splice(index, 1)[0];
    await this.saveTasks(tasks);
    return deleted;
  },

  // Get a single task by ID
  async getTaskById(id) {
    const tasks = await this.getTasks();
    return tasks.find(t => t.id === id) || null;
  },

  // Get all unique categories
  async getCategories() {
    const tasks = await this.getTasks();
    const categories = new Set();
    // Default academic categories in Zotero
    if (this.isZotero()) {
      categories.add('论文研读');
      categories.add('论文写作');
      categories.add('代码实验');
      categories.add('会议投稿');
      categories.add('审稿评阅');
    }
    tasks.forEach(t => {
      if (t.category) categories.add(t.category);
    });
    return Array.from(categories);
  }
};
