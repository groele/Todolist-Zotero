// Task Manager - Business logic for task operations

const TaskManager = {
  // In-memory cache of tasks
  _tasks: [],
  _undoTimeout: null,
  _deletedTasks: [],
  undoDuration: 8000,
  _selectedTasks: new Set(),
  _selectionMode: false,
  _literatureFilter: null,

  setLiteratureFilter(key) {
    this._literatureFilter = key;
  },

  getLiteratureFilter() {
    return this._literatureFilter;
  },

  clearLiteratureFilter() {
    this._literatureFilter = null;
  },

  // Load tasks from storage with automatic deduplication
  async loadTasks() {
    const raw = await Storage.getTasks();
    const seen = new Set();
    const unique = [];
    for (const t of (raw || [])) {
      if (!t || !t.id) continue;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      unique.push(t);
    }
    this._tasks = unique;
    this._baseline = Storage.clone(unique);
    this._selectedTasks = new Set([...this._selectedTasks].filter(id => seen.has(id)));
    if (raw && raw.length !== unique.length) {
      await Storage.saveTasks(this._tasks, this._baseline);
    }
    return this._tasks;
  },

  // Get all tasks
  getTasks() {
    return [...this._tasks];
  },

  // Add a new task (ensures exactly 1 task added without double push)
  async addTask(taskData) {
    if (!String(taskData.title || '').trim()) throw new Error('任务标题不能为空');
    const task = {
      id: Utils.generateId(),
      title: String(taskData.title).trim(),
      description: String(taskData.description || '').trim(),
      dueDate: taskData.dueDate || null,
      dueTime: taskData.dueTime || null,
      priority: taskData.priority || 'medium',
      category: String(taskData.category || '').trim(),
      completed: Boolean(taskData.completed),
      status: taskData.completed ? 'done' : (taskData.status === 'in-progress' ? 'in-progress' : 'todo'),
      createdAt: new Date().toISOString(),
      completedAt: taskData.completed ? new Date().toISOString() : null,
      subtasks: taskData.subtasks || [],
      reminder: taskData.reminder || { enabled: false, before: 15, notified: false },
      order: Math.max(-1, ...this._tasks.map(t => t.order || 0)) + 1,
      tags: taskData.tags || [],
      repeat: taskData.repeat || null,
      zoteroItemKey: taskData.zoteroItemKey || null,
      zoteroItemTitle: taskData.zoteroItemTitle || null,
      zoteroAuthors: taskData.zoteroAuthors || null,
      zoteroYear: taskData.zoteroYear || null,
      zoteroLibraryID: taskData.zoteroLibraryID || null,
      zoteroPublication: taskData.zoteroPublication || null,
      zoteroPage: taskData.zoteroPage || null,
      zoteroQuote: taskData.zoteroQuote || null,
      recurringFrom: taskData.recurringFrom || null,
      zoteroUri: taskData.zoteroUri || null,
      zoteroPdfUri: taskData.zoteroPdfUri || null,
      academicType: taskData.academicType || null
    };

    if (task.completed) this.setCompletion(task, true);

    // Prevent duplicate entries
    this._tasks = this._tasks.filter(t => t.id !== task.id);
    this._tasks.push(task);
    await Storage.saveTasks(this._tasks, this._baseline);
    return task;
  },

  // Alias for compatibility
  async createTask(taskData) {
    return this.addTask(taskData);
  },

  // Update an existing task
  async updateTask(id, changes) {
    const index = this._tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

    changes = { ...changes };
    delete changes.id;
    if (changes.title != null && !String(changes.title).trim()) throw new Error('任务标题不能为空');
    if ((changes.dueDate !== undefined && changes.dueDate !== this._tasks[index].dueDate) ||
        (changes.dueTime !== undefined && changes.dueTime !== this._tasks[index].dueTime)) {
      changes.reminder = { ...this._tasks[index].reminder, ...changes.reminder, notified: false };
    }
    // Clean up changes
    if (changes.title != null) changes.title = String(changes.title).trim();
    if (changes.description != null) changes.description = String(changes.description).trim();
    if (changes.category != null) changes.category = String(changes.category).trim();

    // If due date changed and was previously marked overdue, clear stale status
    if (changes.dueDate !== undefined && this._tasks[index].status === 'overdue') {
      if (!Utils.isOverdue(changes.dueDate)) {
        changes.status = 'todo';
      }
    }

    this._tasks[index] = { ...this._tasks[index], ...changes };
    const task = this._tasks[index];
    if (changes.subtasks !== undefined && task.subtasks.length) {
      this.syncSubtaskCompletion(task);
    } else if (changes.completed !== undefined) {
      this.setCompletion(task, task.completed);
    }
    this.appendRecurringTask(task);
    await Storage.saveTasks(this._tasks, this._baseline);
    return this._tasks[index];
  },

  // Delete a task with undo support
  async deleteTask(id) {
    const index = this._tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

    const deleted = Storage.clone(this._tasks[index]);
    this._tasks.splice(index, 1);
    await Storage.saveTasks(this._tasks, this._baseline);
    this._selectedTasks.delete(id);
    this.rememberDeleted([{ task: deleted, index }]);
    return deleted;
  },

  rememberDeleted(entries) {
    this._deletedTasks.push(...entries);
    clearTimeout(this._undoTimeout);
    this._undoTimeout = setTimeout(() => { this._deletedTasks = []; this._undoTimeout = null; }, this.undoDuration);
  },

  // Undo last deletion
  async undoDelete() {
    if (!this._deletedTasks.length) return false;
    const entries = this._deletedTasks;
    for (const entry of [...entries].reverse()) {
      if (!this.getTaskById(entry.task.id)) this._tasks.splice(Math.min(entry.index, this._tasks.length), 0, entry.task);
    }
    await Storage.saveTasks(this._tasks, this._baseline);
    this._deletedTasks = [];
    if (this._undoTimeout) {
      clearTimeout(this._undoTimeout);
      this._undoTimeout = null;
    }

    return entries.map(entry => entry.task);
  },

  setCompletion(task, completed) {
    task.completed = Boolean(completed);
    task.completedAt = completed ? (task.completedAt || new Date().toISOString()) : null;
    task.status = completed ? 'done' : 'todo';
    if (completed) (task.subtasks || []).forEach(st => { st.completed = true; });
  },

  syncSubtaskCompletion(task) {
    if (!task.subtasks?.length) return;
    const allDone = task.subtasks.every(st => st.completed);
    if (allDone || task.completed) this.setCompletion(task, allDone);
  },

  appendRecurringTask(task) {
    if (!task.completed || !task.repeat || typeof Recurring === 'undefined') return;
    const next = Recurring.buildNextTask(task, this._tasks);
    if (next) this._tasks.push(next);
  },

  // Toggle task completion
  async toggleComplete(id) {
    const index = this._tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

    const task = this._tasks[index];
    this.setCompletion(task, !task.completed);

    // Sync subtask completion when completing parent task
    if (task.completed && task.subtasks?.length > 0) {
      task.subtasks.forEach(st => st.completed = true);
    }

    this.appendRecurringTask(task);
    await Storage.saveTasks(this._tasks, this._baseline);
    return task;
  },

  // Get task by ID
  getTaskById(id) {
    return this._tasks.find(t => t.id === id) || null;
  },

  // Duplicate a task
  async duplicateTask(id) {
    const original = this.getTaskById(id);
    if (!original) return null;

    const newTask = {
      ...original,
      id: Utils.generateId(),
      title: original.title + ' (副本)',
      completed: false,
      status: 'todo',
      completedAt: null,
      createdAt: new Date().toISOString(),
      order: Math.max(-1, ...this._tasks.map(t => t.order || 0)) + 1,
      reminder: { ...original.reminder, notified: false },
      tags: [...(original.tags || [])],
      timeEntries: [],
      recurringFrom: null,
      recurringGenerated: false,
      subtasks: (original.subtasks || []).map(st => ({
        ...st,
        id: Utils.generateId(),
        completed: false
      }))
    };

    this._tasks = this._tasks.filter(t => t.id !== newTask.id);
    this._tasks.push(newTask);
    await Storage.saveTasks(this._tasks, this._baseline);
    return newTask;
  },

  // Subtask operations
  async addSubtask(taskId, subtaskTitle) {
    if (!String(subtaskTitle || '').trim()) throw new Error('子任务标题不能为空');
    const task = this.getTaskById(taskId);
    if (!task) return null;

    const subtask = {
      id: Utils.generateId(),
      title: subtaskTitle.trim(),
      completed: false
    };

    if (!task.subtasks) task.subtasks = [];
    task.subtasks.push(subtask);

    // Adding an incomplete subtask uncompletes parent if completed
    if (task.completed) {
      task.completed = false;
      task.completedAt = null;
      task.status = Utils.isOverdue(task.dueDate) ? 'overdue' : 'todo';
    }

    await Storage.saveTasks(this._tasks, this._baseline);
    return subtask;
  },

  async toggleSubtask(taskId, subtaskId) {
    const task = this.getTaskById(taskId);
    if (!task || !task.subtasks) return null;

    const subtask = task.subtasks.find(st => st.id === subtaskId);
    if (!subtask) return null;

    subtask.completed = !subtask.completed;

    // Auto-sync parent completion
    const allCompleted = task.subtasks.length > 0 && task.subtasks.every(st => st.completed);
    if (allCompleted) {
      task.completed = true;
      task.completedAt = task.completedAt || new Date().toISOString();
      task.status = 'done';
    } else if (!subtask.completed && task.completed) {
      task.completed = false;
      task.completedAt = null;
      task.status = Utils.isOverdue(task.dueDate) ? 'overdue' : 'todo';
    }

    this.appendRecurringTask(task);
    await Storage.saveTasks(this._tasks, this._baseline);
    return subtask;
  },

  async deleteSubtask(taskId, subtaskId) {
    const task = this.getTaskById(taskId);
    if (!task || !task.subtasks) return null;

    task.subtasks = task.subtasks.filter(st => st.id !== subtaskId);
    this.syncSubtaskCompletion(task);
    this.appendRecurringTask(task);
    await Storage.saveTasks(this._tasks, this._baseline);
    return true;
  },

  async updateSubtask(taskId, subtaskId, newTitle) {
    if (!String(newTitle || '').trim()) throw new Error('子任务标题不能为空');
    const task = this.getTaskById(taskId);
    if (!task || !task.subtasks) return null;

    const subtask = task.subtasks.find(st => st.id === subtaskId);
    if (!subtask) return null;

    subtask.title = newTitle.trim();
    await Storage.saveTasks(this._tasks, this._baseline);
    return subtask;
  },

  // Batch operations
  toggleSelection(taskId) {
    if (this._selectedTasks.has(taskId)) {
      this._selectedTasks.delete(taskId);
    } else {
      this._selectedTasks.add(taskId);
    }
    return this._selectedTasks.size;
  },

  clearSelection() {
    this._selectedTasks.clear();
    this._selectionMode = false;
  },

  getSelectedCount() {
    return this._selectedTasks.size;
  },

  getSelectedTasks() {
    return Array.from(this._selectedTasks);
  },

  setSelectionMode(enabled) {
    this._selectionMode = enabled;
    if (!enabled) {
      this._selectedTasks.clear();
    }
  },

  isSelectionMode() {
    return this._selectionMode;
  },

  isTaskSelected(taskId) {
    return this._selectedTasks.has(taskId);
  },

  // Batch complete selected tasks
  async batchComplete() {
    const selected = Array.from(this._selectedTasks);
    let count = 0;
    for (const id of selected) {
      const task = this.getTaskById(id);
      if (task && !task.completed) {
        this.setCompletion(task, true);
        this.appendRecurringTask(task);
        count++;
      }
    }
    await Storage.saveTasks(this._tasks, this._baseline);
    this.clearSelection();
    return count;
  },

  // Batch delete selected tasks
  async batchDelete() {
    const deleted = this._tasks.map((task, index) => ({ task: Storage.clone(task), index }))
      .filter(entry => this._selectedTasks.has(entry.task.id));
    this._tasks = this._tasks.filter(t => !this._selectedTasks.has(t.id));
    await Storage.saveTasks(this._tasks, this._baseline);
    this.rememberDeleted(deleted.reverse());
    this.clearSelection();
    return deleted.length;
  },

  // Filter tasks
  getFilteredTasks(filters = {}) {
    let filtered = [...this._tasks];

    // Filter by search query
    if (filters.search) {
      const query = filters.search.toLowerCase();
      filtered = filtered.filter(t =>
        (t.title || '').toLowerCase().includes(query) ||
        (t.description || '').toLowerCase().includes(query) ||
        (t.category || '').toLowerCase().includes(query) ||
        (t.zoteroItemTitle || '').toLowerCase().includes(query) ||
        (t.tags || []).some(tag => {
          const resolved = typeof Tags !== 'undefined' ? Tags.getAllTags().find(t => t.id === tag) : null;
          return String(resolved?.name || tag).toLowerCase().includes(query);
        })
      );
    }

    // Filter by priority
    if (filters.priority && filters.priority !== 'all') {
      filtered = filtered.filter(t => t.priority === filters.priority);
    }

    // Filter by category
    if (filters.category && filters.category !== 'all') {
      filtered = filtered.filter(t => t.category === filters.category || t.academicType === filters.category);
    }

    // Filter by literature
    const litKey = filters.literatureKey || this._literatureFilter;
    if (litKey) {
      if (litKey === '__has_literature__') {
        filtered = filtered.filter(t => Boolean(t.zoteroItemKey));
      } else {
        filtered = filtered.filter(t => t.zoteroItemKey === litKey);
      }
    }

    // Filter by academic type
    if (filters.academicType && filters.academicType !== 'all') {
      filtered = filtered.filter(t => t.academicType === filters.academicType);
    }

    // Filter by status
    if (filters.status) {
      switch (filters.status) {
        case 'literature':
          filtered = filtered.filter(t => Boolean(t.zoteroItemKey) || (t.academicType && t.academicType !== 'generic'));
          break;
        case 'today':
          filtered = filtered.filter(t => !t.completed && Utils.isToday(t.dueDate));
          break;
        case 'upcoming':
          filtered = filtered.filter(t => !t.completed && t.dueDate && !Utils.isOverdue(t.dueDate) && !Utils.isToday(t.dueDate));
          break;
        case 'completed':
          filtered = filtered.filter(t => t.completed);
          break;
        case 'overdue':
          filtered = filtered.filter(t => !t.completed && Utils.isOverdue(t.dueDate));
          break;
        case 'all':
        default:
          // No filter
          break;
      }
    }

    // Filter by date (for calendar view)
    if (filters.date) {
      filtered = filtered.filter(t => t.dueDate === filters.date);
    }

    return filtered;
  },

  // Sort tasks
  getSortedTasks(tasks, sortOrder = 'dueDate') {
    const sorted = [...tasks];

    sorted.sort((a, b) => {
      // Completed tasks always go to bottom
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }

      switch (sortOrder) {
        case 'dueDate':
          // Tasks without dates go to bottom
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          const da = Utils.parseLocalDate ? Utils.parseLocalDate(a.dueDate) : new Date(a.dueDate);
          const db = Utils.parseLocalDate ? Utils.parseLocalDate(b.dueDate) : new Date(b.dueDate);
          return da - db;

        case 'priority':
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          const pa = priorityOrder[a.priority] ?? 1;
          const pb = priorityOrder[b.priority] ?? 1;
          return pa - pb;

        case 'created':
          return new Date(b.createdAt) - new Date(a.createdAt);

        case 'alpha':
          return a.title.localeCompare(b.title);

        case 'order':
          return (a.order || 0) - (b.order || 0);

        default:
          return 0;
      }
    });

    return sorted;
  },

  // Group tasks by section (overdue, today, upcoming, completed)
  getGroupedTasks(filters = {}) {
    const filtered = this.getFilteredTasks(filters);
    const sorted = this.getSortedTasks(filtered, filters.sortOrder || 'order');

    const groups = {
      overdue: [],
      today: [],
      upcoming: [],
      completed: []
    };

    sorted.forEach(task => {
      if (task.completed) {
        groups.completed.push(task);
      } else if (Utils.isOverdue(task.dueDate)) {
        groups.overdue.push(task);
      } else if (Utils.isToday(task.dueDate)) {
        groups.today.push(task);
      } else if (task.dueDate) {
        groups.upcoming.push(task);
      } else {
        // Tasks without due date go to upcoming
        groups.upcoming.push(task);
      }
    });

    return groups;
  },

  // Get tasks for kanban view
  getKanbanTasks(filters = {}) {
    const tasks = this.getSortedTasks(this.getFilteredTasks(filters), filters.sortOrder || 'order');

    return {
      overdue: tasks.filter(t => !t.completed && this.getKanbanStatus(t) === 'overdue'),
      todo: tasks.filter(t => !t.completed && this.getKanbanStatus(t) === 'todo'),
      'in-progress': tasks.filter(t => !t.completed && this.getKanbanStatus(t) === 'in-progress'),
      done: tasks.filter(t => t.completed || this.getKanbanStatus(t) === 'done')
    };
  },

  // Resolve a task's kanban column with explicit user drag priority
  getKanbanStatus(task) {
    if (!task) return 'todo';
    if (task.completed) return 'done';
    if (Utils.isOverdue(task.dueDate)) return 'overdue';

    // 1. Explicit user status takes priority (from kanban drag or explicit setting)
    if (task.status === 'in-progress') return 'in-progress';
    if (task.status === 'todo') return 'todo';

    // 2. Inferred status from date and subtask progress
    if (Utils.isOverdue(task.dueDate)) {
      return 'overdue';
    }

    if (task.subtasks?.length > 0 && task.subtasks.some(st => st.completed) && !task.subtasks.every(st => st.completed)) {
      return 'in-progress';
    }

    return 'todo';
  },

  // Move a task between kanban columns and persist the status change cleanly, with precise reordering
  async moveTaskToKanbanColumn(taskId, column, targetTaskId = null) {
    const task = this.getTaskById(taskId);
    if (!task) return null;

    const now = new Date().toISOString();
    const changes = {};

    if (column === 'done') {
      changes.completed = true;
      changes.completedAt = task.completedAt || now;
      changes.status = 'done';
    } else if (column === 'todo') {
      changes.completed = false;
      changes.completedAt = null;
      changes.status = 'todo';
    } else if (column === 'in-progress') {
      changes.completed = false;
      changes.completedAt = null;
      changes.status = 'in-progress';
    } else if (column === 'overdue') {
      changes.completed = false;
      changes.completedAt = null;
      changes.status = 'overdue';
      if (!Utils.isOverdue(task.dueDate)) return null;
    } else {
      return null;
    }

    Object.assign(task, changes);
    if (column === 'done') this.setCompletion(task, true);
    this.appendRecurringTask(task);
    task.updatedAt = now;

    // Handle position reordering if targetTaskId is specified
    if (targetTaskId && targetTaskId !== taskId) {
      const draggedIdx = this._tasks.findIndex(t => t.id === taskId);
      if (draggedIdx !== -1) {
        const [draggedItem] = this._tasks.splice(draggedIdx, 1);
        const targetIdx = this._tasks.findIndex(t => t.id === targetTaskId);
        if (targetIdx !== -1) {
          this._tasks.splice(targetIdx, 0, draggedItem);
        } else {
          this._tasks.push(draggedItem);
        }
      }
    }

    // Keep order property sequential
    this._tasks.forEach((t, idx) => {
      t.order = idx;
    });

    await Storage.saveTasks(this._tasks, this._baseline);
    return task;
  },

  async moveTaskInList(taskId, targetId, after, section) {
    const task = this.getTaskById(taskId);
    if (!task) return null;
    if (section === 'completed') this.setCompletion(task, true);
    else if (section) {
      this.setCompletion(task, false);
      // These list groups explicitly represent dates; changing group schedules the task.
      const date = new Date();
      if (section === 'today') task.dueDate = Utils.toDateISO(date);
      else if (section === 'overdue' && !Utils.isOverdue(task.dueDate)) {
        date.setDate(date.getDate() - 1); task.dueDate = Utils.toDateISO(date);
      } else if (section === 'upcoming' && (Utils.isToday(task.dueDate) || Utils.isOverdue(task.dueDate))) {
        date.setDate(date.getDate() + 1); task.dueDate = Utils.toDateISO(date);
      }
      task.reminder = { ...task.reminder, notified: false };
    }
    if (targetId && targetId !== taskId) {
      this._tasks.splice(this._tasks.indexOf(task), 1);
      const targetIndex = this._tasks.findIndex(t => t.id === targetId);
      this._tasks.splice(targetIndex < 0 ? this._tasks.length : targetIndex + (after ? 1 : 0), 0, task);
    }
    this.appendRecurringTask(task);
    this._tasks.forEach((t, index) => { t.order = index; });
    await Storage.saveTasks(this._tasks, this._baseline);
    return task;
  },

  async recordTime(taskId, elapsed) {
    const task = this.getTaskById(taskId);
    if (!task) return null;
    task.timeEntries = [...(task.timeEntries || []), { date: new Date().toISOString(), duration: elapsed }];
    await Storage.saveTasks(this._tasks, this._baseline, { activeTimerChanges: { [taskId]: null } });
    return task;
  },

  // Get task counts
  getCounts() {
    const tasks = this._tasks;
    return {
      total: tasks.length,
      completed: tasks.filter(t => t.completed).length,
      incomplete: tasks.filter(t => !t.completed).length,
      overdue: tasks.filter(t => !t.completed && Utils.isOverdue(t.dueDate)).length,
      today: tasks.filter(t => !t.completed && Utils.isToday(t.dueDate)).length
    };
  },

  // Get tasks for a specific date
  getTasksForDate(dateStr) {
    return this._tasks.filter(t => t.dueDate === dateStr);
  },

  // Get subtask progress
  getSubtaskProgress(task) {
    if (!task.subtasks || task.subtasks.length === 0) {
      return null;
    }

    const total = task.subtasks.length;
    const completed = task.subtasks.filter(st => st.completed).length;

    return {
      total,
      completed,
      percentage: Math.round((completed / total) * 100)
    };
  }
};

