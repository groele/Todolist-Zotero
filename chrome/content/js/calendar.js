// Calendar module for monthly view

const Calendar = {
  currentYear: null,
  currentMonth: null,
  selectedDate: null,
  onDateClickCallback: null,

  // Initialize calendar
  init() {
    const today = new Date();
    this.currentYear = today.getFullYear();
    this.currentMonth = today.getMonth();

    this.setupEventListeners();
  },

  // Setup event listeners
  setupEventListeners() {
    document.getElementById('btn-prev-month').addEventListener('click', () => {
      this.prevMonth();
    });

    document.getElementById('btn-next-month').addEventListener('click', () => {
      this.nextMonth();
    });
  },

  // Go to previous month
  prevMonth() {
    this.currentMonth--;
    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    }
    this.render();
  },

  // Go to next month
  nextMonth() {
    this.currentMonth++;
    if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    this.render();
  },

  // Render calendar
  async render() {
    const tasks = await Storage.getTasks();
    this.renderCalendar(this.currentYear, this.currentMonth, tasks);
  },

  // Render calendar grid
  renderCalendar(year, month, tasks) {
    // Update title
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月',
                        '7月', '8月', '9月', '10月', '11月', '12月'];
    document.getElementById('calendar-title').textContent = `${year}年 ${monthNames[month]}`;

    // Get first day of month and total days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();
    const startDay = firstDay.getDay(); // 0 = Sunday

    // Get today's date using local time
    const today = new Date();
    const todayStr = this.formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());

    // Build calendar days
    const container = document.getElementById('calendar-days');
    container.innerHTML = '';

    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i;
      const dateStr = this.formatDateStr(year, month - 1, day);
      const dayElement = this.createDayElement(day, dateStr, tasks, true, todayStr);
      container.appendChild(dayElement);
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = this.formatDateStr(year, month, day);
      const dayElement = this.createDayElement(day, dateStr, tasks, false, todayStr);
      container.appendChild(dayElement);
    }

    // Next month days
    const remainingCells = 42 - (startDay + totalDays);
    for (let day = 1; day <= remainingCells; day++) {
      const dateStr = this.formatDateStr(year, month + 1, day);
      const dayElement = this.createDayElement(day, dateStr, tasks, true, todayStr);
      container.appendChild(dayElement);
    }
  },

  // Create day element
  createDayElement(day, dateStr, tasks, isOtherMonth, todayStr) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    dayElement.dataset.date = dateStr;

    const dayNumber = document.createElement('span');
    dayNumber.className = 'calendar-day-number';
    dayNumber.textContent = day;
    dayElement.appendChild(dayNumber);

    if (isOtherMonth) {
      dayElement.classList.add('other-month');
    }

    if (dateStr === todayStr) {
      dayElement.classList.add('today');
    }

    if (dateStr === this.selectedDate) {
      dayElement.classList.add('selected');
    }

    // Check for tasks on this date
    const dayTasks = tasks.filter(t => t.dueDate === dateStr);
    if (dayTasks.length > 0) {
      dayElement.classList.add('has-tasks');

      // Check for overdue tasks
      const hasOverdue = dayTasks.some(t => !t.completed && Utils.isOverdue(t.dueDate));
      if (hasOverdue) {
        dayElement.classList.add('has-overdue');
      }

      // Render task previews inside day cell
      const tasksContainer = document.createElement('div');
      tasksContainer.className = 'calendar-day-tasks';

      const maxVisible = 3;
      dayTasks.slice(0, maxVisible).forEach(task => {
        const taskEl = document.createElement('div');
        taskEl.className = `calendar-task-indicator ${task.completed ? 'completed' : ''}`;
        taskEl.textContent = task.title;
        if (typeof Utils !== 'undefined') {
          taskEl.style.setProperty('--priority-color', Utils.getPriorityColor(task.priority));
        }
        tasksContainer.appendChild(taskEl);
      });

      if (dayTasks.length > maxVisible) {
        const moreEl = document.createElement('div');
        moreEl.className = 'calendar-task-indicator-more';
        moreEl.textContent = `+ 还有 ${dayTasks.length - maxVisible} 个...`;
        tasksContainer.appendChild(moreEl);
      }

      dayElement.appendChild(tasksContainer);
    }

    // Click handler
    dayElement.addEventListener('click', () => {
      this.selectDate(dateStr);
    });

    return dayElement;
  },

  // Format date string (YYYY-MM-DD) using local time
  formatDateStr(year, month, day) {
    // Handle month overflow
    const date = new Date(year, month, day);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  // Select a date
  selectDate(dateStr) {
    this.selectedDate = dateStr;

    // Update UI - remove all selected, then add to matching date
    document.querySelectorAll('.calendar-day.selected').forEach(el => {
      el.classList.remove('selected');
    });

    // Find and highlight the selected day using data attribute
    const targetDay = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);
    if (targetDay) {
      targetDay.classList.add('selected');
    }

    // Callback
    if (this.onDateClickCallback) {
      this.onDateClickCallback(dateStr);
    }
  },

  // Set date click callback
  onDateClick(callback) {
    this.onDateClickCallback = callback;
  },

  // Get selected date
  getSelectedDate() {
    return this.selectedDate;
  },

  // Clear selection
  clearSelection() {
    this.selectedDate = null;
    document.querySelectorAll('.calendar-day.selected').forEach(el => {
      el.classList.remove('selected');
    });
  }
};
