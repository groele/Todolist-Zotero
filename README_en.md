# Todolist for Zotero 📚✨

<p align="center">
  <img src="images/icon128.png" width="96" height="96" alt="Todolist Logo" />
</p>

<p align="center">
  <strong>An elegant, full-featured academic task board and schedule management plugin designed specifically for scientific researchers, literature reading, and paper writing.</strong>
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

In academic research, general-purpose productivity tools (such as Todoist, TickTick, or Notion) are detached from the authentic literature workflow:
- ❌ **Disconnected Literature Context**: Reading tasks live in external apps while papers reside in Zotero, causing context switching overhead.
- ❌ **No Direct Page Anchors**: Tasks lose page context, making it frustrating to locate specific formulas, figures, or ablation tables.
- ❌ **Cross-Device Sync Barrier**: Mobile and tablet reading sessions cannot access the dedicated reading checklists created on the desktop.
- ❌ **Lack of Academic Milestone Modeling**: Missing specialized workflows for skimming, mathematical derivation, experimental replication, ablation studies, and peer review deadlines.

**Todolist for Zotero** is the first productivity plugin natively intertwined with Zotero. It combines four multi-dimensional Kanban views, an integrated Pomodoro timer, and smooth fluid animations with **two-way seamless synergy** across your Zotero library, PDF reader, cloud child notes, and the item inspection pane (ItemPane).

---

## 🚀 What's New in v2.0.0

- 🎨 **Unified 20-Icon Vector SVG System**: Completely replaced all raw platform-dependent emojis with crisp, cohesive 24×24 pixel-aligned vector SVGs for light and dark themes.
- 📐 **Pixel-Perfect Sidebar Alignment**: Resolved legacy bottom-bar padding inheritance, eliminated orphaned border lines, and established strict horizontal and vertical baseline alignment.
- 📑 **Comprehensive Vector Interactive Actions**: Fully vectorized task card action buttons (citation copy, note sync, library locate, Pomodoro timer) and window mode dropdown.
- ⚡ **Full Zotero 10 & 7+ Compatibility**: Verified syntax compliance against Gecko runtimes with SHA-256 archive checksum verification.

---

## 🎓 Core Features

### 1. Deep Academic Literature Synergy
- 🎯 **Two-Way Binding & Library Locating**: Tasks bind directly to Zotero items and metadata (title, authors, year, publication). Click a card to immediately highlight and locate the item in your library.
- 📖 **PDF Reader Companion & Exact Page Anchor**: Automatically captures target page anchors. Click `[📖 Read P.xx]` to jump straight into Zotero's built-in PDF reader at the precise page.
- 📝 **Cloud Note Synchronization**: Sync reading checklists to literature child notes (`📝 [Todolist] Reading Checklist & Progress`) with one click. Fully compatible with official Zotero Cloud sync for cross-device review on iPad/mobile.
- ⚡ **5-Step Academic Reading Milestone Generator**: Auto-generates standard academic reading phases (Skim Abstract & Conclusions, In-depth Mathematical Derivation, Ablation & Comparison Analysis, Code & Data Reproduction, Innovative Points & Note Synthesis).
- 📋 **Item Inspection Pane Widget (ItemPane)**: View task progress, interactive checklist, and quick-add tasks directly within Zotero's right-hand details pane.
- 🏷️ **Automated Literature Status Tags**: Automatically tags papers with `Reading Pending` on task creation, updating to `Reading Completed` once all steps are checked.
- 📋 **One-Click Academic Citation Export**: Quickly copy standard APA, IEEE, or GB/T 7714 citations directly from the task card.

### 2. Three Seamless Window Modes
Switch between three versatile form factors from the top toolbar:
- 📑 **Tab Mode**: Embedded as a native Zotero primary tab for immersive, wide-screen research management.
- 🗗 **Subwindow Mode (460×760)**: Compact sidecar companion tailored for split-screen reading alongside your PDF viewer.
- ⬚ **Standalone Window Mode (1120×760)**: Autonomous OS desktop window ideal for multi-monitor setups.

### 3. Four Multi-Dimensional Views
- 📋 **List View**: Intelligent grouping by overdue, today, upcoming, academic category, and priority with collapsible sections.
- 📊 **Kanban View**: Three-column fluid pipeline (To Do / In Progress / Completed) supporting both intra-column reordering and cross-column dragging.
- 📅 **Calendar View**: Monthly schedule overview displaying reading targets and conference submission deadlines.
- 📈 **Statistics View**: Real-time completion progress rings, daily reading time distributions, and category breakdowns.

### 4. Precision Time & Focus Management
- ⏱️ **Integrated Pomodoro Timer & Analytics**: Log dedicated reading sessions per paper to track time investments.
- ⏰ **Quick Time Capsules**: Full 24-hour time selection alongside quick presets (`09:00`, `12:00`, `14:00`, `18:00`, `20:00`).
- 🔔 **Desktop & Audio Alerts**: Gentle notifications and chimes ahead of approaching deadlines.