// Serialize local mutations, refresh before editing, and roll back the UI on persistence failure.
TaskManager._mutationQueue = Promise.resolve();
for (const name of ['addTask', 'updateTask', 'deleteTask', 'undoDelete', 'toggleComplete',
  'duplicateTask', 'addSubtask', 'toggleSubtask', 'deleteSubtask', 'updateSubtask',
  'batchComplete', 'batchDelete', 'moveTaskToKanbanColumn', 'moveTaskInList', 'recordTime']) {
  const operation = TaskManager[name];
  TaskManager[name] = function(...args) {
    const run = async () => {
      this._mutating = true;
      try {
        await this.loadTasks();
        const before = Storage.clone(this._tasks);
        try {
          const result = await operation.apply(this, args);
          if (Storage._zoteroCache) {
            this._tasks = Storage.clone(Storage._zoteroCache.tasks);
            if (typeof TimeTracking !== 'undefined') TimeTracking.activeTimers = Storage._zoteroCache.activeTimers || {};
          }
          this._baseline = Storage.clone(this._tasks);
          return result;
        } catch (error) {
          this._tasks = before;
          throw error;
        }
      } finally {
        this._mutating = false;
        if (typeof UI !== 'undefined' && UI._storageReady) UI.render();
      }
    };
    const result = this._mutationQueue.then(run);
    this._mutationQueue = result.catch(() => {});
    return result;
  };
}
