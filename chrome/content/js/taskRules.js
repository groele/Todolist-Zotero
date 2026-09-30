// Pure rules shared by the Gecko host and task windows.
var TaskRules = {
  nextDueDate(value, pattern) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    const days = { daily: 1, weekly: 7, biweekly: 14 }[pattern];
    const months = { monthly: 1, quarterly: 3, yearly: 12 }[pattern];
    if (days) date.setDate(date.getDate() + days);
    else if (months) {
      date.setDate(1);
      date.setMonth(date.getMonth() + months);
      date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
    } else return null;
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  },
  buildNextTask(task, tasks, generateId) {
    if (!task.completed || !task.repeat || task.recurringGenerated) return null;
    const dueDate = this.nextDueDate(task.dueDate, task.repeat);
    if (!dueDate) return null;
    if (tasks.some(t => t.recurringFrom === task.id || (t.title === task.title && t.repeat === task.repeat &&
      t.dueDate === dueDate && t.zoteroItemKey === task.zoteroItemKey && t.zoteroLibraryID === task.zoteroLibraryID))) return null;
    task.recurringGenerated = true;
    return { ...JSON.parse(JSON.stringify(task)), id: generateId(), dueDate, completed: false,
      completedAt: null, createdAt: new Date().toISOString(), status: 'todo', order: Math.max(-1, ...tasks.map(t => t.order || 0)) + 1,
      timeEntries: [], recurringFrom: task.id, recurringGenerated: false,
      reminder: { ...task.reminder, notified: false },
      subtasks: (task.subtasks || []).map(st => ({ ...st, id: generateId(), completed: false })) };
  }
};
