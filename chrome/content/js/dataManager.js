// Data Manager - Export, Import, Clear, and Statistics

const DataManager = {
  // Export all data to JSON (including tasks, settings, customTags, customTemplates, searchHistory, activeTimers)
  async exportData() {
    const data = await Storage.getAll();
    const extraData = await new Promise(resolve => {
      chrome.storage.local.get(['customTags', 'customTemplates', 'searchHistory', 'activeTimers'], resolve);
    });

    const exportData = {
      version: '3.3.0',
      exportDate: new Date().toISOString(),
      tasks: data.tasks,
      settings: data.settings,
      customTags: extraData.customTags || [],
      customTemplates: extraData.customTemplates || [],
      searchHistory: extraData.searchHistory || [],
      activeTimers: extraData.activeTimers || {}
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `todolist-backup-${Utils.getTodayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return true;
  },

  // Import data from JSON file
  async importData(file, mode = 'merge') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const importData = JSON.parse(e.target.result);

          // Validate data structure
          if (!importData.tasks || !Array.isArray(importData.tasks)) {
            reject(new Error('无效的数据格式：缺少任务数组'));
            return;
          }

          // Validate each task
          const validTasks = importData.tasks.filter(task => {
            return task.id && task.title && typeof task.completed === 'boolean';
          });

          if (mode === 'replace') {
            // Replace all data
            await Storage.saveTasks(validTasks);
            if (importData.settings) {
              await Storage.saveSettings(importData.settings);
            }
            if (importData.customTags) {
              await new Promise(r => chrome.storage.local.set({ customTags: importData.customTags }, r));
            }
            if (importData.customTemplates) {
              await new Promise(r => chrome.storage.local.set({ customTemplates: importData.customTemplates }, r));
            }
          } else {
            // Merge mode - add new tasks, skip duplicates
            const existingTasks = await Storage.getTasks();
            const existingIds = new Set(existingTasks.map(t => t.id));
            const newTasks = validTasks.filter(t => !existingIds.has(t.id));

            await Storage.saveTasks([...existingTasks, ...newTasks]);

            // Merge custom tags
            if (importData.customTags && Array.isArray(importData.customTags)) {
              const currentTags = await new Promise(r => chrome.storage.local.get('customTags', r)).then(res => res.customTags || []);
              const tagIds = new Set(currentTags.map(t => t.id));
              const mergedTags = [...currentTags, ...importData.customTags.filter(t => !tagIds.has(t.id))];
              await new Promise(r => chrome.storage.local.set({ customTags: mergedTags }, r));
            }

            // Merge custom templates
            if (importData.customTemplates && Array.isArray(importData.customTemplates)) {
              const currentTpls = await new Promise(r => chrome.storage.local.get('customTemplates', r)).then(res => res.customTemplates || []);
              const tplIds = new Set(currentTpls.map(t => t.id));
              const mergedTpls = [...currentTpls, ...importData.customTemplates.filter(t => !tplIds.has(t.id))];
              await new Promise(r => chrome.storage.local.set({ customTemplates: mergedTpls }, r));
            }
          }

          // Reload in-memory modules
          await TaskManager.loadTasks();
          if (typeof Tags !== 'undefined' && Tags.loadCustomTags) await Tags.loadCustomTags();
          if (typeof Templates !== 'undefined' && Templates.loadCustomTemplates) await Templates.loadCustomTemplates();

          resolve({
            imported: validTasks.length,
            mode: mode
          });
        } catch (error) {
          reject(new Error('解析文件失败：' + error.message));
        }
      };

      reader.onerror = () => {
        reject(new Error('读取文件失败'));
      };

      reader.readAsText(file);
    });
  },

  // Clear all tasks
  async clearAllTasks() {
    await Storage.saveTasks([]);
    await TaskManager.loadTasks();
    return true;
  },

  // Get statistics
  async getStats() {
    const tasks = await Storage.getTasks();
    const now = new Date();
    const today = Utils.getTodayISO();

    // Basic counts
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const incomplete = total - completed;
    const overdue = tasks.filter(t => !t.completed && Utils.isOverdue(t.dueDate)).length;
    const todayTasks = tasks.filter(t => !t.completed && Utils.isToday(t.dueDate)).length;

    // Completion rate
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Category distribution
    const categories = {};
    tasks.forEach(t => {
      const cat = t.category || '未分类';
      categories[cat] = (categories[cat] || 0) + 1;
    });

    // Priority distribution
    const priorities = { high: 0, medium: 0, low: 0 };
    tasks.forEach(t => {
      if (priorities[t.priority] !== undefined) {
        priorities[t.priority]++;
      }
    });

    // Weekly completion trend (last 7 days)
    const weeklyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayCompleted = tasks.filter(t =>
        t.completed && t.completedAt && t.completedAt.startsWith(dateStr)
      ).length;
      weeklyTrend.push({
        date: dateStr,
        day: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()],
        count: dayCompleted
      });
    }

    // Average completion time (for completed tasks with due date)
    const completedWithDate = tasks.filter(t => t.completed && t.dueDate && t.completedAt);
    let avgDaysEarly = 0;
    if (completedWithDate.length > 0) {
      const totalDaysEarly = completedWithDate.reduce((sum, t) => {
        const due = new Date(t.dueDate);
        const completedDate = new Date(t.completedAt);
        return sum + (due - completedDate) / (1000 * 60 * 60 * 24);
      }, 0);
      avgDaysEarly = Math.round(totalDaysEarly / completedWithDate.length * 10) / 10;
    }

    return {
      total,
      completed,
      incomplete,
      overdue,
      todayTasks,
      completionRate,
      categories,
      priorities,
      weeklyTrend,
      avgDaysEarly
    };
  },

  // Generate stats HTML
  async renderStats() {
    const stats = await this.getStats();

    return `
      <div class="stats-container">
        <div class="stats-header">
          <h3>数据统计</h3>
          <button id="btn-close-stats" class="btn-icon" title="关闭">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div class="stats-overview">
          <div class="stat-card">
            <div class="stat-number">${stats.total}</div>
            <div class="stat-label">总任务</div>
          </div>
          <div class="stat-card completed">
            <div class="stat-number">${stats.completed}</div>
            <div class="stat-label">已完成</div>
          </div>
          <div class="stat-card pending">
            <div class="stat-number">${stats.incomplete}</div>
            <div class="stat-label">待完成</div>
          </div>
          <div class="stat-card overdue">
            <div class="stat-number">${stats.overdue}</div>
            <div class="stat-label">已逾期</div>
          </div>
        </div>

        <div class="stats-progress">
          <div class="progress-label">
            <span>完成率</span>
            <span>${stats.completionRate}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${stats.completionRate}%"></div>
          </div>
        </div>

        <div class="stats-chart">
          <h4>近7天完成趋势</h4>
          <div class="chart-bars">
            ${stats.weeklyTrend.map(day => `
              <div class="chart-bar-group">
                <div class="chart-bar" style="height: ${Math.max(4, day.count * 20)}px">
                  <span class="chart-value">${day.count}</span>
                </div>
                <span class="chart-label">${day.day}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="stats-distribution">
          <h4>优先级分布</h4>
          <div class="distribution-bars">
            <div class="dist-item">
              <span class="dist-label high">高</span>
              <div class="dist-bar">
                <div class="dist-fill high" style="width: ${stats.total > 0 ? (stats.priorities.high / stats.total * 100) : 0}%"></div>
              </div>
              <span class="dist-count">${stats.priorities.high}</span>
            </div>
            <div class="dist-item">
              <span class="dist-label medium">中</span>
              <div class="dist-bar">
                <div class="dist-fill medium" style="width: ${stats.total > 0 ? (stats.priorities.medium / stats.total * 100) : 0}%"></div>
              </div>
              <span class="dist-count">${stats.priorities.medium}</span>
            </div>
            <div class="dist-item">
              <span class="dist-label low">低</span>
              <div class="dist-bar">
                <div class="dist-fill low" style="width: ${stats.total > 0 ? (stats.priorities.low / stats.total * 100) : 0}%"></div>
              </div>
              <span class="dist-count">${stats.priorities.low}</span>
            </div>
          </div>
        </div>

        <div class="stats-distribution">
          <h4>分类分布</h4>
          <div class="distribution-bars">
            ${Object.entries(stats.categories).map(([cat, count]) => `
              <div class="dist-item">
                <span class="dist-label">${cat}</span>
                <div class="dist-bar">
                  <div class="dist-fill" style="width: ${stats.total > 0 ? (count / stats.total * 100) : 0}%; background-color: var(--primary);"></div>
                </div>
                <span class="dist-count">${count}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="stats-info">
          <p>📊 平均提前完成：${stats.avgDaysEarly} 天</p>
          <p>📅 今日待办：${stats.todayTasks} 个任务</p>
        </div>
      </div>
    `;
  }
};
