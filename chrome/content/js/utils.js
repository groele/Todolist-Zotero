// Utility functions for Todolist extension

const Utils = {
  // Generate unique ID for tasks
  generateId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    return `task_${timestamp}_${random}`;
  },

  // Safe local date parser for YYYY-MM-DD strings
  parseLocalDate(isoDate) {
    if (!isoDate) return null;
    const cleanDate = String(isoDate).split('T')[0];
    const parts = cleanDate.split('-');
    if (parts.length !== 3) return new Date(isoDate);
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d, 0, 0, 0, 0);
  },

  // Format date to readable string (e.g., "Jun 15")
  formatDate(isoDate) {
    if (!isoDate) return '';
    const date = this.parseLocalDate(isoDate);
    if (!date || isNaN(date.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  },

  // Format relative date (e.g., "Today", "Tomorrow", "Overdue by 2 days")
  formatRelativeDate(isoDate) {
    if (!isoDate) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = this.parseLocalDate(isoDate);
    if (!target || isNaN(target.getTime())) return '';

    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '明天';
    if (diffDays === -1) return '昨天';
    if (diffDays < -1) return `逾期 ${Math.abs(diffDays)} 天`;
    if (diffDays > 1 && diffDays <= 7) return `${diffDays} 天后`;

    return Utils.formatDate(isoDate);
  },

  // Check if date is overdue
  isOverdue(isoDate) {
    if (!isoDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = this.parseLocalDate(isoDate);
    return target ? target < today : false;
  },

  // Check if date is today
  isToday(isoDate) {
    if (!isoDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = this.parseLocalDate(isoDate);
    return target ? target.getTime() === today.getTime() : false;
  },

  // Check if date is tomorrow
  isTomorrow(isoDate) {
    if (!isoDate) return false;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const target = this.parseLocalDate(isoDate);
    return target ? target.getTime() === tomorrow.getTime() : false;
  },

  // Check if date is in the upcoming week (within 7 days)
  isUpcoming(isoDate) {
    if (!isoDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekLater = new Date(today);
    weekLater.setDate(weekLater.getDate() + 7);
    const target = this.parseLocalDate(isoDate);
    return target ? (target > today && target <= weekLater) : false;
  },

  // Escape HTML to prevent XSS
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // Get today's date as ISO string (YYYY-MM-DD) using local time
  getTodayISO() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  // Get priority color
  getPriorityColor(priority) {
    const colors = {
      high: '#ef4444',
      medium: '#f59e0b',
      low: '#22c55e'
    };
    return colors[priority] || colors.medium;
  },

  // Get priority label in Chinese
  getPriorityLabel(priority) {
    const labels = {
      high: '高',
      medium: '中',
      low: '低'
    };
    return labels[priority] || '中';
  },

  // Debounce function
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
};
