# Todolist for Zotero

<p align="center">
  <img src="chrome/content/icons/icon128.png" width="96" height="96" alt="Todolist icon" />
</p>

<p align="center"><strong>Keep tasks, literature reading, and Zotero reading positions in one workflow</strong></p>

<p align="center">
  <a href="https://github.com/groele/Todolist-Zotero/releases/latest"><img src="https://img.shields.io/github/v/release/groele/Todolist-Zotero?style=flat-square&color=6366f1" alt="Latest release" /></a>
  <img src="https://img.shields.io/badge/Zotero-10%2B-059669?style=flat-square" alt="Zotero 10+ (manifest support through 15.x)" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Cross-platform" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" /></a>
</p>

<p align="center"><a href="README.md">简体中文</a> | <strong>English</strong></p>

---

## Overview

**Todolist for Zotero** is a task and reading-workflow add-on for the Zotero desktop application. It links tasks to Zotero library items and carries PDF page references, excerpts, subtasks, and reading progress into your day-to-day task workflow. Plan work in list, kanban, calendar, or statistics views, then review and update linked tasks from the Zotero item details pane.

Use it to organize paper reading, writing, experiments and code reproduction, submission deadlines, peer review, or general study and personal tasks. The add-on does not require a separate online account or third-party task service.

## Features

### Task management

- Create, edit, complete, delete, and restore tasks. Tasks can include a title, description, due date and time, priority, category, tags, and subtasks.
- Set daily, weekly, biweekly, monthly, quarterly, or yearly recurrence. Completing a recurring task generates its next occurrence.
- Use built-in task types for literature reading, writing, experiments, submissions, and peer review. Create custom categories, tags, and task templates.
- Find and filter tasks by keywords, status, date, priority, and category; sort by due date, priority, creation time, or title.
- Review overdue, due today, upcoming, and completed tasks in the list view; complete or delete tasks in batches.

### Four task views

- **List**: Browse tasks by date and status, expand groups, review subtasks, and act on tasks.
- **Kanban**: Organize tasks by status, including to do, in progress, and done; drag tasks to change their status or order.
- **Calendar**: Review due dates and plans in a monthly view.
- **Statistics**: See task totals, completion rate, overdue and due-today counts, the last seven days of completions, and priority and category distributions.

### Zotero items and PDFs

- Create one or multiple reading tasks from selected Zotero library items. Tasks retain the item link and available bibliographic details.
- Create a task from selected text in the Zotero PDF reader using a shortcut. The task can store the excerpt, PDF page, and a link to its reading location.
- Open a linked Zotero item or PDF from a task. When a page or annotation anchor is available, the add-on can return to that reading position.
- Review linked tasks and reading progress in the Zotero item details pane (ItemPane). The pane supports quick task creation and checking off subtasks.
- Optionally sync reading tasks, subtasks, and excerpts to a child note on the Zotero item. Zotero's own sync can sync that note. **The add-on's task database remains in the local Zotero data directory and is not automatically synced across devices by this add-on.**
- Choose whether to inherit tags from library items and maintain Zotero item tags when reading tasks are created or completed.
- Copy a simple citation string for a linked item using its authors, year, and title. This is not a full APA, IEEE, or GB/T 7714 citation formatter.

### Reading plans and time management

- Start with one of five reading-checklist templates: general papers, theory, experiments, reviews, or algorithms and reproduction. Track each step as a subtask.
- Use task timers to record focused sessions and review elapsed time for an individual task.
- Set due reminders for tasks and optionally enable a daily task summary. The add-on checks for and delivers reminders while Zotero is running.
- Open the workspace in a Zotero tab, a compact companion window, or a separate window to keep tasks alongside a PDF.
- Choose the Zotero, light, dark, or system theme.

## A typical workflow

1. Select one or more items in your Zotero library and add them to Todolist.
2. Choose a reading type and checklist, then set a due date, priority, or note.
3. While reading a PDF, press `Ctrl+Shift+T` (`Cmd+Shift+T` on macOS) to turn selected text and the current page into a task.
4. Update tasks and check off subtasks in ItemPane, the list, or the kanban view. Open the linked item or PDF location when you need to return to the source.
5. If child-note sync is enabled, send reading progress to a Zotero child note. Export a backup or report from Preferences when needed.

## Installation

### Install the XPI (recommended)

1. Download the latest `.xpi` file from [GitHub Releases](https://github.com/groele/Todolist-Zotero/releases/latest).
2. In Zotero, open **Tools → Plugins**.
3. Click the gear menu in the plugin manager and choose **Install Add-on From File**.
4. Select the downloaded XPI and confirm. Restart Zotero if prompted.

### Install for development

1. Locate the `extensions/` directory in your Zotero profile.
   - Windows: `%APPDATA%\Zotero\Zotero\Profiles\<profile>\extensions\`
   - macOS: `~/Library/Application Support/Zotero/Profiles/<profile>/extensions/`
   - Linux: `~/.zotero/zotero/<profile>/extensions/`
2. Create a plain-text file named `todolist@groele.org` with no file extension.
3. Put the absolute path to this project directory in the file, save it, and start Zotero.

## Data, sync, and export

- In Zotero, task data is stored in `todolist-data.json` in the Zotero data directory. Export a JSON backup from Preferences before upgrading or moving a profile.
- JSON supports backup and restore. Imports can merge with existing data or replace it. CSV, Markdown, and TXT are for reading, organizing, or sharing exported data; they cannot be imported for restoration.
- Zotero child notes and item tags are Zotero item data. Their cross-device availability depends on your Zotero sync configuration. Creating a child note does not sync the add-on's task database.
- Clearing task data removes the add-on's local tasks and cannot be undone. Export a backup first.

## Scope and limitations

- The add-on manifest supports Zotero **10.0 and later, through version 15.x**. Check the latest release notes when upgrading to a new major Zotero version.
- Pomodoro countdowns, automatic archiving, and sound alerts are not currently wired up. Preference controls without runtime support are disabled or marked unavailable.
- Task reminders and daily summaries depend on Zotero running; they are not a replacement for an operating-system calendar or cloud reminder service.
- PDF page navigation and annotation links require a linked PDF and an available page or annotation anchor.
- The toolbar and native Zotero menus use an SVG icon. The 16, 32, 48, and 128 px PNG files are separate raster assets and do not set the native toolbar control's display size.

## Shortcuts

| Shortcut | Action | Context |
| --- | --- | --- |
| `Ctrl+Alt+T` / macOS `Cmd+Alt+T` | Open or toggle the Todolist workspace | Zotero |
| `Ctrl+Shift+T` / macOS `Cmd+Shift+T` | Turn selected PDF text and the current page into a reading task | Zotero PDF reader |

Preferences let you choose whether the PDF shortcut creates a task immediately or opens the task editor first.

## Project information

- Latest release: [GitHub Releases](https://github.com/groele/Todolist-Zotero/releases/latest).
- Bug reports and feature requests: [GitHub Issues](https://github.com/groele/Todolist-Zotero/issues).
- License: [MIT](LICENSE).
- Main application code lives under `chrome/content/`. `scripts/build-package.py` builds the Zotero XPI as a ZIP archive.
