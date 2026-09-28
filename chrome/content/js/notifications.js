// Notifications module for reminders and daily summary

const Notifications = {
  // Check if notifications are supported
  isSupported() {
    return 'Notification' in window || chrome.notifications;
  },

  // Request notification permission
  async requestPermission() {
    if (chrome.notifications) {
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
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      // AudioContext muted/blocked
    }
  },

  // Show notification
  async show(title, body, options = {}) {
    if (options.playSound !== false) {
      this.playChime();
    }

    if (chrome.notifications) {
      // Use Chrome notifications API
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon-128.png',
        title: title,
        message: body,
        priority: options.priority || 1,
        requireInteraction: options.requireInteraction || false
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      // Use web notifications
      new Notification(title, {
        body: body,
        icon: 'images/icon-128.png',
        ...options
      });
    }
  },

  // Check for due tasks and send reminders
  async checkReminders() {
    const tasks = await Storage.getTasks();
    const now = new Date();

    for (const task of tasks) {
      if (task.completed || !task.dueDate) continue;
      if (!task.reminder?.enabled) continue;
      if (task.reminder.notified) continue;

      // Calculate reminder time
      const dueDate = new Date(task.dueDate + 'T' + (task.dueTime || '23:59'));
      const reminderMinutes = task.reminder?.before || 15;
      const reminderTime = new Date(dueDate.getTime() - reminderMinutes * 60 * 1000);

      // Check if it's time for reminder
      if (now >= reminderTime && now < dueDate) {
        const minutesLeft = Math.round((dueDate - now) / (1000 * 60));

        let body = '';
        if (minutesLeft <= 0) {
          body = `任务 "${task.title}" 已到期！`;
        } else if (minutesLeft < 60) {
          body = `任务 "${task.title}" 将在 ${minutesLeft} 分钟后到期`;
        } else {
          const hoursLeft = Math.round(minutesLeft / 60);
          body = `任务 "${task.title}" 将在 ${hoursLeft} 小时后到期`;
        }

        await this.show('📋 任务提醒', body, {
          requireInteraction: true,
          priority: 2
        });

        // Mark as notified (partial update via TaskManager to sync in-memory cache)
        if (typeof TaskManager !== 'undefined' && TaskManager.updateTask) {
          await TaskManager.updateTask(task.id, { reminder: { ...task.reminder, notified: true } });
        } else {
          await Storage.updateTask(task.id, { reminder: { ...task.reminder, notified: true } });
        }
      }
    }
  },

  // Send daily summary
  async sendDailySummary() {
    const tasks = await Storage.getTasks();
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
    const tasks = await Storage.getTasks();
    const now = new Date();

    for (const task of tasks) {
      if (task.reminder?.notified && !task.completed) {
        const dueDate = new Date(task.dueDate + 'T' + (task.dueTime || '23:59'));
        if (dueDate > now) {
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
