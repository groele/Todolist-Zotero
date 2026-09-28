// Keyboard Shortcuts module

const Shortcuts = {
  isEnabled: true,

  // Initialize shortcuts
  init() {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  },

  // Handle keydown events
  handleKeyDown(e) {
    if (!this.isEnabled) return;

    // Don't trigger shortcuts when typing in inputs
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      // Allow Escape to blur inputs
      if (e.key === 'Escape') {
        target.blur();
        return;
      }
      return;
    }

    // Ctrl/Cmd + N or N: New task
    if (((e.ctrlKey || e.metaKey) && e.key === 'n') || (e.key === 'n' && !e.ctrlKey && !e.metaKey)) {
      e.preventDefault();
      Modal.openAdd();
      return;
    }

    // Ctrl/Cmd + F or /: Focus search
    if (((e.ctrlKey || e.metaKey) && e.key === 'f') || (e.key === '/' && !e.ctrlKey && !e.metaKey)) {
      e.preventDefault();
      document.getElementById('search-input')?.focus();
      return;
    }

    // Ctrl/Cmd + E: Export data
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      DataManager.exportData().then(() => UI.showToast('数据已导出'));
      return;
    }

    // 1: Switch to list view
    if (e.key === '1' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      UI.switchView('list');
      return;
    }

    // 2: Switch to calendar view
    if (e.key === '2' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      UI.switchView('calendar');
      return;
    }

    // 3: Switch to kanban view
    if (e.key === '3' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      UI.switchView('kanban');
      return;
    }

    // 4: Show stats
    if (e.key === '4' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      UI.showStats();
      return;
    }

    // T: Toggle theme
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      UI.toggleTheme();
      return;
    }

    // S: Open settings
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      UI.openSettings();
      return;
    }

    // Escape: Close modals, clear selection
    if (e.key === 'Escape') {
      e.preventDefault();
      // Close any open dialog properly
      document.querySelectorAll('dialog[open]').forEach(d => {
        if (d.id === 'task-modal' && typeof Modal !== 'undefined') {
          Modal.close();
        } else {
          d.close();
        }
      });
      // Clear batch selection
      if (TaskManager.isSelectionMode()) {
        TaskManager.clearSelection();
        UI.render();
        UI.updateBatchBar();
      }
      return;
    }

    // ?: Show shortcuts help
    if (e.key === '?') {
      e.preventDefault();
      this.showHelp();
      return;
    }
  },

  // Show shortcuts help modal
  showHelp() {
    const dialog = document.getElementById('shortcuts-modal');
    if (dialog) {
      dialog.showModal();
      return;
    }

    // Create modal if it doesn't exist
    const modal = document.createElement('dialog');
    modal.id = 'shortcuts-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-form">
        <h2>⌨️ 快捷键</h2>
        <div class="shortcuts-list">
          <div class="shortcut-item">
            <span class="shortcut-desc">新建任务</span>
            <kbd>Ctrl</kbd> + <kbd>N</kbd>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">搜索任务</span>
            <kbd>Ctrl</kbd> + <kbd>F</kbd>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">导出数据</span>
            <kbd>Ctrl</kbd> + <kbd>E</kbd>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">列表视图</span>
            <kbd>1</kbd>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">日历视图</span>
            <kbd>2</kbd>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">看板视图</span>
            <kbd>3</kbd>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">统计视图</span>
            <kbd>4</kbd>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">切换主题</span>
            <kbd>T</kbd>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">打开设置</span>
            <kbd>S</kbd>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">关闭弹窗/取消选择</span>
            <kbd>Esc</kbd>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">显示此帮助</span>
            <kbd>?</kbd>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-primary" onclick="this.closest('dialog').close()">知道了</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.showModal();
  }
};
