# Todolist for Zotero 📚✨

<p align="center">
  <img src="chrome/content/icons/icon128.png" width="96" height="96" alt="Todolist Logo" />
</p>

<p align="center">
  <strong>A premium, full-featured task board & academic schedule management add-on tailored for literature reading, research tracking, and paper writing in Zotero</strong>
</p>

<p align="center">
  <a href="https://github.com/groele/Todolist-Zotero/releases/latest"><img src="https://img.shields.io/github/v/release/groele/Todolist-Zotero?style=flat-square&color=6366f1" alt="Release" /></a>
  <img src="https://img.shields.io/badge/Zotero-10%20%7C%207%2B-059669?style=flat-square" alt="Zotero Compatibility" />
  <img src="https://img.shields.io/badge/Platform-Win%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License" />
</p>

<p align="center">
  <strong>English</strong> | <a href="README.md"><strong>简体中文</strong></a>
</p>

---

## 🌟 Why Todolist for Zotero?

Traditional todo apps (like Todoist or TickTick) lack contextual integration with scientific research workflows:
- ❌ **Disconnected context**: Papers live in Zotero while tasks live in third-party apps without paper links;
- ❌ **Lost reading positions**: Cannot jump directly to the exact page or formula you were studying;
- ❌ **Cross-device sync barrier**: Mobile or tablet reading cannot access literature-specific checklists;
- ❌ **No academic workflow abstractions**: Lack structured stages for literature surveys, methodology, experiments, and review deadlines.

**Todolist for Zotero** bridges this gap seamlessly, integrating four versatile task boards, a Pomodoro timer, fluid animations, and **two-way native linkage** with Zotero items, PDF reader, and cloud note syncing!

---

## 🎓 Core Features

### 1. Deep Academic Literature Integration
- 🎯 **Bi-directional Item Linking**: Tasks bind directly to Zotero items (title, authors, year, journal). Click to highlight the item in your library;
- 📖 **Native PDF Reader Page Navigation**: Click `[📖 Read P.xx]` to open the Zotero reader and jump directly to the target page;
- 📝 **Cloud Note Synchronization**: Sync reading checklists into rich-text child notes (`📝 [Todolist] Reading Checklist & Progress`) with native Zotero cloud sync support;
- ⚡ **5-Step Academic Reading Milestones**: Generate standard milestones with one click (Abstract, Methodology, Experiments, Data Validation, Summary Notes);
- 📋 **Item Details Pane Widget (ItemPane)**: View and check tasks directly in the Zotero right-hand inspector pane;
- 🏷️ **Automated Tags**: Automatically adds `To-Read` on task creation and `Reading Completed` on task completion;
- 📋 **One-Click Citation Copying**: Export citations in standard formats (APA, IEEE, GB/T 7714).

### 2. Three Seamless Window Modes
- 📑 **Tab Mode**: Embedded inside Zotero's main tab bar for wide-screen productivity;
- 🗗 **Subwindow Mode (460×760)**: Compact split-screen companion placed beside the PDF reader;
- ⬚ **Standalone Window (1120×760)**: Independent desktop window for multi-monitor setups.

### 3. Four Multidimensional Views
- 📋 **List View**: Grouped by overdue, today, upcoming, priority, and academic tags;
- 📊 **Kanban View**: Three fluid columns (Todo, In Progress, Done) with smooth drag-and-drop;
- 📅 **Calendar View**: Monthly overview of research schedules and submission deadlines;
- 📈 **Statistics View**: Completion rates, time tracking analytics, and category breakdowns.

### 4. Time & Focus Management
- ⏱️ **Built-in Pomodoro Timer**: Track reading time per paper with analytics;
- ⏰ **Time Capsule Quick Presets**: Quick deadline selection (`09:00`, `12:00`, `14:00`, `18:00`, `20:00`);
- 🔔 **Desktop & Audio Reminders**: Gentle alerts before deadlines.

### 5. Native Storage & Security
- 💾 **Native IOUtils Persistence**: Stored locally in Zotero's data directory (`todolist-data.json`);
- 📤 **Full Backup & Multi-format Export**: Supports JSON backup/restore, CSV, Markdown, and TXT export.

---

## 📥 Installation

### Method 1: Install XPI Package (Recommended)
1. Download `todolist-zotero-2.0.0.xpi` from [GitHub Releases](https://github.com/groele/Todolist-Zotero/releases/latest);
2. In Zotero 7+ or 10, navigate to: **Tools → Plugins (or Add-ons)**;
3. Click the gear icon ⚙️ in the top-right corner and select **"Install Add-on From File..."**;
4. Select the downloaded `todolist-zotero-2.0.0.xpi` file and confirm installation;
5. Restart Zotero when prompted. The Todolist icon will appear in your toolbar.

### Method 2: Developer Debugging Mode
1. Open Zotero profile directory under `extensions/`:
   - **Windows**: `%APPDATA%\Zotero\Zotero\Profiles\<profile>\extensions\`
   - **macOS**: `~/Library/Application Support/Zotero/Profiles/<profile>/extensions/`
   - **Linux**: `~/.zotero/zotero/<profile>/extensions/`
2. Create a text file named `todolist@groele.org` (no file extension);
3. Enter the **absolute path** of this project folder into the file;
4. Restart Zotero to debug live.

---

## ⌨️ Shortcuts

| Shortcut | Description | Context |
| :--- | :--- | :--- |
| `Ctrl + Alt + T` / `Cmd + Alt + T` | Open / Toggle Todolist workspace | Global |
| `Ctrl + Shift + T` / `Cmd + Shift + T` | Extract selected text to create reading task | Zotero PDF Reader |
| `Esc` | Close modal / exit full screen | Modals |
| `Enter` | Save subtask / quick add | Input fields |

---

## 📜 License

Distributed under the [MIT License](LICENSE).
