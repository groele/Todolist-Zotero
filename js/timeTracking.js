// Time Tracking module

const TimeTracking = {
  // Active timers
  activeTimers: {},

  // Initialize
  async init() {
    await this.loadTimers();
  },

  // Load active timers from storage
  async loadTimers() {
    const result = await new Promise(resolve => {
      chrome.storage.local.get('activeTimers', resolve);
    });
    this.activeTimers = result.activeTimers || {};
  },

  // Save active timers
  async saveTimers() {
    await new Promise(resolve => {
      chrome.storage.local.set({ activeTimers: this.activeTimers }, resolve);
    });
  },

  // Start timer for task
  async startTimer(taskId) {
    this.activeTimers[taskId] = {
      startTime: Date.now(),
      elapsed: 0
    };
    await this.saveTimers();
    return this.activeTimers[taskId];
  },

  // Stop timer for task
  async stopTimer(taskId) {
    const timer = this.activeTimers[taskId];
    if (!timer) return null;

    const elapsed = Date.now() - timer.startTime;
    delete this.activeTimers[taskId];
    await this.saveTimers();

    // Save to task history
    await this.addTimeEntry(taskId, elapsed);

    return elapsed;
  },

  // Get current elapsed time
  getElapsedTime(taskId) {
    const timer = this.activeTimers[taskId];
    if (!timer) return 0;
    return Date.now() - timer.startTime;
  },

  // Check if timer is running
  isTimerRunning(taskId) {
    return !!this.activeTimers[taskId];
  },

  // Add time entry to task
  async addTimeEntry(taskId, elapsed) {
    const task = await Storage.getTaskById(taskId);
    if (!task) return;

    const timeEntries = task.timeEntries || [];
    timeEntries.push({
      date: new Date().toISOString(),
      duration: elapsed
    });

    await Storage.updateTask(taskId, { timeEntries });
  },

  // Get total time for task
  async getTotalTime(taskId) {
    const task = await Storage.getTaskById(taskId);
    if (!task) return 0;

    const entries = task.timeEntries || [];
    const total = entries.reduce((sum, entry) => sum + entry.duration, 0);

    // Add current timer if running
    if (this.isTimerRunning(taskId)) {
      return total + this.getElapsedTime(taskId);
    }

    return total;
  },

  // Format duration
  formatDuration(ms) {
    if (!ms || ms <= 0) return '0秒';
    if (ms < 1000) return '< 1秒';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}小时${minutes % 60}分钟`;
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds % 60}秒`;
    } else {
      return `${seconds}秒`;
    }
  },

  // Format duration short
  formatDurationShort(ms) {
    if (!ms || ms <= 0) return '0s';
    if (ms < 1000) return '< 1s';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  },

  // Get time stats for task
  async getTimeStats(taskId) {
    const task = await Storage.getTaskById(taskId);
    if (!task) return null;

    const entries = task.timeEntries || [];
    const totalTime = entries.reduce((sum, entry) => sum + entry.duration, 0);
    const sessionCount = entries.length;
    const avgSession = sessionCount > 0 ? totalTime / sessionCount : 0;

    return {
      totalTime,
      sessionCount,
      avgSession,
      formatted: {
        total: this.formatDuration(totalTime),
        avg: this.formatDuration(avgSession)
      }
    };
  },

  // Render timer button
  renderTimerButton(taskId) {
    const isRunning = this.isTimerRunning(taskId);
    const elapsed = this.getElapsedTime(taskId);
    const icon = isRunning
      ? `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
      : `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>`;

    return `
      <button class="timer-btn ${isRunning ? 'running' : ''}" data-task-id="${taskId}" title="${isRunning ? '停止计时' : '开始计时'}">
        ${icon}
        ${isRunning ? `<span class="timer-display">${this.formatDurationShort(elapsed)}</span>` : ''}
      </button>
    `;
  },

  // Render time stats
  renderTimeStats(task) {
    const entries = task.timeEntries || [];
    if (entries.length === 0) return '';

    const totalTime = entries.reduce((sum, entry) => sum + entry.duration, 0);

    return `
      <div class="time-stats">
        <span class="time-stats-icon">
          <svg viewBox="0 0 24 24" width="12" height="12">
            <path fill="currentColor" d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
          </svg>
        </span>
        <span class="time-stats-value">${this.formatDurationShort(totalTime)}</span>
      </div>
    `;
  }
};
