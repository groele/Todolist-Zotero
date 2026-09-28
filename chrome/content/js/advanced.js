// Advanced Features module

const Advanced = {
  // Search history
  searchHistory: [],
  maxHistorySize: 10,

  // Initialize
  async init() {
    await this.loadSearchHistory();
  },

  // Load search history from storage
  async loadSearchHistory() {
    const result = await new Promise(resolve => {
      chrome.storage.local.get('searchHistory', resolve);
    });
    this.searchHistory = result.searchHistory || [];
  },

  // Save search history
  async saveSearchHistory() {
    await new Promise(resolve => {
      chrome.storage.local.set({ searchHistory: this.searchHistory }, resolve);
    });
  },

  // Add to search history
  async addToSearchHistory(query) {
    if (!query || query.trim().length < 2) return;

    // Remove if already exists
    this.searchHistory = this.searchHistory.filter(h => h !== query);

    // Add to beginning
    this.searchHistory.unshift(query);

    // Limit size
    if (this.searchHistory.length > this.maxHistorySize) {
      this.searchHistory = this.searchHistory.slice(0, this.maxHistorySize);
    }

    await this.saveSearchHistory();
  },

  // Get search suggestions
  getSearchSuggestions(query) {
    if (!query) return this.searchHistory.slice(0, 5);
    return this.searchHistory.filter(h =>
      h.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5);
  },

  // Share task as text
  shareTaskAsText(task) {
    let text = `📋 ${task.title}\n`;

    if (task.description) {
      text += `\n📝 ${task.description}\n`;
    }

    if (task.dueDate) {
      text += `\n📅 截止日期: ${task.dueDate}${task.dueTime ? ' ' + task.dueTime : ''}`;
      if (Utils.isOverdue(task.dueDate)) {
        text += ' (已逾期)';
      }
    }

    text += `\n🎯 优先级: ${Utils.getPriorityLabel(task.priority)}`;

    if (task.category) {
      text += `\n📁 分类: ${task.category}`;
    }

    if (task.subtasks && task.subtasks.length > 0) {
      text += '\n\n✅ 子任务:';
      task.subtasks.forEach(st => {
        text += `\n  ${st.completed ? '☑' : '☐'} ${st.title}`;
      });
    }

    text += `\n\n状态: ${task.completed ? '已完成 ✅' : '待完成 ⏳'}`;

    return text;
  },

  // Copy to clipboard
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    }
  },

  // Export tasks to CSV
  exportToCSV(tasks) {
    const headers = ['标题', '描述', '截止日期', '时间', '优先级', '分类', '状态', '创建时间', '完成时间'];
    const rows = tasks.map(t => [
      `"${(t.title || '').replace(/"/g, '""')}"`,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      t.dueDate || '',
      t.dueTime || '',
      Utils.getPriorityLabel(t.priority),
      t.category || '',
      t.completed ? '已完成' : '待完成',
      t.createdAt || '',
      t.completedAt || ''
    ]);

    const csv = '﻿' + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    this.downloadFile(csv, 'todolist-export.csv', 'text/csv;charset=utf-8');
  },

  // Export tasks to Markdown
  exportToMarkdown(tasks) {
    let md = '# Todolist 任务导出\n\n';
    md += `导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
    md += `---\n\n`;

    // Group by status
    const incomplete = tasks.filter(t => !t.completed);
    const completed = tasks.filter(t => t.completed);

    if (incomplete.length > 0) {
      md += '## ⏳ 待完成任务\n\n';
      incomplete.forEach(t => {
        md += `- [ ] **${t.title}**`;
        if (t.dueDate) md += ` 📅 ${t.dueDate}`;
        if (t.priority === 'high') md += ' 🔴';
        if (t.category) md += ` [${t.category}]`;
        md += '\n';
        if (t.description) md += `  > ${t.description}\n`;
        if (t.subtasks?.length > 0) {
          t.subtasks.forEach(st => {
            md += `  - [${st.completed ? 'x' : ' '}] ${st.title}\n`;
          });
        }
        md += '\n';
      });
    }

    if (completed.length > 0) {
      md += '## ✅ 已完成任务\n\n';
      completed.forEach(t => {
        md += `- [x] ~~${t.title}~~`;
        if (t.completedAt) md += ` (${t.completedAt.split('T')[0]})`;
        md += '\n';
      });
    }

    this.downloadFile(md, 'todolist-export.md', 'text/markdown;charset=utf-8');
  },

  // Export tasks to plain text
  exportToText(tasks) {
    let text = 'Todolist 任务导出\n';
    text += '==================\n\n';
    text += `导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;

    const incomplete = tasks.filter(t => !t.completed);
    const completed = tasks.filter(t => t.completed);

    if (incomplete.length > 0) {
      text += '【待完成任务】\n\n';
      incomplete.forEach((t, i) => {
        text += `${i + 1}. ${t.title}`;
        if (t.dueDate) text += ` [${t.dueDate}]`;
        text += '\n';
        if (t.description) text += `   ${t.description}\n`;
      });
    }

    if (completed.length > 0) {
      text += '\n【已完成任务】\n\n';
      completed.forEach((t, i) => {
        text += `${i + 1}. ✓ ${t.title}\n`;
      });
    }

    text += `\n总计: ${tasks.length} 个任务 (待完成: ${incomplete.length}, 已完成: ${completed.length})`;

    this.downloadFile(text, 'todolist-export.txt', 'text/plain;charset=utf-8');
  },

  // Download file helper
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Print tasks
  printTasks(tasks) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const incomplete = tasks.filter(t => !t.completed);
    const completed = tasks.filter(t => t.completed);

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Todolist 打印</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; }
          h1 { color: #6366f1; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
          h2 { color: #64748b; margin-top: 30px; }
          .task { margin: 10px 0; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; }
          .task-title { font-weight: 600; }
          .task-meta { font-size: 12px; color: #64748b; margin-top: 5px; }
          .task-description { font-size: 14px; color: #475569; margin-top: 5px; }
          .completed { text-decoration: line-through; opacity: 0.7; }
          .priority-high { border-left: 4px solid #ef4444; }
          .priority-medium { border-left: 4px solid #f59e0b; }
          .priority-low { border-left: 4px solid #22c55e; }
          .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>📋 Todolist</h1>
        <p>打印时间: ${new Date().toLocaleString('zh-CN')}</p>

        <div class="no-print" style="margin: 20px 0;">
          <button onclick="window.print()" style="padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer;">打印</button>
        </div>
    `;

    if (incomplete.length > 0) {
      html += '<h2>⏳ 待完成任务</h2>';
      incomplete.forEach(t => {
        html += `
          <div class="task priority-${t.priority}">
            <div class="task-title">${t.title}</div>
            ${t.description ? `<div class="task-description">${t.description}</div>` : ''}
            <div class="task-meta">
              ${t.dueDate ? `📅 ${t.dueDate}` : ''}
              ${t.category ? ` | 📁 ${t.category}` : ''}
              | 优先级: ${Utils.getPriorityLabel(t.priority)}
            </div>
          </div>
        `;
      });
    }

    if (completed.length > 0) {
      html += '<h2>✅ 已完成任务</h2>';
      completed.forEach(t => {
        html += `
          <div class="task completed">
            <div class="task-title">${t.title}</div>
            <div class="task-meta">${t.completedAt ? `完成于: ${t.completedAt.split('T')[0]}` : ''}</div>
          </div>
        `;
      });
    }

    html += `
        <div class="footer">
          总计: ${tasks.length} 个任务 (待完成: ${incomplete.length}, 已完成: ${completed.length})
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  },

  // Generate task summary
  generateSummary(tasks) {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const overdue = tasks.filter(t => !t.completed && Utils.isOverdue(t.dueDate)).length;
    const today = tasks.filter(t => !t.completed && Utils.isToday(t.dueDate)).length;

    let summary = `📊 任务概览\n`;
    summary += `━━━━━━━━━━━━━━\n`;
    summary += `📋 总任务: ${total}\n`;
    summary += `✅ 已完成: ${completed} (${total > 0 ? Math.round(completed / total * 100) : 0}%)\n`;
    summary += `⏳ 待完成: ${total - completed}\n`;
    summary += `⚠️ 已逾期: ${overdue}\n`;
    summary += `📅 今日待办: ${today}\n`;

    return summary;
  },

  // Get priority color for labels
  getPriorityLabel(priority) {
    const labels = {
      high: { text: '高', color: '#ef4444' },
      medium: { text: '中', color: '#f59e0b' },
      low: { text: '低', color: '#22c55e' }
    };
    return labels[priority] || labels.medium;
  }
};
