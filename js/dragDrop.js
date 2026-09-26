// Drag and Drop module for task reordering

const DragDrop = {
  draggedElement: null,
  draggedTaskId: null,
  placeholder: null,
  lastKanbanColumn: null,
  kanbanDropHandled: false,

  // Initialize drag and drop
  init() {
    const container = document.getElementById('task-list');
    if (container && !container.dataset.dragDropBound) {
      container.addEventListener('dragstart', this.handleDragStart.bind(this));
      container.addEventListener('dragend', this.handleDragEnd.bind(this));
      container.addEventListener('dragover', this.handleDragOver.bind(this));
      container.addEventListener('drop', this.handleDrop.bind(this));
      container.addEventListener('dragenter', this.handleDragEnter.bind(this));
      container.addEventListener('dragleave', this.handleDragLeave.bind(this));
      container.dataset.dragDropBound = 'true';
    }

    const kanban = document.getElementById('kanban-view');
    if (kanban && !kanban.dataset.dragDropBound) {
      kanban.addEventListener('dragstart', this.handleKanbanDragStart.bind(this));
      kanban.addEventListener('dragend', this.handleKanbanDragEnd.bind(this));
      kanban.addEventListener('dragover', this.handleKanbanDragOver.bind(this));
      kanban.addEventListener('drop', this.handleKanbanDrop.bind(this));
      kanban.addEventListener('dragenter', this.handleKanbanDragEnter.bind(this));
      kanban.addEventListener('dragleave', this.handleKanbanDragLeave.bind(this));
      kanban.dataset.dragDropBound = 'true';
    }
  },

  // Make task cards draggable
  makeDraggable(taskCard) {
    taskCard.setAttribute('draggable', 'true');
  },

  // Make kanban cards draggable
  makeKanbanDraggable(taskCard) {
    taskCard.setAttribute('draggable', 'true');
  },

  // Resolve the kanban column from any point inside a column.
  getKanbanColumnFromEvent(e) {
    const content = e.target.closest('.kanban-column-content');
    const column = e.target.closest('.kanban-column');

    return {
      content: content || column?.querySelector('.kanban-column-content') || null,
      column: content?.dataset.column || column?.dataset.column || null
    };
  },

  // Handle drag start
  handleDragStart(e) {
    const taskCard = e.target.closest('.task-card');
    if (!taskCard) return;

    this.draggedElement = taskCard;
    this.draggedTaskId = taskCard.dataset.taskId;

    // Add dragging class
    taskCard.classList.add('dragging');

    // Set drag data
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.draggedTaskId);

    // Create placeholder
    this.placeholder = document.createElement('div');
    this.placeholder.className = 'drag-placeholder';
    this.placeholder.style.height = taskCard.offsetHeight + 'px';
  },

  // Handle drag end
  handleDragEnd(e) {
    const taskCard = e.target.closest('.task-card') || this.draggedElement;
    if (taskCard) {
      taskCard.classList.remove('dragging');
    }

    // Remove placeholder
    if (this.placeholder && this.placeholder.parentNode) {
      this.placeholder.parentNode.removeChild(this.placeholder);
    }

    // Remove all drag-over classes
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });

    document.querySelector('.views-container')?.classList.remove('drag-over-zotero');

    this.draggedElement = null;
    this.draggedTaskId = null;
    this.placeholder = null;
  },

  // Handle drag over
  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const taskCard = e.target.closest('.task-card');
    if (!taskCard || taskCard === this.draggedElement) return;

    const rect = taskCard.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    // Insert placeholder before or after the target
    if (e.clientY < midY) {
      taskCard.parentNode.insertBefore(this.placeholder, taskCard);
    } else {
      taskCard.parentNode.insertBefore(this.placeholder, taskCard.nextSibling);
    }
  },

  // Handle drop
  async handleDrop(e) {
    e.preventDefault();

    const targetCard = e.target.closest('.task-card');
    const targetSection = e.target.closest('.task-section') || e.target.closest('.task-section-content');
    const taskId = this.draggedTaskId;
    if (!taskId) return;

    const tasks = TaskManager.getTasks();
    const draggedTask = tasks.find(t => t.id === taskId);
    if (!draggedTask) return;

    // Check if dragged across list view sections
    const targetSectionKey = targetSection?.dataset?.section;
    if (targetSectionKey) {
      if (targetSectionKey === 'completed') {
        draggedTask.completed = true;
        draggedTask.completedAt = new Date().toISOString();
        draggedTask.status = 'done';
      } else {
        if (draggedTask.completed) {
          draggedTask.completed = false;
          draggedTask.completedAt = null;
        }
        if (targetSectionKey === 'today') {
          draggedTask.dueDate = Utils.formatDate(new Date());
          draggedTask.status = 'todo';
        } else if (targetSectionKey === 'overdue') {
          if (!Utils.isOverdue(draggedTask.dueDate)) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            draggedTask.dueDate = Utils.formatDate(yesterday);
          }
          draggedTask.status = 'overdue';
        } else if (targetSectionKey === 'upcoming') {
          if (!draggedTask.dueDate || Utils.isToday(draggedTask.dueDate) || Utils.isOverdue(draggedTask.dueDate)) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            draggedTask.dueDate = Utils.formatDate(tomorrow);
          }
          draggedTask.status = 'todo';
        }
      }
    }

    if (targetCard && targetCard.dataset.taskId && targetCard.dataset.taskId !== taskId) {
      const targetTaskId = targetCard.dataset.taskId;
      const draggedIndex = tasks.findIndex(t => t.id === taskId);
      const targetIndex = tasks.findIndex(t => t.id === targetTaskId);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const [draggedTaskItem] = tasks.splice(draggedIndex, 1);
        const rect = targetCard.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertIndex = e.clientY < midY ? targetIndex : targetIndex + 1;
        tasks.splice(insertIndex, 0, draggedTaskItem);
      }
    }

    // Update order property
    tasks.forEach((task, index) => {
      task.order = index;
    });

    // Save and re-render
    await Storage.saveTasks(tasks);
    await TaskManager.loadTasks();
    UI.render();
  },

  // Handle drag enter
  handleDragEnter(e) {
    const taskCard = e.target.closest('.task-card');
    if (taskCard && taskCard !== this.draggedElement) {
      taskCard.classList.add('drag-over');
    }
  },

  // Handle drag leave
  handleDragLeave(e) {
    const taskCard = e.target.closest('.task-card');
    if (taskCard) {
      taskCard.classList.remove('drag-over');
    }
  },

  // Handle kanban drag start
  handleKanbanDragStart(e) {
    const taskCard = e.target.closest('.kanban-task');
    if (!taskCard) return;

    this.draggedElement = taskCard;
    this.draggedTaskId = taskCard.dataset.taskId;
    this.sourceKanbanColumn = taskCard.closest('.kanban-column')?.dataset.column || null;
    this.lastKanbanColumn = this.sourceKanbanColumn;
    this.kanbanDropHandled = false;

    // Create responsive placeholder
    this.kanbanPlaceholder = document.createElement('div');
    this.kanbanPlaceholder.className = 'kanban-drag-placeholder';
    this.kanbanPlaceholder.style.height = `${taskCard.offsetHeight || 60}px`;

    taskCard.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.draggedTaskId);
  },

  // Handle kanban drag end
  handleKanbanDragEnd(e) {
    const taskCard = e.target.closest('.kanban-task') || this.draggedElement;
    if (taskCard) {
      taskCard.classList.remove('dragging');
    }

    if (this.kanbanPlaceholder && this.kanbanPlaceholder.parentNode) {
      this.kanbanPlaceholder.parentNode.removeChild(this.kanbanPlaceholder);
    }
    this.kanbanPlaceholder = null;

    document.querySelectorAll('.kanban-column-content.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });

    // Ensure viewsContainer drag-over-zotero is never lingering
    document.querySelector('.views-container')?.classList.remove('drag-over-zotero');

    this.draggedElement = null;
    this.draggedTaskId = null;
    this.sourceKanbanColumn = null;
    this.lastKanbanColumn = null;
    this.kanbanDropHandled = false;
  },

  // Allow dropping on kanban columns with dynamic placeholder repositioning
  handleKanbanDragOver(e) {
    const { content, column } = this.getKanbanColumnFromEvent(e);
    if (!column || !this.draggedTaskId || !content) return;

    this.lastKanbanColumn = column;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Position placeholder precisely before or after hovered card
    const hoveredCard = e.target.closest('.kanban-task');
    if (this.kanbanPlaceholder) {
      if (hoveredCard && hoveredCard !== this.draggedElement) {
        const rect = hoveredCard.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          content.insertBefore(this.kanbanPlaceholder, hoveredCard);
        } else {
          content.insertBefore(this.kanbanPlaceholder, hoveredCard.nextSibling);
        }
      } else if (!hoveredCard && !content.contains(this.kanbanPlaceholder)) {
        content.appendChild(this.kanbanPlaceholder);
      }
    }
  },

  // Move task to the dropped kanban column and order position
  async handleKanbanDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const { content, column } = this.getKanbanColumnFromEvent(e);
    const taskId = this.draggedTaskId;
    if (!column || !taskId) return;

    this.kanbanDropHandled = true;
    content?.classList.remove('drag-over');

    // Extract target task ID before removing placeholder
    let targetTaskId = null;
    if (this.kanbanPlaceholder && this.kanbanPlaceholder.parentNode) {
      const nextCard = this.kanbanPlaceholder.nextElementSibling;
      if (nextCard && nextCard.classList.contains('kanban-task') && nextCard.dataset.taskId !== taskId) {
        targetTaskId = nextCard.dataset.taskId;
      }
      this.kanbanPlaceholder.parentNode.removeChild(this.kanbanPlaceholder);
    }
    this.kanbanPlaceholder = null;

    await this.completeKanbanMove(column, taskId, targetTaskId);
  },

  // Persist a kanban status change and/or position reorder cleanly.
  async completeKanbanMove(column, taskId = this.draggedTaskId, targetTaskId = null) {
    if (!taskId) return null;

    const task = TaskManager.getTaskById(taskId);
    if (!task) return null;

    const currentStatus = TaskManager.getKanbanStatus(task);
    // If same column and no target position changed, nothing to do
    if (currentStatus === column && !targetTaskId) {
      return null;
    }

    const updated = await TaskManager.moveTaskToKanbanColumn(taskId, column, targetTaskId);
    if (updated) {
      UI.renderKanban();
      UI.updateHeaderProgress();
      UI.notifyServiceWorker();
      UI.showToast(currentStatus !== column ? '任务状态已更新' : '任务顺序已更新');
    }

    return updated;
  },

  // Highlight kanban drop target
  handleKanbanDragEnter(e) {
    const { content } = this.getKanbanColumnFromEvent(e);
    if (content && this.draggedTaskId) {
      content.classList.add('drag-over');
    }
  },

  // Remove highlight when leaving a kanban drop target
  handleKanbanDragLeave(e) {
    const { content } = this.getKanbanColumnFromEvent(e);
    if (content && !content.closest('.kanban-column')?.contains(e.relatedTarget)) {
      content.classList.remove('drag-over');
    }
  }
};
