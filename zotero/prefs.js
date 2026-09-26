// Todolist for Zotero - Default Preferences
// Group 1: Window Modes & Multi-window Layout
pref("extensions.todolist.windowMode", "tab");
pref("extensions.todolist.subwindowAlwaysOnTop", false);
pref("extensions.todolist.subwindowCompactMode", true);

// Group 2: Display & Views
pref("extensions.todolist.defaultView", "list");
pref("extensions.todolist.theme", "light");
pref("extensions.todolist.showCompleted", true);
pref("extensions.todolist.sortOrder", "dueDate");
pref("extensions.todolist.showWelcomeOnStartup", true);

// Group 3: Literature ItemPane Sidebar
pref("extensions.todolist.enableItemPane", true);
pref("extensions.todolist.itemPaneShowProgressBar", true);
pref("extensions.todolist.itemPaneShowSubtasks", true);
pref("extensions.todolist.locateOnTaskClick", true);
pref("extensions.todolist.dragDropFromLibrary", true);

// Group 4: Child Note Cloud Sync (Multi-Device Sync)
pref("extensions.todolist.autoSyncChildNote", true);
pref("extensions.todolist.childNoteTitle", "📝 [Todolist] 研读清单与进度");
pref("extensions.todolist.childNoteIncludeSubtasks", true);
pref("extensions.todolist.childNoteIncludeQuotes", true);
pref("extensions.todolist.childNoteAutoUpdateOnSubtask", true);

// Group 5: Automated Literature Tags
pref("extensions.todolist.autoTagOnCreate", true);
pref("extensions.todolist.tagForPending", "待研读");
pref("extensions.todolist.autoTagOnComplete", true);
pref("extensions.todolist.tagForCompleted", "精读已完成");
pref("extensions.todolist.autoTagFromItem", true);

// Group 6: Academic Presets & Reader Automation
pref("extensions.todolist.academicPresets", true);
pref("extensions.todolist.defaultTaskType", "literature_reading");
pref("extensions.todolist.defaultPriority", "medium");
pref("extensions.todolist.readerShortcutAction", "create_instant");
pref("extensions.todolist.pdfReaderJumpPage", true);

// Group 7: Pomodoro Focus Sprint & Sound Reminders
pref("extensions.todolist.enableSound", true);
pref("extensions.todolist.pomodoroFocus", 25);
pref("extensions.todolist.pomodoroShortBreak", 5);
pref("extensions.todolist.pomodoroLongBreak", 15);
pref("extensions.todolist.dailySummary", false);
pref("extensions.todolist.summaryTime", "09:00");

// Group 8: Maintenance & Archival
pref("extensions.todolist.autoArchiveDays", 0);
