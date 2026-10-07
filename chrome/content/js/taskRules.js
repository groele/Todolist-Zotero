// Pure rules shared by the Gecko host and task windows.
var TaskRules = {
  applyTaskGeneration(current, next, patch) {
    if (patch.expectedTasksGeneration != null && patch.expectedTasksGeneration !== (current.tasksGeneration || 0)) {
      throw new Error('任务已被清空或替换，请重新加载后重试');
    }
    delete next.expectedTasksGeneration;
    if (patch.tasks) next.tasksGeneration = (current.tasksGeneration || 0) + 1;
  },
  reminderFingerprint(task) {
    return JSON.stringify([task.dueDate, task.dueTime || '23:59', task.reminder?.enabled,
      task.reminder?.before ?? 15]);
  },
  // Reserve notification delivery in the same queue as task writes. Leases recover after a crashed window.
  applyNotificationAction(data, action) {
    if (!action) return null;
    const { type, kind, token, now, key } = action;
    if (!['claim', 'ack', 'release'].includes(type) || !['reminders', 'summary'].includes(kind) ||
        typeof token !== 'string' || !token || !Number.isFinite(now)) throw new Error('提醒请求无效');
    const leases = data.notificationLeases = { ...data.notificationLeases };
    const result = { tasks: [], summary: false };
    if (type === 'claim') for (const [id, lease] of Object.entries(leases)) if (lease.expiresAt <= now) delete leases[id];
    if (type !== 'claim') {
      const lease = leases[key];
      if (!lease || lease.token !== token) return result;
      if (type === 'ack') {
        if (kind === 'summary') data.lastSummaryDate = lease.date;
        else {
          const task = data.tasks.find(t => 'task:' + t.id === key);
          if (task && this.reminderFingerprint(task) === lease.fingerprint) {
            task.reminder = { ...task.reminder, notified: true, notifiedFor: lease.fingerprint };
          }
        }
      }
      delete leases[key];
      return result;
    }
    if (kind === 'summary') {
      const date = new Date(now);
      const today = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')].join('-');
      const time = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
      const leaseKey = 'summary:' + today;
      if (data.settings?.dailySummary && (data.settings.summaryTime || '09:00') === time &&
          data.lastSummaryDate !== today && !leases[leaseKey]) {
        leases[leaseKey] = { token, date: today, expiresAt: now + 60000 };
        result.summary = true;
        result.key = leaseKey;
      }
      return result;
    }
    for (const task of data.tasks) {
      if (task.completed || !task.reminder?.enabled || task.reminder.notified || !task.dueDate) continue;
      const due = new Date(task.dueDate + 'T' + (task.dueTime || '23:59')).getTime();
      const before = Number(task.reminder.before ?? 15);
      if (!Number.isFinite(due) || !Number.isFinite(before) || before < 0 || now < due - before * 60000 ||
          now > due + 86400000) continue;
      const leaseKey = 'task:' + task.id;
      const fingerprint = this.reminderFingerprint(task);
      if (leases[leaseKey]?.fingerprint === fingerprint) continue;
      leases[leaseKey] = { token, fingerprint, expiresAt: now + 60000 };
      result.tasks.push({ task: JSON.parse(JSON.stringify(task)), key: leaseKey });
    }
    return result;
  },
  // Run inside the storage write queue, against the latest committed snapshot.
  applyTimerAction(data, action) {
    if (!action) return;
    const { type, taskId, timer, startTime, stoppedAt, sessionId } = action;
    if (!['start', 'stop'].includes(type)) throw new Error('计时操作无效');
    const task = data.tasks.find(t => t.id === taskId);
    data.activeTimers = { ...data.activeTimers };
    if (type === 'start') {
      if (!timer || !Number.isFinite(timer.startTime)) throw new Error('计时数据无效');
      if (task && !data.activeTimers[taskId]) data.activeTimers[taskId] = timer;
    } else {
      const active = data.activeTimers[taskId];
      if (!active || active.startTime !== startTime || active.sessionId !== sessionId) return;
      if (!Number.isFinite(stoppedAt)) throw new Error('停止时间无效');
      if (task) task.timeEntries = [...(task.timeEntries || []), {
        date: new Date(stoppedAt).toISOString(), duration: Math.max(0, stoppedAt - startTime)
      }];
      delete data.activeTimers[taskId];
    }
  },
  prepareImport(current, payload, mode) {
    if (!['merge', 'replace'].includes(mode)) throw new Error('导入模式无效');
    const source = Array.isArray(payload) ? { tasks: payload } : payload;
    if (!source || !Array.isArray(source.tasks)) throw new Error('无效的数据格式：缺少任务数组');
    const tasks = JSON.parse(JSON.stringify(source.tasks));
    const ids = new Set();
    for (const task of tasks) {
      if (!task || typeof task.id !== 'string' || !task.id.trim() || ids.has(task.id) ||
          typeof task.title !== 'string' || !task.title.trim() || typeof task.completed !== 'boolean') {
        throw new Error('备份包含无效或重复任务，未导入任何数据');
      }
      ids.add(task.id);
      for (const key of ['description', 'category', 'zoteroItemTitle']) {
        if (task[key] != null && typeof task[key] !== 'string') throw new Error('任务文本格式无效：' + key);
      }
      if (task.dueDate && !this.nextDueDate(task.dueDate, 'daily')) throw new Error('截止日期无效');
      if (task.dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.dueTime)) throw new Error('截止时间无效');
      if (task.reminder != null && (typeof task.reminder !== 'object' || Array.isArray(task.reminder))) {
        throw new Error('提醒格式无效');
      }
      for (const key of ['subtasks', 'tags', 'timeEntries']) {
        if (task[key] != null && !Array.isArray(task[key])) throw new Error('任务字段格式无效：' + key);
      }
      const subIds = new Set();
      task.subtasks = (task.subtasks || []).map((st, index) => {
        if (!st || typeof st.title !== 'string' || !st.title.trim()) throw new Error('子任务格式无效');
        const id = st.id || task.id + '_sub_' + index;
        if (typeof id !== 'string' || subIds.has(id)) throw new Error('子任务标识无效或重复');
        subIds.add(id);
        return { ...st, id, completed: Boolean(st.completed) };
      });
      task.tags = task.tags || [];
      if (task.tags.some(tag => typeof tag !== 'string')) throw new Error('任务标签格式无效');
      if ((task.timeEntries || []).some(entry => !entry || !Number.isFinite(entry.duration) || entry.duration < 0 ||
          !Number.isFinite(Date.parse(entry.date)))) throw new Error('计时历史格式无效');
      task.title = task.title.trim();
      task.status = task.completed ? 'done' : (task.status === 'in-progress' ? 'in-progress' : 'todo');
      if (!task.completed) task.completedAt = null;
      if (task.completed) task.subtasks.forEach(st => { st.completed = true; });
    }
    if (source.settings != null && (typeof source.settings !== 'object' || Array.isArray(source.settings))) {
      throw new Error('设置格式无效');
    }
    const patch = {};
    const existingIds = new Set(current.tasks.map(t => t.id));
    const added = tasks.filter(t => !existingIds.has(t.id));
    if (mode === 'replace') {
      patch.tasks = tasks;
      patch.settings = source.settings || {};
      patch.replaceSettings = true;
      patch.activeTimers = {};
      patch.searchHistory = Array.isArray(source.searchHistory) ? source.searchHistory : [];
    } else patch.taskChanges = { added };
    for (const key of ['customTags', 'customTemplates']) {
      if (source[key] != null && !Array.isArray(source[key])) throw new Error('标签或模板格式无效');
      const entries = source[key] || [];
      const seen = new Set();
      for (const entry of entries) {
        if (!entry || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id) ||
            typeof entry.name !== 'string' || !entry.name.trim() ||
            (key === 'customTemplates' && (!entry.task || typeof entry.task !== 'object' || Array.isArray(entry.task)))) {
          throw new Error('标签或模板内容无效或重复');
        }
        seen.add(entry.id);
        if (key === 'customTemplates') {
          if (entry.task.subtasks != null && (!Array.isArray(entry.task.subtasks) ||
              entry.task.subtasks.some(st => !st || typeof st.title !== 'string'))) throw new Error('模板子任务格式无效');
        }
      }
      if (mode === 'replace') patch[key] = entries;
      else if (source[key]) {
        const existing = current[key] || [];
        const existingIds = new Set(existing.map(t => t.id));
        patch[key] = [...existing, ...entries.filter(t => !existingIds.has(t.id))];
      }
    }
    if (source.searchHistory != null && (!Array.isArray(source.searchHistory) ||
        source.searchHistory.some(query => typeof query !== 'string'))) throw new Error('搜索历史格式无效');
    return { patch, imported: mode === 'replace' ? tasks.length : added.length };
  },
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
