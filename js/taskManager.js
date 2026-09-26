// Task Manager - Business logic for task operations

const TaskManager = {
  // In-memory cache of tasks
  _tasks: [],
  _deletedTask: null,
  _deletedTaskIndex: -1,
  _undoTimeout: null,
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

  // Load tasks from storage
  async loadTasks() {
    this._tasks = await Storage.getTasks();
    return this._tasks;
  },

  // Get all tasks
  getTasks() {
    return [...this._tasks];
  },

  // Add a new task
  async addTask(taskData) {
    const task = {
      id: Utils.generateId(),
      title: taskData.title.trim(),
      description: taskData.description?.trim() || '',
      dueDate: taskData.dueDate || null,
      dueTime: taskData.dueTime || null,
      priority: taskData.priority || 'medium',
      category: taskData.category?.trim() || '',
      completed: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
      subtasks: taskData.subtasks || [],
      reminder: taskData.reminder || { enabled: false, before: 15, notified: false },
      order: this._tasks.length,
      tags: taskData.tags || [],
      repeat: taskData.repeat || null,
      zoteroItemKey: taskData.zoteroItemKey || null,
      zoteroItemTitle: taskData.zoteroItemTitle || null,
      zoteroAuthors: taskData.zoteroAuthors || null,
      zoteroYear: taskData.zoteroYear || null,
      zoteroUri: taskData.zoteroUri || null,
      zoteroPdfUri: taskData.zoteroPdfUri || null,
      academicType: taskData.academicType || null
    };

    await Storage.addTask(task);
    this._tasks.push(task);
    return task;
  },

  // Update an existing task
  async updateTask(id, changes) {
    const index = this._tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

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
    await Storage.updateTask(id, this._tasks[index]);
    return this._tasks[index];
  },

  // Delete a task with undo support
  async deleteTask(id) {
    const index = this._tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

    // Store for undo
    this._deletedTask = { ...this._tasks[index] };
    this._deletedTaskIndex = index;

    // Remove from array
    this._tasks.splice(index, 1);
    await Storage.saveTasks(this._tasks);

    // Clear any existing undo timeout
    if (this._undoTimeout) {
      clearTimeout(this._undoTimeout);
    }

    // Set timeout to permanently delete (matches toast duration)
    this._undoTimeout = setTimeout(() => {
      this._deletedTask = null;
      this._deletedTaskIndex = -1;
    }, 3500);

    return this._deletedTask;
  },

  // Undo last deletion
  async undoDelete() {
    if (!this._deletedTask) return false;

    // Insert back at original position
    const insertIndex = Math.min(this._deletedTaskIndex, this._tasks.length);
    this._tasks.splice(insertIndex, 0, this._deletedTask);
    await Storage.saveTasks(this._tasks);

    const restored = this._deletedTask;
    this._deletedTask = null;
    this._deletedTaskIndex = -1;

    if (this._undoTimeout) {
      clearTimeout(this._undoTimeout);
      this._undoTimeout = null;
    }

    return restored;
  },

  // Toggle task completion
  async toggleComplete(id) {
    const index = this._tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

    const task = this._tasks[index];
    task.completed = !task.completed;
    task.completedAt = task.completed ? new Date().toISOString() : null;
    task.status = task.completed ? 'done' : (Utils.isOverdue(task.dueDate) ? 'overdue' : 'todo');

    // Sync subtask completion when completing parent task
    if (task.completed && task.subtasks?.length > 0) {
      task.subtasks.forEach(st => st.completed = true);
    }

    await Storage.updateTask(id, task);
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
      completedAt: null,
      createdAt: new Date().toISOString(),
      order: this._tasks.length,
      subtasks: (original.subtasks || []).map(st => ({
        ...st,
        id: Utils.generateId(),
        completed: false
      }))
    };

    await Storage.addTask(newTask);
    this._tasks.push(newTask);
    return newTask;
  },

  // Subtask operations
  async addSubtask(taskId, subtaskTitle) {
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

    await Storage.updateTask(taskId, task);
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

    await Storage.updateTask(taskId, task);
    return subtask;
  },

  async deleteSubtask(taskId, subtaskId) {
    const task = this.getTaskById(taskId);
    if (!task || !task.subtasks) return null;

    task.subtasks = task.subtasks.filter(st => st.id !== subtaskId);
    await Storage.updateTask(taskId, task);
    return true;
  },

  async updateSubtask(taskId, subtaskId, newTitle) {
    const task = this.getTaskById(taskId);
    if (!task || !task.subtasks) return null;

    const subtask = task.subtasks.find(st => st.id === subtaskId);
    if (!subtask) return null;

    subtask.title = newTitle.trim();
    await Storage.updateTask(taskId, task);
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
    for (const id of selected) {
      const task = this.getTaskById(id);
      if (task && !task.completed) {
        task.completed = true;
        task.completedAt = new Date().toISOString();
        task.status = 'done';
        await Storage.updateTask(id, task);
      }
    }
    this.clearSelection();
    return selected.length;
  },

  // Batch delete selected tasks
  async batchDelete() {
    const selected = Array.from(this._selectedTasks);
    this._tasks = this._tasks.filter(t => !this._selectedTasks.has(t.id));
    await Storage.saveTasks(this._tasks);
    this.clearSelection();
    return selected.length;
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
        (t.category || '').toLowerCase().includes(query)
      );
    }

    // Filter by priority
    if (filters.priority && filters.priority !== 'all') {
      filtered = filtered.filter(t => t.priority === filters.priority);
    }

    // Filter by category
    if (filters.category) {
      filtered = filtered.filter(t => t.category === filters.category);
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
  getKanbanTasks() {
    const tasks = this._tasks;

    return {
      todo: tasks.filter(t => !t.completed && this.getKanbanStatus(t) === 'todo'),
      'in-progress': tasks.filter(t => !t.completed && this.getKanbanStatus(t) === 'in-progress'),
      overdue: tasks.filter(t => !t.completed && this.getKanbanStatus(t) === 'overdue'),
      done: tasks.filter(t => t.completed)
    };
  },

  // Resolve a task's kanban column.
  getKanbanStatus(task) {
    if (!task) return 'todo';
    if (task.completed) return 'done';

    // Overdue takes precedence if due date has passed
    if (Utils.isOverdue(task.dueDate)) {
      return 'overdue';
    }

    // If explicit status is set (and not stale overdue), use it
    if (task.status && task.status !== 'overdue') {
      const allowedStatuses = ['todo', 'in-progress'];
      if (allowedStatuses.includes(task.status)) {
        return task.status;
      }
    }

    if (task.subtasks?.length > 0 && task.subtasks.some(st => st.completed) && !task.subtasks.every(st => st.completed)) {
      return 'in-progress';
    }
    return 'todo';
  },

  // Move a task between kanban columns and persist the status change.
  async moveTaskToKanbanColumn(taskId, column) {
    const task = this.getTaskById(taskId);
    if (!task) return null;

    const now = new Date().toISOString();
    const changes = {};

    if (column === 'done') {
      changes.completed = true;
      changes.completedAt = task.completedAt || now;
      changes.status = 'done';
    } else if (column === 'todo' || column === 'in-progress' || column === 'overdue') {
      changes.completed = false;
      changes.completedAt = null;
      changes.status = column;
    } else {
      return null;
    }

    return this.updateTask(taskId, changes);
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
