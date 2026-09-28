// Recurring Tasks module

const Recurring = {
  // Recurrence patterns
  patterns: [
    { id: 'daily', name: '每天', icon: '🔄', days: 1 },
    { id: 'weekly', name: '每周', icon: '📅', days: 7 },
    { id: 'biweekly', name: '每两周', icon: '📆', days: 14 },
    { id: 'monthly', name: '每月', icon: '🗓️', days: 30 },
    { id: 'quarterly', name: '每季度', icon: '📊', days: 90 },
    { id: 'yearly', name: '每年', icon: '🎯', days: 365 }
  ],

  // Get pattern by ID
  getPattern(patternId) {
    return this.patterns.find(p => p.id === patternId);
  },

  // Calculate next due date using proper calendar month/year increments
  getNextDueDate(currentDueDate, patternId) {
    if (!currentDueDate || !patternId) return null;

    const base = Utils.parseLocalDate ? Utils.parseLocalDate(currentDueDate) : new Date(currentDueDate);
    if (!base || isNaN(base.getTime())) return null;

    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());

    switch (patternId) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'biweekly':
        next.setDate(next.getDate() + 14);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'quarterly':
        next.setMonth(next.getMonth() + 3);
        break;
      case 'yearly':
        next.setFullYear(next.getFullYear() + 1);
        break;
      default:
        const pattern = this.getPattern(patternId);
        if (pattern) next.setDate(next.getDate() + (pattern.days || 1));
        break;
    }

    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, '0');
    const d = String(next.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  // Create next recurring task (with duplicate check)
  async createNextTask(task) {
    if (!task.repeat) return null;

    const nextDueDate = this.getNextDueDate(task.dueDate, task.repeat);
    if (!nextDueDate) return null;

    // Check if next task instance already exists
    const existingTasks = TaskManager.getTasks();
    const duplicate = existingTasks.find(t =>
      t.title === task.title &&
      t.dueDate === nextDueDate &&
      !t.completed
    );
    if (duplicate) return duplicate;

    // Create new task based on the completed one
    const newTask = {
      title: task.title,
      description: task.description,
      dueDate: nextDueDate,
      dueTime: task.dueTime,
      priority: task.priority,
      category: task.category,
      tags: task.tags ? [...task.tags] : [],
      repeat: task.repeat,
      reminder: task.reminder ? { ...task.reminder, notified: false } : null,
      subtasks: (task.subtasks || []).map(st => ({
        id: Utils.generateId(),
        title: st.title,
        completed: false
      }))
    };

    return await TaskManager.addTask(newTask);
  },

  // Check and create recurring tasks
  async checkRecurringTasks() {
    const tasks = await Storage.getTasks();
    const completedRecurring = tasks.filter(t =>
      t.completed && t.repeat && t.dueDate
    );

    const created = [];
    for (const task of completedRecurring) {
      // Check if next task already exists
      const nextDueDate = this.getNextDueDate(task.dueDate, task.repeat);
      const existing = tasks.find(t =>
        t.title === task.title &&
        t.dueDate === nextDueDate &&
        !t.completed
      );

      if (!existing) {
        const newTask = await this.createNextTask(task);
        if (newTask) {
          created.push(newTask);
        }
      }
    }

    return created;
  },

  // Render repeat selector
  renderRepeatSelector(selectedPattern = '') {
    return `
      <div class="repeat-selector">
        <label class="repeat-label">重复</label>
        <select id="task-repeat" class="repeat-select">
          <option value="">不重复</option>
          ${this.patterns.map(p => `
            <option value="${p.id}" ${selectedPattern === p.id ? 'selected' : ''}>
              ${p.icon} ${p.name}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  },

  // Render repeat badge
  renderRepeatBadge(patternId) {
    if (!patternId) return '';

    const pattern = this.getPattern(patternId);
    if (!pattern) return '';

    return `<span class="repeat-badge">${pattern.icon} ${pattern.name}</span>`;
  }
};
