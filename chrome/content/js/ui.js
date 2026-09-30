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
    this._storageReady = true;
    Storage.subscribe(data => {
      if (!this._storageReady || TaskManager._mutating) return;
      TaskManager._tasks = Storage.clone(data.tasks || []);
      TaskManager._baseline = Storage.clone(TaskManager._tasks);
      const ids = new Set(TaskManager._tasks.map(t => t.id));
      TaskManager._selectedTasks = new Set([...TaskManager._selectedTasks].filter(id => ids.has(id)));
      if (typeof TimeTracking !== 'undefined') TimeTracking.activeTimers = data.activeTimers || {};
      if (typeof Tags !== 'undefined' && data.customTags) Tags.customTags = data.customTags;
      this.render();
      this.updateBatchBar();
    });
    chrome.storage.onChanged?.addListener(async (changes, area) => {
      if (area === 'local' && changes.tasks && !TaskManager._mutating) Storage.acceptData(await Storage.getAll());
    });
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
    const modeSvgs = {
      tab: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h10v4h8v10z"/></svg>`,
      subwindow: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.89-2-2-2zm0 14H5V8h14v10z"/></svg>`,
      window: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>`
    };
    const getActiveWinMode = () => {
      const p = new URLSearchParams(window.location.search || '');
      return p.get('mode') || window.arguments?.[0]?.options?.currentWindowType || 'tab';
    };
    if (btnWinMode) {
      btnWinMode.innerHTML = modeSvgs[getActiveWinMode()] || modeSvgs.subwindow;
    }

    btnWinMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      const existingMenu = document.querySelector('.zotero-mode-dropdown');
      if (existingMenu) {
        existingMenu.remove();
        return;
      }

      const curMode = getActiveWinMode();

      const menu = document.createElement('div');
      menu.className = 'zotero-mode-dropdown';
      menu.innerHTML = `
        <button class="zotero-mode-item ${curMode === 'tab' ? 'active' : ''}" data-mode="tab">
          <span class="zotero-mode-icon">${modeSvgs.tab}</span>
          <span>标签页模式 (Tab)</span>
        </button>
        <button class="zotero-mode-item ${curMode === 'subwindow' ? 'active' : ''}" data-mode="subwindow">
          <span class="zotero-mode-icon">${modeSvgs.subwindow}</span>
          <span>伴读子窗口 (460×760)</span>
        </button>
        <button class="zotero-mode-item ${curMode === 'window' ? 'active' : ''}" data-mode="window">
          <span class="zotero-mode-icon">${modeSvgs.window}</span>
          <span>独立桌面大窗口 (1120×760)</span>
        </button>
      `;

      btnWinMode.parentElement.style.position = 'relative';
      btnWinMode.parentElement.appendChild(menu);

      menu.querySelectorAll('.zotero-mode-item').forEach((item) => {
        item.addEventListener('click', (evt) => {
          evt.stopPropagation();
          const targetMode = item.dataset.mode;
          menu.remove();
          if (btnWinMode) btnWinMode.innerHTML = modeSvgs[targetMode] || modeSvgs.subwindow;
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

    // Drag & drop literature from Zotero library pane (with internal drag protection & clean cleanup)
    const viewsContainer = document.querySelector('.views-container');
    if (viewsContainer) {
      let dragCounter = 0;
      let dropCueEl = null;

      const showDropCue = () => {
        if (!dropCueEl) {
          dropCueEl = document.createElement('div');
          dropCueEl.className = 'zotero-drag-overlay-cue';
          dropCueEl.innerHTML = '<span>📥 释放以关联文献并创建研读待办</span>';
          document.body.appendChild(dropCueEl);
        }
      };

      const removeDropCue = () => {
        if (dropCueEl && dropCueEl.parentNode) {
          dropCueEl.parentNode.removeChild(dropCueEl);
        }
        dropCueEl = null;
      };

      const clearDragHighlight = () => {
        dragCounter = 0;
        viewsContainer.classList.remove('drag-over-zotero');
        removeDropCue();
      };

      viewsContainer.addEventListener('dragenter', (e) => {
        if (typeof DragDrop !== 'undefined' && (DragDrop.draggedTaskId || DragDrop.draggedElement)) {
          return;
        }
        if (typeof ZoteroBridge !== 'undefined' && ZoteroBridge.isZotero) {
          dragCounter++;
          if (dragCounter === 1) {
            viewsContainer.classList.add('drag-over-zotero');
            showDropCue();
          }
        }
      });

      viewsContainer.addEventListener('dragover', (e) => {
        if (typeof DragDrop !== 'undefined' && (DragDrop.draggedTaskId || DragDrop.draggedElement)) {
          return;
        }
        if (typeof ZoteroBridge !== 'undefined' && ZoteroBridge.isZotero) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!viewsContainer.classList.contains('drag-over-zotero')) {
            viewsContainer.classList.add('drag-over-zotero');
            showDropCue();
          }
        }
      });

      viewsContainer.addEventListener('dragleave', (e) => {
        if (typeof DragDrop !== 'undefined' && (DragDrop.draggedTaskId || DragDrop.draggedElement)) {
          return;
        }
        dragCounter--;
        if (dragCounter <= 0) {
          clearDragHighlight();
        }
      });

      viewsContainer.addEventListener('drop', async (e) => {
        clearDragHighlight();
        if (typeof DragDrop !== 'undefined' && (DragDrop.draggedTaskId || DragDrop.draggedElement)) {
          return;
        }
        if (typeof ZoteroBridge !== 'undefined' && ZoteroBridge.isZotero) {
          e.preventDefault();
          const activeItem = await ZoteroBridge.getActiveItem();
          if (activeItem) {
            await TaskManager.createTask({
              title: `📖 研读：${activeItem.title}`,
              category: '论文研读',
              priority: 'medium',
              academicType: 'literature_reading',
              zoteroItemKey: activeItem.key,
              zoteroItemTitle: activeItem.title,
              zoteroAuthors: activeItem.authors || '',
              zoteroLibraryID: activeItem.libraryID,
              zoteroYear: activeItem.year || null,
              zoteroPublication: activeItem.publication || '',
              zoteroPdfUri: activeItem.pdfUri || ''
            });
            this.render();
            this.showToast(`已为《${activeItem.title.slice(0, 20)}...》创建研读待办`);
          }
        }
      });

      window.addEventListener('dragend', clearDragHighlight);
      window.addEventListener('drop', clearDragHighlight);
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
      this.showToast(`已删除 ${count} 个任务`, count > 0);
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
      if (e.target.closest('button, input, textarea, .task-checkbox, .card-subtask-checkbox')) return;

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
        ZoteroBridge.openPdf(task.zoteroUri || task.zoteroItemKey, task.zoteroLibraryID, page);
      }
      return;
    }

    // Zotero copy citation button click
    if (e.target.closest('.task-action.zotero-copy-citation')) {
      e.stopPropagation();
      const task = TaskManager.getTaskById(taskId);
      if (task) {
        let citation = '';
        if (task.zoteroAuthors && task.zoteroYear) {
          citation = `${task.zoteroAuthors} (${task.zoteroYear}). ${task.zoteroItemTitle || task.title}`;
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
        ZoteroBridge.syncChildNote(task.zoteroUri || task.zoteroItemKey, task.zoteroLibraryID).then((res) => {
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
        ZoteroBridge.locateItem(task.zoteroUri || task.zoteroItemKey, task.zoteroLibraryID);
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

  // Handle kanban clicks with quick-actions, PDF direct jump, and modal editing
  async handleKanbanClick(e) {
    const deleteButton = e.target.closest('.kanban-delete');
    if (deleteButton) {
      e.stopPropagation();
      const card = deleteButton.closest('.kanban-task');
      await this.handleDeleteTask(card.dataset.taskId, card);
      return;
    }
    const editButton = e.target.closest('.kanban-edit');
    if (editButton) {
      e.stopPropagation();
      await Modal.openEdit(editButton.closest('.kanban-task').dataset.taskId);
      return;
    }
    // 1. Column footer quick add button
    const quickAddBtn = e.target.closest('.kanban-quick-add-btn');
    if (quickAddBtn) {
      e.stopPropagation();
      const colKey = quickAddBtn.dataset.column;
      const prefill = {};
      prefill.status = colKey === 'in-progress' ? 'in-progress' : 'todo';
      if (colKey === 'done') {
        prefill.completed = true;
      } else if (colKey === 'overdue') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        prefill.dueDate = Utils.toDateISO(yesterday);
      } else if (colKey === 'todo' || colKey === 'in-progress') {
        prefill.dueDate = Utils.toDateISO(new Date());
      }
      Modal.openAdd(prefill);
      return;
    }

    // 2. Quick toggle complete checkbox
    const checkbox = e.target.closest('.kanban-task-checkbox');
    if (checkbox) {
      e.stopPropagation();
      const taskId = checkbox.dataset.taskId;
      const card = checkbox.closest('.kanban-task');
      await this.handleToggleComplete(taskId, card);
      return;
    }

    // 3. Quick PDF jump
    const pageChip = e.target.closest('.kanban-task-page');
    if (pageChip) {
      e.stopPropagation();
      const taskId = pageChip.dataset.taskId;
      const task = TaskManager.getTaskById(taskId);
      if (typeof ZoteroBridge !== 'undefined' && task?.zoteroItemKey) {
        let page = null;
        if (task.zoteroPage) page = Number(task.zoteroPage);
        ZoteroBridge.openPdf(task.zoteroUri || task.zoteroItemKey, task.zoteroLibraryID, page);
      }
      return;
    }

    // 4. Quick locate item from academic badge
    const badge = e.target.closest('.kanban-academic-badge');
    if (badge) {
      e.stopPropagation();
      const taskCard = badge.closest('.kanban-task');
      const taskId = taskCard?.dataset.taskId;
      const task = TaskManager.getTaskById(taskId);
      if (typeof ZoteroBridge !== 'undefined' && task?.zoteroItemKey) {
        ZoteroBridge.locateItem(task.zoteroUri || task.zoteroItemKey, task.zoteroLibraryID);
      }
      return;
    }

    // 5. Open Edit Modal on card click
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
    const checkbox = taskCard.querySelector('.task-checkbox, .kanban-task-checkbox');

    // Add animation
    checkbox?.classList.add('just-checked');
    setTimeout(() => checkbox?.classList.remove('just-checked'), 200);

    const task = await TaskManager.toggleComplete(taskId);

    if (task && task.completed) {
      this.triggerSparkles(checkbox);
    }

    this.render();

    // Update badge
    this.notifyServiceWorker();
  },

  // Handle delete task
  async handleDeleteTask(taskId, taskCard) {
    this._deleting ||= new Set();
    if (this._deleting.has(taskId)) return false;
    this._deleting.add(taskId);
    try {
    // Add exit animation
    taskCard?.classList.add('removing');

    // Wait for animation
    await new Promise(resolve => setTimeout(resolve, 150));

    const deletedTask = await TaskManager.deleteTask(taskId);
    if (!deletedTask) return false;
    this.render();

    // Show undo toast
    this.showToast('任务已删除', true);

    // Update badge
    this.notifyServiceWorker();
    this.updateBatchBar();
    return true;
    } catch (error) {
      taskCard?.classList.remove('removing');
      this.showToast('删除失败，请重试');
      return false;
    } finally { this._deleting.delete(taskId); }
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
      datalist.innerHTML = suggestions.map(s => `<option value="${Utils.escapeHtml(s)}">`).join('');
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
    const btns = document.querySelectorAll('#btn-theme');
    const svgIcons = {
      light: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 000 1.41l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>`,
      dark: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12.3 2a10 10 0 00-1.9 19.8 9.9 9.9 0 007.8-2.6c.4-.4.1-1.1-.4-1.1a8.1 8.1 0 01-6.4-6.4c-.1-.5-.7-.8-1.1-.4A10 10 0 0012.3 2z"/></svg>`,
      auto: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>`
    };
    btns.forEach(btn => {
      btn.innerHTML = svgIcons[theme] || svgIcons.light;
      btn.title = `当前主题：${theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统'}`;
    });
  },

  // Update header progress widget
  updateHeaderProgress() {
    const el = document.getElementById('header-progress-widget');
    if (!el) return;

    const todayTasks = TaskManager.getTasks().filter(task => Utils.isToday(task.dueDate));
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
    this.updateSidebarFilterCounts();
    this.updateCategorySelect();

    if (this.currentView === 'kanban') {
      this.renderKanban();
      return;
    }

    if (this.currentView === 'calendar') {
      Calendar.render();
      return;
    }
    if (this.currentView === 'stats') { this.showStats(); return; }

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
    const kanbanData = TaskManager.getKanbanTasks({ search: this.currentSearch,
      priority: this.currentPriorityFilter, category: this.currentCategoryFilter,
      status: this.currentFilter === 'date' ? 'all' : this.currentFilter,
      sortOrder: this.currentSortOrder });
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
            ${colTasks.length === 0 ? `<div class="kanban-empty"><span class="kanban-empty-icon">${col.icon}</span><span>暂无${col.title}任务</span></div>` : ''}
          </div>
          <div class="kanban-column-footer">
            <button type="button" class="kanban-quick-add-btn" data-column="${col.key}">
              <span>＋ 添加任务</span>
            </button>
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
      academicBadge = `<span class="kanban-academic-badge" title="${Utils.escapeHtml(task.academicType)}">${typeIcons[task.academicType] || '🎓'}</span> `;
    } else if (task.zoteroItemKey) {
      academicBadge = '<span class="kanban-academic-badge" title="关联文献">📖</span> ';
    }

    const isAcademic = !!(task.zoteroItemKey || (task.academicType && task.academicType !== 'general'));

    return `
      <div class="kanban-task ${task.completed ? 'completed' : ''} ${isAcademic ? 'task-academic-kanban' : ''}" data-task-id="${Utils.escapeHtml(task.id)}">
        <div class="kanban-task-header-row">
          <div class="kanban-task-checkbox ${task.completed ? 'checked' : ''}" data-task-id="${Utils.escapeHtml(task.id)}" title="${task.completed ? '标记为未完成' : '标记为已完成'}"></div>
          <div class="kanban-task-title">${academicBadge}${Utils.escapeHtml(task.title)}</div>
        </div>
        <div class="kanban-task-meta">
          <span class="kanban-task-priority ${Utils.escapeHtml(task.priority)}" title="优先级: ${Utils.escapeHtml(task.priority)}"></span>
          ${task.dueDate ? `<span class="kanban-task-date ${Utils.isOverdue(task.dueDate) && !task.completed ? 'overdue' : ''}">${Utils.formatRelativeDate(task.dueDate)}</span>` : ''}
          ${task.zoteroPage ? `<span class="kanban-task-page" data-task-id="${Utils.escapeHtml(task.id)}" title="点击直接打开关联 PDF 并跳转至第 ${Utils.escapeHtml(task.zoteroPage)} 页">📖 P.${Utils.escapeHtml(task.zoteroPage)}</span>` : ''}
        </div>
        ${progressHtml}
        <div class="kanban-task-actions">
          <button type="button" class="kanban-edit" aria-label="编辑任务">编辑</button>
          <button type="button" class="kanban-delete" aria-label="删除任务">删除</button>
        </div>
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
      <span class="task-priority ${Utils.escapeHtml(task.priority)}">
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
        <div class="card-subtask-checkbox ${st.completed ? 'checked' : ''}" data-subtask-id="${Utils.escapeHtml(st.id)}"></div>
        <span class="card-subtask-text">${this.highlightText(st.title)}</span>
        <button type="button" class="btn-card-delete-subtask" data-subtask-id="${Utils.escapeHtml(st.id)}" title="删除子任务">×</button>
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
            <input type="text" class="card-add-subtask-input" placeholder="+ 添加子任务 (按 Enter 确认)" data-task-id="${Utils.escapeHtml(task.id)}" autocomplete="off" />
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
      const pageChip = task.zoteroPage ? `<span class="zotero-badge-page" title="关联文献 PDF 锚点页码">P.${Utils.escapeHtml(task.zoteroPage)}</span>` : '';
      const authorYear = [task.zoteroAuthors, task.zoteroYear].filter(Boolean).join(' · ');
      const authorChip = authorYear ? `<span class="zotero-badge-author-year" title="作者/年份">${this.highlightText(authorYear)}</span>` : '';
      const pubChip = task.zoteroPublication ? `<span class="zotero-badge-pub" title="发表期刊/会议">${this.highlightText(task.zoteroPublication)}</span>` : '';
      const openPdfBtn = (task.zoteroPdfUri || task.zoteroItemKey) ? 
        `<button type="button" class="btn-card-open-pdf" data-item-key="${Utils.escapeHtml(task.zoteroItemKey || '')}" data-page="${Utils.escapeHtml(task.zoteroPage || '')}" title="在 Zotero 阅读器中打开 PDF 并跳转至对应页面">📖 伴读</button>` : '';

      const quoteHtml = task.zoteroQuote ? `
        <blockquote class="task-lit-quote" title="论文关键摘录/观点">
          <span class="quote-mark">“</span>${this.highlightText(task.zoteroQuote)}<span class="quote-mark">”</span>
        </blockquote>
      ` : '';

      zoteroBadgeHtml = `
        <div class="task-zotero-badge-card" data-item-key="${Utils.escapeHtml(task.zoteroItemKey || '')}">
          <div class="task-zotero-badge-main" title="点击在 Zotero 文献库中高亮定位：${Utils.escapeHtml(task.zoteroItemTitle || '')}">
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
          <button class="task-action zotero-copy-citation" title="复制文献学术引用" data-item-key="${Utils.escapeHtml(task.zoteroItemKey)}">
            <svg viewBox="0 0 24 24" width="15" height="15">
              <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
          </button>
          <button class="task-action zotero-sync-note" title="同步待办至 Zotero 文献笔记 (支持云同步)" data-item-key="${Utils.escapeHtml(task.zoteroItemKey)}">
            <svg viewBox="0 0 24 24" width="15" height="15">
              <path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
          </button>
          <button class="task-action zotero-locate" title="在 Zotero 中定位该文献" data-item-key="${Utils.escapeHtml(task.zoteroItemKey)}">
            <svg viewBox="0 0 24 24" width="15" height="15">
              <path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </button>
        ` : ''}
        <button class="task-action timer" title="${TimeTracking.isTimerRunning(task.id) ? '停止计时' : '开始计时'}" data-task-id="${Utils.escapeHtml(task.id)}">
          ${TimeTracking.isTimerRunning(task.id) ? `
            <svg viewBox="0 0 24 24" width="15" height="15">
              <path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          ` : `
            <svg viewBox="0 0 24 24" width="15" height="15">
              <path fill="currentColor" d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
          `}
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
        <button type="button" class="task-action delete" title="删除任务" aria-label="删除任务">
          <span>删除</span>
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
      </div>
    `;

    return card;
  },

  // Update active tab and sidebar filter counts
  updateActiveTab() {
    document.querySelectorAll('.filter-tabs .tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.filter === this.currentFilter);
    });
    this.updateSidebarFilterCounts();
  },

  // Update sidebar filter item counts in real-time
  updateSidebarFilterCounts() {
    if (typeof TaskManager === 'undefined' || !TaskManager.getTasks) return;
    const tasks = TaskManager.getTasks();
    const counts = {
      all: tasks.filter(t => !t.completed).length,
      literature: tasks.filter(t => !t.completed && (t.zoteroItemKey || (t.academicType && t.academicType !== 'general'))).length,
      today: tasks.filter(t => !t.completed && Utils.isToday(t.dueDate)).length,
      upcoming: tasks.filter(t => !t.completed && t.dueDate && !Utils.isToday(t.dueDate) && !Utils.isOverdue(t.dueDate)).length,
      overdue: tasks.filter(t => !t.completed && Utils.isOverdue(t.dueDate)).length,
      completed: tasks.filter(t => t.completed).length
    };

    document.querySelectorAll('.filter-tabs .tab').forEach(tab => {
      const filter = tab.dataset.filter;
      if (filter && counts[filter] !== undefined) {
        let countEl = tab.querySelector('.sidebar-filter-count');
        if (!countEl) {
          countEl = document.createElement('span');
          countEl.className = 'sidebar-filter-count';
          tab.appendChild(countEl);
        }
        countEl.textContent = counts[filter];
        countEl.dataset.count = String(counts[filter]);
        countEl.classList.toggle('has-count', counts[filter] > 0);
        if (filter === 'overdue' && counts[filter] > 0) {
          countEl.classList.add('has-overdue');
        } else {
          countEl.classList.remove('has-overdue');
        }
      }
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

    // Undo remains visible for exactly the supported recovery window.
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      this._toastHideTimer = setTimeout(() => toast.classList.add('hidden'), 300);
    }, showUndo ? TaskManager.undoDuration : 3000);
  },

  // Get current view
  getCurrentView() {
    return this.currentView;
  }
};

for (const name of ['handleTaskListClick', 'handleKanbanClick', 'handleToggleComplete', 'handleDuplicateTask']) {
  const handler = UI[name];
  UI[name] = async function(...args) {
    try { return await handler.apply(this, args); }
    catch (error) { console.error(error); this.showToast('操作失败，请重试'); }
  };
}
