// Notifications module for reminders and daily summary

const Notifications = {
  // Check if notifications are supported
  isSupported() {
    return 'Notification' in window || chrome.notifications;
  },

  // Request notification permission
  async requestPermission() {
    if (Storage.isZotero() || (chrome.notifications && !chrome._todolistMock)) {
      return true;
    }

    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  },

  // Play synthesized notification chime
  playChime() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.onended = () => ctx.close().catch(() => {});
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      // AudioContext muted/blocked
    }
  },

  // Show notification
  async show(title, body, options = {}) {
    const host = Storage.getZoteroInstance()?.Todolist;
    if (host?.showNotice) { host.showNotice(title, body); return true; }
    if (Storage.isZotero()) {
      ZoteroBridge.sendToHost({ type: 'TODOLIST_NOTIFY', title, body });
      return true;
    }
    if (options.playSound !== false) {
      this.playChime();
    }

    if (chrome.notifications && !chrome._todolistMock) {
      // Use Chrome notifications API
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: title,
        message: body,
        priority: options.priority ?? 1,
        requireInteraction: options.requireInteraction || false
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      // Use web notifications
      new Notification(title, {
        body: body,
        icon: 'icons/icon128.png',
        ...options
      });
    } else if (typeof UI !== 'undefined') UI.showToast(title + '：' + body);
    return true;
  },

  // Delivery ownership is reserved by storage, so competing windows cannot both send.
  async checkReminders(now = new Date()) {
    const action = { type: 'claim', kind: 'reminders', token: Utils.generateId(), now: now.getTime() };
    const data = await Storage.getAll();
    if (!TaskRules.applyNotificationAction(Storage.clone(data), action).tasks.length) return;
    const saved = await Storage.saveAll({ notificationAction: action });
    for (const { task, key } of saved.notificationResult.tasks) {
      const due = new Date(task.dueDate + 'T' + (task.dueTime || '23:59'));
      const minutes = Math.round((due - now) / 60000);
      const body = minutes <= 0 ? '任务 "' + task.title + '" 已到期！' :
        '任务 "' + task.title + '" 将在 ' + (minutes < 60 ? minutes + ' 分钟' : Math.round(minutes / 60) + ' 小时') + '后到期';
      await this.deliverClaim(action, key, () => this.show('📋 任务提醒', body, { requireInteraction: true, priority: 2 }));
    }
  },

  async deliverClaim(action, key, deliver) {
    try {
      if ((await deliver()) === false) throw new Error('提醒未能发送');
    } catch (error) {
      await Storage.saveAll({ notificationAction: { ...action, type: 'release', key } });
      throw error;
    }
    // A delivery acknowledgement failure retains its lease until expiry; it never overwrites task edits.
    await Storage.saveAll({ notificationAction: { ...action, type: 'ack', key } });
  },

  async checkDailySummary(now = new Date()) {
    const action = { type: 'claim', kind: 'summary', token: Utils.generateId(), now: now.getTime() };
    const data = await Storage.getAll();
    if (!TaskRules.applyNotificationAction(Storage.clone(data), action).summary) return;
    const saved = await Storage.saveAll({ notificationAction: action });
    if (!saved.notificationResult.summary) return;
    await this.deliverClaim(action, saved.notificationResult.key, () => this.sendDailySummary());
  },

  checkScheduled() {
    if (this._checking) return this._checking;
    this._checking = Promise.allSettled([this.checkReminders(), this.checkDailySummary()])
      .then(results => { for (const result of results) if (result.status === 'rejected') console.error('Notification check failed:', result.reason); })
      .finally(() => { this._checking = null; });
    return this._checking;
  },

  startScheduler() {
    this.stopScheduler();
    this._scheduler = setInterval(() => this.checkScheduled(), 60000);
    window.addEventListener('unload', () => this.stopScheduler(), { once: true });
  },

  stopScheduler() {
    if (this._scheduler != null) clearInterval(this._scheduler);
    this._scheduler = null;
  },

  // Send daily summary
  async sendDailySummary() {
    const tasks = (await Storage.getAll()).tasks;
    const today = Utils.getTodayISO();

    const todayTasks = tasks.filter(t => !t.completed && Utils.isToday(t.dueDate));
    const overdueTasks = tasks.filter(t => !t.completed && Utils.isOverdue(t.dueDate));
    const upcomingTasks = tasks.filter(t => {
      if (t.completed || !t.dueDate) return false;
      const due = Utils.parseLocalDate ? Utils.parseLocalDate(t.dueDate) : new Date(t.dueDate);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const nextWeek = new Date(tomorrow);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return due >= tomorrow && due <= nextWeek;
    });

    let summary = '';

    if (overdueTasks.length > 0) {
      summary += `⚠️ ${overdueTasks.length} 个任务已逾期\n`;
    }

    if (todayTasks.length > 0) {
      summary += `📅 今日 ${todayTasks.length} 个待办任务\n`;
      todayTasks.slice(0, 3).forEach(t => {
        summary += `  • ${t.title}\n`;
      });
      if (todayTasks.length > 3) {
        summary += `  ...还有 ${todayTasks.length - 3} 个\n`;
      }
    }

    if (upcomingTasks.length > 0) {
      summary += `📋 本周 ${upcomingTasks.length} 个任务`;
    }

    if (!summary) {
      summary = '✨ 太棒了！没有待办任务';
    }

    await this.show('☀️ 今日摘要', summary.trim(), {
      priority: 0
    });
  },

  // Reset notified status for tasks that are no longer due
  async resetNotifiedStatus() {
    const tasks = (await Storage.getAll()).tasks;
    const now = new Date();

    for (const task of tasks) {
      if (task.reminder?.notified && task.reminder.notifiedFor && !task.completed) {
        const dueDate = new Date(task.dueDate + 'T' + (task.dueTime || '23:59'));
        if (task.reminder.notifiedFor !== TaskRules.reminderFingerprint(task)) {
          if (typeof TaskManager !== 'undefined' && TaskManager.updateTask) {
            await TaskManager.updateTask(task.id, { reminder: { ...task.reminder, notified: false } });
          } else {
            await Storage.updateTask(task.id, { reminder: { ...task.reminder, notified: false } });
          }
        }
      }
    }
  }
};