### 5. Data Privacy & Ecosystem Support
- 💾 **Local Native IOUtils Persistence**: Stored securely in `todolist-data.json` inside your Zotero profile directory with zero cloud quota limitations.
- 📤 **Full Backup & Multi-Format Export**: Full JSON backup and restore capabilities, plus CSV, Markdown, and TXT report exports.
- 🌐 **Chrome Extension Dual-Support**: Can also be loaded as an independent Chrome browser sidepanel extension.

---

## 📥 Installation

### Method 1: Install XPI Package (Recommended)
1. Download the latest `todolist-zotero-2.0.0.xpi` from [GitHub Releases](https://github.com/groele/Todolist-Zotero/releases/latest);
2. In Zotero 7+ or 10, navigate to: **Tools → Plugins (or Add-ons)**;
3. Click the gear icon ⚙️ in the top-right corner and select **"Install Add-on From File..."**;
4. Select the downloaded `todolist-zotero-2.0.0.xpi` file and confirm installation;
5. Restart Zotero when prompted. The Todolist icon will appear in your toolbar.

### Method 2: Developer Debugging Mode (No Packaging Needed)
1. Run `npm run build:zotero` to generate the `dist-zotero/` staging directory;
2. Navigate to your Zotero Profile directory's `extensions/` folder:
   - **Windows**: `%APPDATA%\Zotero\Zotero\Profiles\<profile>\extensions\`
   - **macOS**: `~/Library/Application Support/Zotero/Profiles/<profile>/extensions/`
   - **Linux**: `~/.zotero/zotero/<profile>/extensions/`
3. Create a plain text file named `todolist@groele.org` (without any extension);
4. Write the **absolute path** of your project's `dist-zotero` directory into this file;
5. Restart Zotero to load and debug live code modifications.

---

## ⌨️ Global Shortcuts

| Shortcut | Description | Context |
| :--- | :--- | :--- |
| `Ctrl + Alt + T` / `Cmd + Alt + T` | Open / Toggle Todolist Workbench | Global across Zotero |
| `Ctrl + Shift + T` / `Cmd + Shift + T` | Extract selected text to create literature task | Built-in PDF Reader |
| `Esc` | Close modal dialog or exit fullscreen | Modal / Editing state |
| `Enter` | Save subtask or confirm quick-add task | Input focus |

---

## 🛠️ Build & Development

The build pipeline relies on **Node.js (>= 18)** and **PowerShell 7 (pwsh)**.

```bash
# 1. Clone repository
git clone https://github.com/groele/Todolist-Zotero.git
cd Todolist-Zotero

# 2. Run packaging pipeline (syntax check, asset assembly, XPI archiving)
npm run build:zotero
```

The pipeline automatically handles:
- 🧹 Cleaning and assembling the standard Gecko Add-on structure `dist-zotero/`;
- 🔍 Performing `node --check` syntax validation across all runtime scripts;
- 📦 Archiving and computing SHA-256 checksums to output `dist-zip/todolist-zotero-2.0.0.xpi`.

---

## 📂 Project Architecture

```
Todolist-Zotero/
├── zotero/                           # Native Zotero Add-on Layer
│   ├── manifest.json                 # Extension manifest & version declaration
│   ├── bootstrap.js                  # Gecko plugin lifecycle & chrome resource mapping
│   ├── chrome.manifest               # Protocol registry
│   ├── update.json                   # Auto-update configuration
│   ├── locale/                       # Fluent i18n locales (zh-CN, en-US)
│   └── chrome/content/
│       ├── preferences.xhtml         # Native preferences panel XHTML
│       └── scripts/index.js          # Host process script (menus, ItemPane, IPC, IOUtils)
├── js/                               # Frontend Application & Rendering Engine
│   ├── zoteroBridge.js               # IPC bridge between webview and Zotero host
│   ├── storage.js                    # Adaptive storage adapter (IOUtils / Chrome / LocalStorage)
│   ├── taskManager.js                # Task state machine & filter engine
│   ├── ui.js                         # Core UI rendering & event delegation
│   ├── modal.js                      # Task modal & literature attachment controller
│   └── timeTracking.js               # Pomodoro & time analytics tracker
├── css/                              # Modern design system & animations
├── index.html                        # Widescreen desktop & tab interface
├── sidepanel.html                    # Compact browser & subwindow interface
└── dist-zip/                         # Release package archive (todolist-zotero-2.0.0.xpi)
```

---

## 📜 License

Distributed under the [MIT License](LICENSE). Contributions, bug reports, and pull requests are warmly welcomed to advance academic research productivity together!
