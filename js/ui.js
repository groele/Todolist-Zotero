// UI module - DOM rendering and event handling

const UI = {
  currentView: 'list',
  currentFilter: 'all',
  currentSearch: '',
  currentPriorityFilter: 'all',
  currentSortOrder: 'dueDate',
  currentTheme: 'light',

  // Initialize UI
  async init() {
    // Load theme preference
    const settings = await Storage.getSettings();
    this.currentTheme = settings.theme || 'light';
    this.applyTheme(this.currentTheme);

    this.setupEventListeners();
    await TaskManager.loadTasks();
    this.render();

    // Initialize drag and drop
    DragDrop.init();

    // Initialize keyboard shortcuts
    Shortcuts.init();

    // Load templates
    await Templates.loadCustomTemplates();

    // Check for pending task from context menu
    this.checkPendingTask();

    // Listen for context menu task messages
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'CONTEXT_MENU_TASK') {
        this.checkPendingTask();
      }
    });
  },

  // Check for pending task from context menu
  async checkPendingTask() {
    const result = await new Promise(resolve => {
      chrome.storage.local.get('pendingTask', resolve);
    });

    if (result.pendingTask) {
      // Clear the pending task
      await chrome.storage.local.remove('pendingTask');

      // Open modal with the task data
      Modal.openAdd({
        title: result.pendingTask.title,
        description: result.pendingTask.description || ''
      });
    }
  },

  // Setup event listeners
  setupEventListeners() {
    // Add task button
    document.getElementById('btn-add').addEventListener('click', () => {
      Modal.openAdd();
    });

    // Add first task button (empty state)
    document.getElementById('btn-add-first')?.addEventListener('click', () => {
      Modal.openAdd();
    });

    // Toggle view button
    document.getElementById('btn-toggle-view').addEventListener('click', () => {
      this.cycleView();
    });

    // Theme toggle button
    document.getElementById('btn-theme')?.addEventListener('click', () => {
      this.toggleTheme();
    });

    // Stats button
    document.getElementById('btn-stats')?.addEventListener('click', () => {
      this.showStats();
    });

    // Settings buttons (directly opens Zotero native preferences)
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      this.openSettings();
    });
    document.getElementById('btn-zotero-prefs')?.addEventListener('click', () => {
      this.openSettings();
    });

    // Zotero window mode dropdown
    const btnWinMode = document.getElementById('btn-zotero-window-mode');
    btnWinMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      const existingMenu = document.querySelector('.zotero-mode-dropdown');
      if (existingMenu) {
        existingMenu.remove();
        return;
      }

      const params = new URLSearchParams(window.location.search || '');
      const curMode = params.get('mode') || window.arguments?.[0]?.options?.currentWindowType || 'tab';

      const menu = document.createElement('div');
      menu.className = 'zotero-mode-dropdown';
      menu.innerHTML = `
        <button class="zotero-mode-item ${curMode === 'tab' ? 'active' : ''}" data-mode="tab">📑 标签页模式 (Tab)</button>
        <button class="zotero-mode-item ${curMode === 'subwindow' ? 'active' : ''}" data-mode="subwindow">🗗 伴读子窗口 (460×760)</button>
        <button class="zotero-mode-item ${curMode === 'window' ? 'active' : ''}" data-mode="window">⬚ 独立桌面大窗口 (1120×760)</button>
      `;

      btnWinMode.parentElement.style.position = 'relative';
      btnWinMode.parentElement.appendChild(menu);

      menu.querySelectorAll('.zotero-mode-item').forEach((item) => {
        item.addEventListener('click', (evt) => {
          evt.stopPropagation();
          const targetMode = item.dataset.mode;
          menu.remove();
          if (typeof ZoteroBridge !== 'undefined') {
            ZoteroBridge.switchWindowMode(targetMode);
          }
        });
      });

      const closeHandler = () => {
        menu.remove();
        document.removeEventListener('click', closeHandler);
      };
      setTimeout(() => document.addEventListener('click', closeHandler), 50);
    });

    // Zotero native preferences
    document.getElementById('btn-zotero-prefs')?.addEventListener('click', () => {
      if (typeof ZoteroBridge !== 'undefined') {
        ZoteroBridge.openPreferences();
      }
    });

    // Drag & drop literature from Zotero library pane
    const viewsContainer = document.querySelector('.views-container');
    if (viewsContainer) {
      viewsContainer.addEventListener('dragover', (e) => {
        if (typeof ZoteroBridge !== 'undefined' && ZoteroBridge.isZotero) {
          e.preventDefault();
          viewsContainer.classList.add('drag-over-zotero');
        }
      });

      viewsContainer.addEventListener('dragleave', () => {
        viewsContainer.classList.remove('drag-over-zotero');
      });

      viewsContainer.addEventListener('drop', async (e) => {
        viewsContainer.classList.remove('drag-over-zotero');
        if (typeof ZoteroBridge !== 'undefined' && ZoteroBridge.isZotero) {
          e.preventDefault();
          const activeItem = await ZoteroBridge.getActiveItem();
          if (activeItem) {
            await TaskManager.createTask({
              title: `📖 研读：${activeItem.title}`,
              category: '论文研读',
              priority: 'medium',
              literature: activeItem
            });
            this.render();
            this.showToast(`已为《${activeItem.title.slice(0, 20)}...》创建研读待办`);
          }
        }
      });
    }

    // Templates button
    document.getElementById('btn-templates')?.addEventListener('click', () => {
      this.openTemplates();
    });

    // Search input
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', Utils.debounce((e) => {
      this.currentSearch = e.target.value;
      this.render();
      this.updateSearchSuggestions(e.target.value);
    }, 300));

    searchInput.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter' && searchInput.value.trim()) {
        await Advanced.addToSearchHistory(searchInput.value.trim());
      }
    });

    // Filter select
    document.getElementById('filter-select')?.addEventListener('change', (e) => {
      this.currentPriorityFilter = e.target.value;
      this.render();
    });

    // Category select
    document.getElementById('category-select')?.addEventListener('change', (e) => {
      this.currentCategoryFilter = e.target.value;
      this.render();
    });

    // Sort select
    document.getElementById('sort-select')?.addEventListener('change', (e) => {
      this.currentSortOrder = e.target.value;
      this.render();
    });

    // Filter tabs
    document.querySelectorAll('.filter-tabs .tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.currentFilter = e.target.dataset.filter;
        this.updateActiveTab();
        this.render();
      });
    });

    // Task list event delegation
    document.getElementById('task-list').addEventListener('click', (e) => {
      this.handleTaskListClick(e);
    });

    document.getElementById('task-list').addEventListener('keydown', async (e) => {
      if (e.target.classList.contains('card-add-subtask-input') && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const input = e.target;
        const title = input.value.trim();
        const taskId = input.dataset.taskId;
        if (title && taskId) {
          await TaskManager.addSubtask(taskId, title);
          this.render();
          const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
          const newInput = card?.querySelector('.card-add-subtask-input');
          if (newInput) newInput.focus();
        }
      }
    });

    // Double-click inline subtask edit
    document.getElementById('task-list').addEventListener('dblclick', async (e) => {
      const textEl = e.target.closest('.card-subtask-text');
      if (!textEl) return;
      e.stopPropagation();

      const itemEl = textEl.closest('.card-subtask-item');
      const cardEl = textEl.closest('.task-card');
      if (!itemEl || !cardEl) return;

      const subtaskId = itemEl.querySelector('.card-subtask-checkbox')?.dataset.subtaskId;
      const taskId = cardEl.dataset.taskId;
      if (!subtaskId || !taskId) return;

      const currentTitle = textEl.textContent.trim();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'card-add-subtask-input';
      input.style.padding = '1px 4px';
      input.value = currentTitle;

      textEl.replaceWith(input);
      input.focus();
      input.select();

      let saved = false;
      const save = async () => {
        if (saved) return;
        saved = true;
        const val = input.value.trim();
        if (val && val !== currentTitle) {
          await TaskManager.updateSubtask(taskId, subtaskId, val);
        }
        this.render();
      };

      input.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') {
          evt.preventDefault();
          save();
        } else if (evt.key === 'Escape') {
          saved = true;
          this.render();
        }
      });
      input.addEventListener('blur', save);
    });

    // Double-click inline task title edit
    document.getElementById('task-list').addEventListener('dblclick', async (e) => {
      const titleEl = e.target.closest('.task-title');
      if (!titleEl) return;
      e.stopPropagation();

      const cardEl = titleEl.closest('.task-card');
      if (!cardEl) return;
      const taskId = cardEl.dataset.taskId;
      const task = TaskManager.getTaskById(taskId);
      if (!task) return;

      const currentTitle = task.title;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'card-add-subtask-input';
      input.style.fontSize = '14px';
      input.style.fontWeight = '500';
      input.value = currentTitle;

      titleEl.replaceWith(input);
      input.focus();
      input.select();

      let saved = false;
      const save = async () => {
        if (saved) return;
        saved = true;
        const val = input.value.trim();
        if (val && val !== currentTitle) {
          await TaskManager.updateTask(taskId, { title: val });
        }
        this.render();
      };

      input.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') {
          evt.preventDefault();
          save();
        } else if (evt.key === 'Escape') {
          saved = true;
          this.render();
        }
      });
      input.addEventListener('blur', save);
    });

    // Double-click inline task description edit
    document.getElementById('task-list').addEventListener('dblclick', async (e) => {
      const descEl = e.target.closest('.task-description');
      if (!descEl) return;
      e.stopPropagation();

      const cardEl = descEl.closest('.task-card');
      if (!cardEl) return;
      const taskId = cardEl.dataset.taskId;
      const task = TaskManager.getTaskById(taskId);
      if (!task) return;

      const currentDesc = task.description || '';
      const input = document.createElement('textarea');
      input.className = 'card-add-subtask-input';
      input.style.fontSize = '12px';
      input.style.minHeight = '45px';
      input.style.resize = 'vertical';
      input.value = currentDesc;

      descEl.replaceWith(input);
      input.focus();
      input.select();

      let saved = false;
      const save = async () => {
        if (saved) return;
        saved = true;
        const val = input.value.trim();
        if (val !== currentDesc) {
          await TaskManager.updateTask(taskId, { description: val });
        }
        this.render();
      };

      input.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
          evt.preventDefault();
          save();
        } else if (evt.key === 'Escape') {
          saved = true;
          this.render();
        }
      });
      input.addEventListener('blur', save);
    });

    // Kanban view event delegation
    document.getElementById('kanban-view')?.addEventListener('click', (e) => {
      this.handleKanbanClick(e);
    });

    // Calendar date click - switch to list view and show filtered tasks
    Calendar.onDateClick(async (dateStr) => {
      this.currentFilter = 'date';
      this.updateActiveTab();
      if (this.currentView !== 'list') {
        this.currentView = 'list';
        // Show list view, hide others
        document.getElementById('list-view').classList.add('active');
        document.getElementById('list-view').classList.remove('hidden');
        document.getElementById('calendar-view').classList.remove('active');
        document.getElementById('calendar-view').classList.add('hidden');
        document.getElementById('kanban-view')?.classList.remove('active');
        document.getElementById('kanban-view')?.classList.add('hidden');
        document.getElementById('stats-view')?.classList.remove('active');
        document.getElementById('stats-view')?.classList.add('hidden');
        // Update toggle button
        const btn = document.getElementById('btn-toggle-view');
        if (btn) {
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/></svg>';
          btn.title = '日历视图';
        }
      }
      this.render();
    });

    // Batch operations
    document.getElementById('btn-batch-complete')?.addEventListener('click', async () => {
      const count = await TaskManager.batchComplete();
      this.showToast(`已完成 ${count} 个任务`);
      this.render();
      this.updateBatchBar();
    });

    document.getElementById('btn-batch-delete')?.addEventListener('click', async () => {
      const count = await TaskManager.batchDelete();
      this.showToast(`已删除 ${count} 个任务`);
      this.render();
      this.updateBatchBar();
    });

    document.getElementById('btn-batch-cancel')?.addEventListener('click', () => {
      TaskManager.clearSelection();
      this.render();
      this.updateBatchBar();
    });

    // Long press for selection mode
    let longPressTimer = null;
    document.getElementById('task-list').addEventListener('mousedown', (e) => {
      const taskCard = e.target.closest('.task-card');
      if (!taskCard) return;

      longPressTimer = setTimeout(() => {
        this._justLongPressed = true;
        TaskManager.setSelectionMode(true);
        const taskId = taskCard.dataset.taskId;
        TaskManager.toggleSelection(taskId);
        this.render();
        this.updateBatchBar();
      }, 500);
    });

    document.getElementById('task-list').addEventListener('mouseup', () => {
      clearTimeout(longPressTimer);
    });

    document.getElementById('task-list').addEventListener('mouseleave', () => {
      clearTimeout(longPressTimer);
    });
  },

  // Handle task list clicks
  async handleTaskListClick(e) {
    if (this._justLongPressed) {
      this._justLongPressed = false;
      return;
    }

    const taskCard = e.target.closest('.task-card');
    if (!taskCard) return;

    const taskId = taskCard.dataset.taskId;

    // In selection mode, clicking anywhere on card toggles selection
    if (TaskManager.isSelectionMode()) {
      TaskManager.toggleSelection(taskId);
      this.render();
      this.updateBatchBar();
      return;
    }

    // Tag click to filter
    const tagBadge = e.target.closest('.tag-badge-small');
    if (tagBadge) {
      e.stopPropagation();
      const text = tagBadge.textContent.trim();
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.value = text;
        this.currentSearch = text;
        this.render();
      }
      return;
    }

    // Category click to filter
    const categoryBadge = e.target.closest('.task-category');
    if (categoryBadge) {
      e.stopPropagation();
      const text = categoryBadge.textContent.trim();
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.value = text;
        this.currentSearch = text;
        this.render();
      }
      return;
    }

    // Inline subtask input click
    if (e.target.closest('.card-add-subtask-input')) {
      e.stopPropagation();
      return;
    }

    // Inline subtask checkbox click
    const subtaskCheckbox = e.target.closest('.card-subtask-checkbox');
    if (subtaskCheckbox) {
      e.stopPropagation();
      const subtaskId = subtaskCheckbox.dataset.subtaskId;
      await TaskManager.toggleSubtask(taskId, subtaskId);
      this.render();
      return;
    }

    // Inline subtask delete button click
    const deleteSubtaskBtn = e.target.closest('.btn-card-delete-subtask');
    if (deleteSubtaskBtn) {
      e.stopPropagation();
      const subtaskId = deleteSubtaskBtn.dataset.subtaskId;
      await TaskManager.deleteSubtask(taskId, subtaskId);
      this.render();
      return;
    }

    // Checkbox click
    if (e.target.closest('.task-checkbox')) {
      e.stopPropagation();
      await this.handleToggleComplete(taskId, taskCard);
      return;
    }

    // Delete button click
    if (e.target.closest('.task-action.delete')) {
      e.stopPropagation();
      await this.handleDeleteTask(taskId, taskCard);
      return;
    }

    // Edit button click
    if (e.target.closest('.task-action.edit')) {
      e.stopPropagation();
      Modal.openEdit(taskId);
      return;
    }

    // Duplicate button click
    if (e.target.closest('.task-action.duplicate')) {
      e.stopPropagation();
      await this.handleDuplicateTask(taskId);
      return;
    }

    // Timer button click
    if (e.target.closest('.task-action.timer')) {
      e.stopPropagation();
      await this.handleTimerToggle(taskId);
      return;
    }

    // PDF companion reader button click
    if (e.target.closest('.btn-card-open-pdf')) {
      e.stopPropagation();
      const task = TaskManager.getTaskById(taskId);
      if (typeof ZoteroBridge !== 'undefined' && task?.zoteroItemKey) {
        let page = null;
        if (task.zoteroPage) {
          page = Number(task.zoteroPage);
        } else if (task.zoteroPdfUri) {
          const m = String(task.zoteroPdfUri).match(/[?&]page=(\d+)/);
          if (m) page = Number(m[1]);
        }
        ZoteroBridge.openPdf(task.zoteroItemKey, null, page);
      }
      return;
    }

    // Zotero copy citation button click
    if (e.target.closest('.task-action.zotero-copy-citation')) {
      e.stopPropagation();
      const task = TaskManager.getTaskById(taskId);
      if (task) {
        let citation = '';
        if (task.zoteroAuthor && task.zoteroYear) {
          citation = `${task.zoteroAuthor} (${task.zoteroYear}). ${task.zoteroItemTitle || task.title}`;
        } else if (task.zoteroItemTitle) {
          citation = `《${task.zoteroItemTitle}》`;
        } else {
          citation = task.title;
        }
        if (typeof Advanced !== 'undefined' && Advanced.copyToClipboard) {
          Advanced.copyToClipboard(citation);
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(citation);
        }
        this.showToast(`已复制文献引用: ${citation.slice(0, 32)}${citation.length > 32 ? '…' : ''}`);
      }
      return;
    }

    // Zotero sync note button click
    if (e.target.closest('.task-action.zotero-sync-note')) {
      e.stopPropagation();
      const task = TaskManager.getTaskById(taskId);
      if (typeof ZoteroBridge !== 'undefined' && task?.zoteroItemKey) {
        this.showToast('正在同步至文献笔记...');
        ZoteroBridge.syncChildNote(task.zoteroItemKey).then((res) => {
          if (res?.success) {
            this.showToast('已同步至文献笔记');
          }
        });
      }
      return;
    }

    // Zotero badge or locate button click
    if (e.target.closest('.task-action.zotero-locate') || e.target.closest('.task-zotero-badge-main') || e.target.closest('.task-zotero-badge')) {
      e.stopPropagation();
      const task = TaskManager.getTaskById(taskId);
      if (typeof ZoteroBridge !== 'undefined' && task?.zoteroItemKey) {
        ZoteroBridge.locateItem(task.zoteroItemKey);
      }
      return;
    }

    // Card click (not on action buttons)
    Modal.openEdit(taskId);
  },

  // Handle timer toggle
  async handleTimerToggle(taskId) {
    if (TimeTracking.isTimerRunning(taskId)) {
      const elapsed = await TimeTracking.stopTimer(taskId);
      this.showToast(`计时停止: ${TimeTracking.formatDuration(elapsed)}`);
    } else {
      await TimeTracking.startTimer(taskId);
      this.showToast('计时开始');
    }
    this.render();
  },

  // Handle kanban clicks
  async handleKanbanClick(e) {
    const kanbanTask = e.target.closest('.kanban-task');
    if (kanbanTask) {
      const taskId = kanbanTask.dataset.taskId;
      Modal.openEdit(taskId);
    }
  },

  // Trigger task completion sparkle particles
  triggerSparkles(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const count = 8;
    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'sparkle-particle';
      const angle = (i / count) * 360;
      const distance = 18 + Math.random() * 14;
      const tx = Math.cos(angle * Math.PI / 180) * distance;
      const ty = Math.sin(angle * Math.PI / 180) * distance;

      particle.style.setProperty('--tx', `${tx}px`);
      particle.style.setProperty('--ty', `${ty}px`);
      particle.style.left = `${rect.left + rect.width / 2}px`;
      particle.style.top = `${rect.top + rect.height / 2}px`;

      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), 600);
    }
  },

  // Handle toggle complete
  async handleToggleComplete(taskId, taskCard) {
    const checkbox = taskCard.querySelector('.task-checkbox');

    // Add animation
    checkbox.classList.add('just-checked');
    setTimeout(() => checkbox.classList.remove('just-checked'), 200);

    const task = await TaskManager.toggleComplete(taskId);

    if (task && task.completed) {
      this.triggerSparkles(checkbox);
      if (task.repeat) {
        const newTask = await Recurring.createNextTask(task);
        if (newTask) {
          this.showToast(`已创建下一个重复任务`);
        }
      }
    }

    this.render();

    // Update badge
    this.notifyServiceWorker();
  },

  // Handle delete task
  async handleDeleteTask(taskId, taskCard) {
    // Add exit animation
    taskCard.classList.add('removing');

    // Wait for animation
    await new Promise(resolve => setTimeout(resolve, 150));

    const deletedTask = await TaskManager.deleteTask(taskId);
    this.render();

    // Show undo toast
    this.showToast('任务已删除', true);

    // Update badge
    this.notifyServiceWorker();
  },

  // Handle duplicate task
  async handleDuplicateTask(taskId) {
    const newTask = await TaskManager.duplicateTask(taskId);
    if (newTask) {
      this.showToast('任务已复制');
      this.render();
    }
  },

  // Update search suggestions
  updateSearchSuggestions(query) {
    const suggestions = Advanced.getSearchSuggestions(query);
    const datalist = document.getElementById('search-suggestions');
    if (datalist) {
      datalist.innerHTML = suggestions.map(s => `<option value="${s}">`).join('');
    }
  },

  // Update batch operation bar
  updateBatchBar() {
    const batchBar = document.getElementById('batch-bar');
    if (!batchBar) return;

    const count = TaskManager.getSelectedCount();
    if (count > 0) {
      batchBar.classList.add('show');
      const info = batchBar.querySelector('.batch-info');
      if (info) {
        info.innerHTML = `已选择 <strong>${count}</strong> 个任务`;
      }
    } else {
      batchBar.classList.remove('show');
    }
  },

  // Notify service worker with error handling
  notifyServiceWorker() {
    try {
      chrome.runtime.sendMessage({ type: 'TASKS_UPDATED' }).catch(() => {});
    } catch (e) {
      // Service worker may be inactive
    }
  },

  // Cycle through views: list -> calendar -> kanban -> list
  cycleView() {
    const views = ['list', 'calendar', 'kanban'];
    const currentIndex = views.indexOf(this.currentView);
    const nextIndex = (currentIndex + 1) % views.length;
    this.switchView(views[nextIndex]);
  },

  // Switch to specific view
  async switchView(view) {
    this.currentView = view;

    // Update view visibility
    const viewIds = ['list-view', 'calendar-view', 'kanban-view', 'stats-view'];
    viewIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('active', id === view + '-view');
        el.classList.toggle('hidden', id !== view + '-view');
      }
    });

    // Update button icon
    const btn = document.getElementById('btn-toggle-view');
    const icons = {
      list: `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/></svg>`,
      calendar: `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>`,
      kanban: `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7 19H5v-6h2v6zm0-8H5V5h2v6zm6 8h-2v-4h2v4zm0-6h-2V5h2v6zm6 6h-2v-8h2v8z"/></svg>`
    };

    const titles = { list: '日历视图', calendar: '看板视图', kanban: '列表视图' };

    if (btn) {
      btn.innerHTML = icons[view] || icons.list;
      btn.title = titles[view] || '切换视图';
    }

    // Render the view
    if (view === 'calendar') {
      await Calendar.render();
    } else if (view === 'kanban') {
      this.renderKanban();
    } else if (view === 'stats') {
      this.showStats();
    } else {
      this.render();
    }
  },

  // Toggle theme
  async toggleTheme() {
    const themes = ['light', 'dark', 'auto'];
    const currentIndex = themes.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    this.currentTheme = themes[nextIndex];

    this.applyTheme(this.currentTheme);

    // Save preference
    const settings = await Storage.getSettings();
    settings.theme = this.currentTheme;
    await Storage.saveSettings(settings);

    this.showToast(`主题已切换：${this.currentTheme === 'light' ? '浅色' : this.currentTheme === 'dark' ? '深色' : '跟随系统'}`);
  },

  // Apply theme
  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    // Update theme button icon
    const btn = document.getElementById('btn-theme');
    if (btn) {
      const icons = {
        light: '☀️',
        dark: '🌙',
        auto: '🔄'
      };
      btn.textContent = icons[theme] || '☀️';
      btn.title = `当前主题：${theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统'}`;
    }
  },

  // Update header progress widget
  updateHeaderProgress() {
    const el = document.getElementById('header-progress-widget');
    if (!el) return;

    const todayTasks = TaskManager.getFilteredTasks({ status: 'today' });
    const todayTotal = todayTasks.length;
    const todayCompleted = todayTasks.filter(t => t.completed).length;
    const percentage = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

    el.innerHTML = `
      <div class="header-progress-text">今日 ${todayCompleted}/${todayTotal} (${percentage}%)</div>
      <div class="header-progress-bar">
        <div class="header-progress-fill" style="width: ${percentage}%"></div>
      </div>
    `;
    el.title = `今日任务完成率: ${percentage}%`;
  },

  // Update dynamic category filter select options
  updateCategorySelect() {
    const select = document.getElementById('category-select');
    if (!select) return;

    const defaultCategories = ['工作', '个人', '学习', '生活', '健康'];
    const taskCategories = TaskManager.getTasks()
      .map(t => t.category)
      .filter(Boolean)
      .map(c => c.trim());

    const allCategories = Array.from(new Set([...defaultCategories, ...taskCategories]));
    const currentValue = this.currentCategoryFilter || 'all';

    const icons = {
      '工作': '💼',
      '个人': '👤',
      '学习': '📚',
      '生活': '🏠',
      '健康': '💪'
    };

    select.innerHTML = `
      <option value="all" ${currentValue === 'all' ? 'selected' : ''}>全部分类</option>
      ${allCategories.map(cat => `
        <option value="${Utils.escapeHtml(cat)}" ${currentValue === cat ? 'selected' : ''}>
          ${icons[cat] || '🏷️'} ${Utils.escapeHtml(cat)}
        </option>
      `).join('')}
    `;
  },

  // Render the task list
  render() {
    this.updateHeaderProgress();
    this.updateCategorySelect();

    if (this.currentView === 'kanban') {
      this.renderKanban();
      return;
    }

    if (this.currentView === 'calendar') {
      Calendar.render();
      return;
    }

    const filters = {
      search: this.currentSearch,
      priority: this.currentPriorityFilter,
      category: this.currentCategoryFilter && this.currentCategoryFilter !== 'all' ? this.currentCategoryFilter : null,
      sortOrder: this.currentSortOrder || 'dueDate'
    };

    // Handle date filter separately - don't pass to getGroupedTasks
    if (this.currentFilter === 'date') {
      const selectedDate = Calendar.getSelectedDate();
      if (selectedDate) {
        const dateTasks = TaskManager.getFilteredTasks({ ...filters, date: selectedDate });
        const sorted = TaskManager.getSortedTasks(dateTasks, 'dueDate');
        this.renderDateFilterResults(sorted, selectedDate);
        return;
      }
    }

    filters.status = this.currentFilter;
    const groups = TaskManager.getGroupedTasks(filters);
    const container = document.getElementById('task-list');
    const emptyState = document.getElementById('empty-state');

    // Check if we have any tasks
    const totalTasks = Object.values(groups).reduce((sum, group) => sum + group.length, 0);

    if (totalTasks === 0) {
      container.innerHTML = '';
      emptyState.classList.remove('hidden');
      // Update empty state message based on filter
      const emptyMsg = emptyState.querySelector('p');
      if (emptyMsg) {
        if (this.currentSearch) {
          emptyMsg.textContent = '未找到匹配的任务';
        } else if (this.currentFilter === 'today') {
          emptyMsg.textContent = '今天没有待办任务';
        } else if (this.currentFilter === 'overdue') {
          emptyMsg.textContent = '太棒了！没有逾期任务';
        } else if (this.currentFilter === 'completed') {
          emptyMsg.textContent = '还没有已完成的任务';
        } else if (this.currentPriorityFilter !== 'all') {
          emptyMsg.textContent = '没有该优先级的任务';
        } else {
          emptyMsg.textContent = '还没有任务';
        }
      }
      return;
    }

    emptyState.classList.add('hidden');
    container.innerHTML = '';

    // Add quick add input
    const quickAdd = document.createElement('div');
    quickAdd.className = 'quick-add';
    quickAdd.innerHTML = `
      <input type="text" id="quick-add-input" placeholder="快速添加任务，按 Enter 确认..." autocomplete="off">
    `;
    container.appendChild(quickAdd);

    // Wire up quick add
    const quickAddInput = document.getElementById('quick-add-input');
    if (quickAddInput) {
      quickAddInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' && quickAddInput.value.trim()) {
          await TaskManager.addTask({ title: quickAddInput.value.trim() });
          quickAddInput.value = '';
          this.render();
          this.notifyServiceWorker();
          this.showToast('任务已添加');
        }
      });
    }

    // Render each section
    const sections = [
      { key: 'overdue', title: '已逾期', icon: '⚠️', className: 'section-overdue' },
      { key: 'today', title: '今天', icon: '📅', className: 'section-today' },
      { key: 'upcoming', title: '即将到来', icon: '📋', className: 'section-upcoming' },
      { key: 'completed', title: '已完成', icon: '✅', className: 'section-completed' }
    ];

    sections.forEach(section => {
      const tasks = groups[section.key];
      if (tasks.length === 0) return;

      const sectionElement = this.createSectionElement(section, tasks);
      container.appendChild(sectionElement);
    });

    // Make task cards draggable
    container.querySelectorAll('.task-card').forEach(card => {
      DragDrop.makeDraggable(card);
    });
  },

  // Render kanban view
  renderKanban() {
    const kanbanData = TaskManager.getKanbanTasks();
    const container = document.getElementById('kanban-view');
    if (!container) return;

    const columns = [
      { key: 'overdue', title: '已逾期', icon: '⚠️' },
      { key: 'todo', title: '待办', icon: '📋' },
      { key: 'in-progress', title: '进行中', icon: '🔄' },
      { key: 'done', title: '已完成', icon: '✅' }
    ];

    const totalCount = Object.values(kanbanData).reduce((sum, list) => sum + (list || []).length, 0);

    container.innerHTML = columns.map(col => {
      const colTasks = kanbanData[col.key] || [];
      const pct = totalCount > 0 ? Math.round((colTasks.length / totalCount) * 100) : 0;
      return `
        <div class="kanban-column ${col.key}" data-column="${col.key}">
          <div class="kanban-column-header">
            <div class="kanban-column-title">
              <span>${col.icon}</span>
              <span>${col.title}</span>
            </div>
            <span class="kanban-column-count" title="${pct}% 的任务">${colTasks.length}${totalCount > 0 ? ` · ${pct}%` : ''}</span>
          </div>
          <div class="kanban-column-content" data-column="${col.key}">
            ${colTasks.map(task => this.createKanbanTask(task)).join('')}
            ${colTasks.length === 0 ? '<div class="kanban-empty">暂无任务</div>' : ''}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.kanban-task').forEach(card => {
      DragDrop.makeKanbanDraggable(card);
    });
  },

  // Create kanban task HTML
  createKanbanTask(task) {
    const progress = TaskManager.getSubtaskProgress(task);
    const progressHtml = progress ? `
      <div class="kanban-task-progress">
        <div class="progress-bar" style="height: 4px; margin-top: 8px;">
          <div class="progress-fill" style="width: ${progress.percentage}%"></div>
        </div>
        <span style="font-size: 11px; color: var(--text-muted);">${progress.completed}/${progress.total}</span>
      </div>
    ` : '';

    let academicBadge = '';
    const typeIcons = {
      literature_reading: '📖',
      writing: '✍️',
      experiment: '🔬',
      submission: '⏰',
      peer_review: '📑'
    };
    if (task.academicType && task.academicType !== 'general') {
      academicBadge = `<span class="kanban-academic-badge" title="${task.academicType}">${typeIcons[task.academicType] || '🎓'}</span> `;
    } else if (task.zoteroItemKey) {
      academicBadge = '<span class="kanban-academic-badge" title="关联文献">📖</span> ';
    }

    const isAcademic = !!(task.zoteroItemKey || (task.academicType && task.academicType !== 'general'));

    return `
      <div class="kanban-task ${isAcademic ? 'task-academic-kanban' : ''}" data-task-id="${task.id}">
        <div class="kanban-task-title">${academicBadge}${Utils.escapeHtml(task.title)}</div>
        <div class="kanban-task-meta">
          <span class="kanban-task-priority ${task.priority}"></span>
          ${task.dueDate ? `<span class="kanban-task-date ${Utils.isOverdue(task.dueDate) ? 'overdue' : ''}">${Utils.formatRelativeDate(task.dueDate)}</span>` : ''}
          ${task.zoteroPage ? `<span class="kanban-task-page" title="PDF 页码">P.${task.zoteroPage}</span>` : ''}
        </div>
        ${progressHtml}
      </div>
    `;
  },

  // Open settings (delegates directly to Zotero native preferences)
  openSettings() {
    if (typeof ZoteroBridge !== 'undefined' && ZoteroBridge.openPreferences) {
      ZoteroBridge.openPreferences();
      this.showToast('已唤起 Zotero 偏好设置面板');
    }
  },

  // Open templates panel
  openTemplates() {
    const dialog = document.getElementById('templates-modal');
    if (dialog) {
      // Update templates
      const content = dialog.querySelector('.templates-grid');
      if (content) {
        content.innerHTML = Templates.getAllTemplates().map(t => `
          <div class="template-card" data-template-id="${t.id}">
            <div class="template-icon">${t.icon}</div>
            <div class="template-name">${t.name}</div>
            <div class="template-desc">${t.task.subtasks.length} 个子任务</div>
          </div>
        `).join('');
      }
      dialog.showModal();
      return;
    }

    // Create modal
    const modal = document.createElement('dialog');
    modal.id = 'templates-modal';
    modal.className = 'modal';
    modal.innerHTML = Templates.renderTemplatesPanel();

    document.body.appendChild(modal);

    // Wire up events
    modal.querySelector('.templates-grid')?.addEventListener('click', (e) => {
      const card = e.target.closest('.template-card');
      if (card) {
        const templateId = card.dataset.templateId;
        Templates.applyTemplate(templateId);
        modal.close();
      }
    });

    modal.querySelector('#btn-close-templates')?.addEventListener('click', () => {
      modal.close();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.close();
      }
    });

    modal.showModal();
  },

  // Show statistics
  async showStats() {
    this.currentView = 'stats';
    const container = document.getElementById('stats-view');
    if (!container) return;

    // Hide other views
    ['list-view', 'calendar-view', 'kanban-view'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('active');
        el.classList.add('hidden');
      }
    });

    container.classList.add('active');
    container.classList.remove('hidden');

    // Render stats
    container.innerHTML = await DataManager.renderStats();

    // Add close button handler
    document.getElementById('btn-close-stats')?.addEventListener('click', () => {
      this.switchView('list');
    });
  },

  // Render date filter results (flat list, not grouped)
  renderDateFilterResults(tasks, dateStr) {
    const container = document.getElementById('task-list');
    const emptyState = document.getElementById('empty-state');

    if (tasks.length === 0) {
      container.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    container.innerHTML = '';

    const section = {
      key: 'date',
      title: Utils.formatRelativeDate(dateStr) || Utils.formatDate(dateStr),
      icon: '📅',
      className: 'section-today'
    };

    const sectionElement = this.createSectionElement(section, tasks);
    container.appendChild(sectionElement);
  },

  // Create section element
  createSectionElement(section, tasks) {
    const sectionEl = document.createElement('div');
    sectionEl.className = `task-section ${section.className}`;
    sectionEl.dataset.section = section.key;

    sectionEl.innerHTML = `
      <div class="task-section-header">
        <div class="task-section-title">
          <span>${section.icon}</span>
          <span>${section.title}</span>
          <span class="task-section-count">${tasks.length}</span>
        </div>
        <svg class="task-section-toggle" viewBox="0 0 24 24" width="20" height="20">
          <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
        </svg>
      </div>
      <div class="task-section-content" data-section="${section.key}"></div>
    `;

    // Toggle section collapse
    const header = sectionEl.querySelector('.task-section-header');
    header.addEventListener('click', () => {
      sectionEl.classList.toggle('collapsed');
    });

    // Render tasks
    const content = sectionEl.querySelector('.task-section-content');
    tasks.forEach(task => {
      const taskCard = this.createTaskCard(task);
      content.appendChild(taskCard);
    });

    return sectionEl;
  },

  // Highlight matching search query text
  highlightText(text) {
    if (!text) return '';
    const query = (this.currentSearch || '').trim();
    const escapedText = Utils.escapeHtml(text);
    if (!query) return escapedText;

    const escapedQuery = Utils.escapeHtml(query);
    const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
  },

  // Create task card element
  createTaskCard(task) {
    const card = document.createElement('div');
    const isAcademic = !!(task.zoteroItemKey || (task.academicType && task.academicType !== 'general'));
    card.className = `task-card ${task.completed ? 'completed' : ''} ${isAcademic ? 'task-card-academic' : ''}`;
    card.dataset.taskId = task.id;
    if (task.academicType) {
      card.dataset.academicType = task.academicType;
    } else if (task.zoteroItemKey) {
      card.dataset.academicType = 'literature_reading';
    }

    // Check if in selection mode
    if (TaskManager.isSelectionMode()) {
      card.classList.add('selectable');
      if (TaskManager.isTaskSelected(task.id)) {
        card.classList.add('selected');
      }
    }

    // Check if overdue
    if (!task.completed && Utils.isOverdue(task.dueDate)) {
      card.classList.add('overdue');
    }

    // Set priority color
    card.style.setProperty('--priority-color', Utils.getPriorityColor(task.priority));

    // Build Academic Type badge HTML
    const academicTypeConfig = {
      literature_reading: { label: '📖 论文研读', className: 'reading' },
      writing: { label: '✍️ 论文写作', className: 'writing' },
      experiment: { label: '🔬 实验复现', className: 'experiment' },
      submission: { label: '⏰ 截稿 DDL', className: 'submission' },
      peer_review: { label: '📑 同行审稿', className: 'review' },
      general: { label: '📌 学术待办', className: 'general' }
    };
    let academicTypeHtml = '';
    const activeType = task.academicType || (task.zoteroItemKey ? 'literature_reading' : null);
    if (activeType && academicTypeConfig[activeType] && activeType !== 'general') {
      const conf = academicTypeConfig[activeType];
      academicTypeHtml = `<span class="task-academic-pill ${conf.className}">${conf.label}</span>`;
    }

    // Build due date HTML
    let dueDateHtml = '';
    if (task.dueDate) {
      const relativeDate = Utils.formatRelativeDate(task.dueDate);
      let dateClass = '';
      if (Utils.isOverdue(task.dueDate) && !task.completed) dateClass = 'overdue';
      if (Utils.isToday(task.dueDate)) dateClass = 'today';

      dueDateHtml = `
        <span class="task-due-date ${dateClass}">
          <svg viewBox="0 0 24 24" width="12" height="12">
            <path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
          </svg>
          ${relativeDate}
        </span>
      `;
    }

    // Build priority HTML
    const priorityHtml = `
      <span class="task-priority ${task.priority}">
        ${Utils.getPriorityLabel(task.priority)}
      </span>
    `;

    // Build category HTML
    let categoryHtml = '';
    if (task.category) {
      categoryHtml = `<span class="task-category">${this.highlightText(task.category)}</span>`;
    }

    // Build subtask progress and inline items HTML
    let subtaskHtml = '';
    const progress = TaskManager.getSubtaskProgress(task);
    const hasSubtasks = task.subtasks && task.subtasks.length > 0;

    const subtaskItems = hasSubtasks ? task.subtasks.map(st => `
      <div class="card-subtask-item ${st.completed ? 'completed' : ''}">
        <div class="card-subtask-checkbox ${st.completed ? 'checked' : ''}" data-subtask-id="${st.id}"></div>
        <span class="card-subtask-text">${this.highlightText(st.title)}</span>
        <button type="button" class="btn-card-delete-subtask" data-subtask-id="${st.id}" title="删除子任务">×</button>
      </div>
    `).join('') : '';

    const progressHeader = progress ? `
      <div class="subtask-progress">
        <span class="subtask-progress-text">子任务 ${progress.completed}/${progress.total}</span>
        <div class="subtask-progress-bar">
          <div class="subtask-progress-fill" style="width: ${progress.percentage}%"></div>
        </div>
      </div>
    ` : '';

    if (hasSubtasks || !task.completed) {
      subtaskHtml = `
        ${progressHeader}
        <div class="card-subtasks-container">
          ${subtaskItems}
          <div class="card-add-subtask-row">
            <input type="text" class="card-add-subtask-input" placeholder="+ 添加子任务 (按 Enter 确认)" data-task-id="${task.id}" autocomplete="off" />
          </div>
        </div>
      `;
    }

    // Build reminder indicator
    let reminderHtml = '';
    if (task.reminder?.enabled) {
      reminderHtml = '<span class="task-reminder-indicator" title="已设置提醒">🔔</span>';
    }

    // Build tags HTML
    const tagsHtml = Tags.renderTagBadges(task.tags);

    // Build repeat badge HTML
    const repeatHtml = Recurring.renderRepeatBadge(task.repeat);

    // Build time tracking HTML
    const timeHtml = TimeTracking.renderTimeStats(task);
    const timerBtn = TimeTracking.renderTimerButton(task.id);

    // Build Zotero literature badge HTML
    let zoteroBadgeHtml = '';
    if (task.zoteroItemKey || task.zoteroItemTitle) {
      const pageChip = task.zoteroPage ? `<span class="zotero-badge-page" title="关联文献 PDF 锚点页码">P.${task.zoteroPage}</span>` : '';
      const authorYear = [task.zoteroAuthor, task.zoteroYear].filter(Boolean).join(' · ');
      const authorChip = authorYear ? `<span class="zotero-badge-author-year" title="作者/年份">${this.highlightText(authorYear)}</span>` : '';
      const pubChip = task.zoteroPublication ? `<span class="zotero-badge-pub" title="发表期刊/会议">${this.highlightText(task.zoteroPublication)}</span>` : '';
      const openPdfBtn = (task.zoteroPdfUri || task.zoteroItemKey) ? 
        `<button type="button" class="btn-card-open-pdf" data-item-key="${task.zoteroItemKey || ''}" data-page="${task.zoteroPage || ''}" title="在 Zotero 阅读器中打开 PDF 并跳转至对应页面">📖 伴读</button>` : '';

      const quoteHtml = task.zoteroQuote ? `
        <blockquote class="task-lit-quote" title="论文关键摘录/观点">
          <span class="quote-mark">“</span>${this.highlightText(task.zoteroQuote)}<span class="quote-mark">”</span>
        </blockquote>
      ` : '';

      zoteroBadgeHtml = `
        <div class="task-zotero-badge-card" data-item-key="${task.zoteroItemKey || ''}">
          <div class="task-zotero-badge-main" title="点击在 Zotero 文献库中高亮定位：${task.zoteroItemTitle || ''}">
            <span class="zotero-badge-icon">📄</span>
            <span class="zotero-badge-title">${this.highlightText(task.zoteroItemTitle || '关联文献')}</span>
            ${pageChip}
            ${authorChip}
            ${pubChip}
            ${openPdfBtn}
          </div>
          ${quoteHtml}
        </div>
      `;
    }

    card.innerHTML = `
      <div class="task-checkbox ${task.completed ? 'checked' : ''}"></div>
      <div class="task-content">
        <div class="task-title">
          ${academicTypeHtml}
          ${this.highlightText(task.title)}
          ${reminderHtml}
          ${repeatHtml}
        </div>
        ${task.description ? `<div class="task-description">${this.highlightText(task.description)}</div>` : ''}
        ${zoteroBadgeHtml}
        ${subtaskHtml}
        ${tagsHtml ? `<div class="task-tags">${tagsHtml}</div>` : ''}
        <div class="task-meta">
          ${dueDateHtml}
          ${priorityHtml}
          ${categoryHtml}
          ${timeHtml}
        </div>
      </div>
      <div class="task-actions">
        ${task.zoteroItemKey ? `
          <button class="task-action zotero-copy-citation" title="复制文献学术引用" data-item-key="${task.zoteroItemKey}">
            📋
          </button>
          <button class="task-action zotero-sync-note" title="同步待办至 Zotero 文献笔记 (支持云同步)" data-item-key="${task.zoteroItemKey}">
            📝
          </button>
          <button class="task-action zotero-locate" title="在 Zotero 中定位该文献" data-item-key="${task.zoteroItemKey}">
            📄
          </button>
        ` : ''}
        <button class="task-action timer" title="${TimeTracking.isTimerRunning(task.id) ? '停止计时' : '开始计时'}" data-task-id="${task.id}">
          ${TimeTracking.isTimerRunning(task.id) ? '⏸️' : '⏱️'}
        </button>
        <button class="task-action duplicate" title="复制">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
          </svg>
        </button>
        <button class="task-action edit" title="编辑">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
          </svg>
        </button>
        <button class="task-action delete" title="删除">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
      </div>
    `;

    return card;
  },

  // Update active tab
  updateActiveTab() {
    document.querySelectorAll('.filter-tabs .tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.filter === this.currentFilter);
    });
  },

  // Show toast notification
  showToast(message, showUndo = false) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const toastAction = document.getElementById('toast-action');

    if (!toast || !toastMessage) return;

    if (this._toastTimer) clearTimeout(this._toastTimer);
    if (this._toastHideTimer) clearTimeout(this._toastHideTimer);

    toastMessage.textContent = message;

    if (showUndo) {
      toastAction.classList.remove('hidden');
      toastAction.onclick = async () => {
        const restored = await TaskManager.undoDelete();
        if (restored) {
          this.showToast('任务已恢复');
          this.render();
        }
      };
    } else {
      toastAction.classList.add('hidden');
    }

    toast.classList.remove('hidden');
    toast.classList.add('show');

    // Auto hide after 3 seconds (matches undo timeout)
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      this._toastHideTimer = setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3000);
  },

  // Get current view
  getCurrentView() {
    return this.currentView;
  }
};
