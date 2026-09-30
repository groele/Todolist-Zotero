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
  getNextDueDate(date, pattern) { return TaskRules.nextDueDate(date, pattern); },

  buildNextTask(task, tasks) { return TaskRules.buildNextTask(task, tasks, () => Utils.generateId()); },

  async createNextTask(task) {
    if (!task.completed) return null;
    return TaskManager.updateTask(task.id, { completed: true });
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
