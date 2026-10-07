/**
 * Todolist for Zotero - Host Runtime Script
 * Seamlessly integrates Todolist with Zotero 7+ desktop:
 * - Native Zotero Tab & Standalone Companion Window
 * - Tools menu, context menus, and main toolbar icon
 * - Item Pane Section (Literature detail inspector)
 * - PDF Reader companion & Annotation to task converter
 * - High-speed IOUtils JSON persistence in Zotero Data Directory
 */

(function () {
  if (typeof Zotero === 'undefined') {
    return;
  }

  const ADDON_ID = 'todolist@groele.org';
  const CHROME_ROOT = 'chrome://todolist/content/';

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Data helpers
  const itemSelectUri = (item) => {
    if (!item) return '';
    const key = item.key || item.id;
    const groupID = Zotero.Libraries?.get?.(item.libraryID)?.groupID;
    return groupID
      ? `zotero://select/groups/${groupID}/items/${key}`
      : `zotero://select/library/items/${key}`;
  };

  const getLiteratureItem = (item) => {
    if (!item) return null;
    let target = item;
    try {
      if (target.topLevelItem && typeof target.topLevelItem.isRegularItem === 'function' && target.topLevelItem.isRegularItem()) {
        return target.topLevelItem;
      }
    } catch (_) {}
    if (typeof target.isAttachment === 'function' && target.isAttachment()) {
      if (target.parentItemID) {
        target = Zotero.Items.get(target.parentItemID) || target;
      }
    }
    if (typeof target.isNote === 'function' && target.isNote()) {
      if (target.parentItemID) {
        target = Zotero.Items.get(target.parentItemID) || target;
      }
    }
    try {
      if (target.topLevelItem && typeof target.topLevelItem.isRegularItem === 'function' && target.topLevelItem.isRegularItem()) {
        return target.topLevelItem;
      }
    } catch (_) {}
    return target && typeof target.isRegularItem === 'function' && target.isRegularItem() ? target : null;
  };

  const serializeLiteratureItem = (item) => {
    const target = getLiteratureItem(item);
    if (!target) return null;

    const title = (typeof target.getField === 'function' ? target.getField('title') : target.title) || '无标题文献';
    const date = typeof target.getField === 'function' ? target.getField('date') : target.date;
    let year = '';
    if (date) {
      const match = String(date).match(/\b(19|20)\d{2}\b/);
      year = match ? match[0] : String(date).slice(0, 4);
    }

    let authors = [];
    try {
      if (typeof target.getCreators === 'function') {
        authors = target.getCreators().map((c) => c.lastName || c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim()).filter(Boolean);
      }
    } catch (_) {}

    const publication = typeof target.getField === 'function'
      ? (target.getField('publicationTitle') || target.getField('proceedingsTitle') || target.getField('publisher') || '')
      : '';

    let tags = [];
    try {
      if (typeof target.getTags === 'function') {
        tags = target.getTags().map((t) => t.tag || String(t)).filter(Boolean);
      }
    } catch (_) {}

    // Find main PDF attachment
    let pdfUri = null;
    try {
      if (typeof target.getAttachments === 'function') {
        const attIds = target.getAttachments();
        for (const attId of attIds) {
          const att = Zotero.Items.get(attId);
          if (att && ((typeof att.isPDFAttachment === 'function' && att.isPDFAttachment()) || att.contentType === 'application/pdf')) {
            const groupID = Zotero.Libraries?.get?.(att.libraryID)?.groupID;
            pdfUri = groupID
              ? `zotero://open-pdf/groups/${groupID}/items/${att.key}`
              : `zotero://open-pdf/library/items/${att.key}`;
            break;
          }
        }
      }
    } catch (_) {}

    return {
      key: target.key || String(target.id),
      id: target.id,
      libraryID: target.libraryID,
      title,
      authors: authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' 等' : ''),
      year,
      publication,
      tags,
      zoteroUri: itemSelectUri(target),
      pdfUri,
    };
  };

  const resolveItemReference = (reference, libraryID) => {
    if (!reference) return null;
    const raw = String(reference).trim();
    const groupMatch = raw.match(/^zotero:\/\/(?:select|open-pdf)\/groups\/(\d+)\/items\/([A-Za-z0-9_]+)/);
    const key = groupMatch?.[2] || raw.match(/\/items\/([A-Za-z0-9_]+)(?:[?#]|$)/)?.[1] || raw;
    if (!/^[A-Za-z0-9_]+$/.test(key)) return null;
    if (!raw.includes('/items/') && /^\d+$/.test(key)) return Zotero.Items.get(Number(key));

    let targetLibraryID = Number.isInteger(Number(libraryID)) && Number(libraryID) > 0
      ? Number(libraryID) : Zotero.Libraries?.userLibraryID || 1;
    if (groupMatch) {
      targetLibraryID = Zotero.Groups?.getLibraryIDFromGroupID?.(Number(groupMatch[1])) || targetLibraryID;
    }
    return Zotero.Items.getByLibraryAndKey?.(targetLibraryID, key) || null;
  };

  // Tracking structures
  const injectedElements = new Map();
  const pendingWindowLoads = new Map();
  let windowListener = null;

  Zotero.Todolist = {
    rootURI: typeof rootURI !== 'undefined' ? rootURI : '',
    addonId: ADDON_ID,
    localizedDocs: new Set(),
    _cachedData: null,
    _dataListeners: new Set(),

    ensureLocalization(doc) {
      if (!doc || this.localizedDocs.has(doc)) return;
      const existing = doc.querySelector('link[rel="localization"][href="todolist.ftl"]');
      if (existing) return;
      try {
        doc.defaultView?.MozXULElement?.insertFTLIfNeeded('todolist.ftl');
        if (doc.querySelector('link[rel="localization"][href="todolist.ftl"]')) {
          this.localizedDocs.add(doc);
        }
      } catch (error) {
        Zotero.logError?.('[Todolist] Could not load translations: ' + error);
      }
    },

    ensureItemPaneStyles(doc) {
      if (!doc) return;
      if (doc.getElementById('todolist-itempane-styles')) return;
      try {
        const style = doc.createElementNS
          ? doc.createElementNS('http://www.w3.org/1999/xhtml', 'style')
          : doc.createElement('style');
        style.id = 'todolist-itempane-styles';
        style.textContent = `
          .td-pane-wrap {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 6px 2px 10px 2px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 12px;
            box-sizing: border-box;
            width: 100%;
          }

          /* Header card & Progress bar */
          .td-header-card {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 8px 10px;
            background: rgba(0, 0, 0, 0.025);
            border: 1px solid rgba(0, 0, 0, 0.08);
            border-radius: 8px;
            box-sizing: border-box;
          }
          .td-header-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .td-status-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 12px;
            line-height: 1.3;
          }
          .td-status-empty {
            background: rgba(100, 116, 139, 0.12);
            color: #64748b;
          }
          .td-status-active {
            background: rgba(16, 185, 129, 0.12);
            color: #059669;
          }
          .td-status-done {
            background: rgba(16, 185, 129, 0.2);
            color: #047857;
          }
          .td-progress-pct {
            font-size: 11px;
            font-weight: 700;
            color: #059669;
          }
          .td-progress-track {
            width: 100%;
            height: 6px;
            background: rgba(0, 0, 0, 0.08);
            border-radius: 3px;
            overflow: hidden;
          }
          .td-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #10b981, #059669);
            border-radius: 3px;
            transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }

          /* Empty State Card */
          .td-empty-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            padding: 14px 12px;
            gap: 8px;
            background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
            border: 1px solid rgba(0, 0, 0, 0.09);
            border-radius: 8px;
            box-sizing: border-box;
          }
          .td-empty-title {
            font-size: 12px;
            font-weight: 600;
            color: #334155;
            display: flex;
            align-items: center;
            gap: 5px;
          }
          .td-empty-desc {
            font-size: 11px;
            color: #64748b;
            line-height: 1.4;
            max-width: 260px;
          }
          .td-btn-milestone-primary {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            padding: 6px 14px;
            font-size: 11px;
            font-weight: 600;
            color: #ffffff !important;
            background: linear-gradient(135deg, #059669, #10b981) !important;
            border: none !important;
            border-radius: 6px !important;
            cursor: pointer !important;
            box-shadow: 0 1px 3px rgba(5, 150, 105, 0.3);
            appearance: none;
            -moz-appearance: none;
            transition: all 0.15s ease;
            margin-top: 2px;
          }
          .td-btn-milestone-primary:hover {
            background: linear-gradient(135deg, #047857, #059669) !important;
            box-shadow: 0 2px 6px rgba(5, 150, 105, 0.4);
            transform: translateY(-1px);
          }
          .td-btn-milestone-primary:active {
            transform: translateY(0);
          }

          /* Task List */
          .td-task-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 280px;
            overflow-y: auto;
            padding-right: 2px;
            box-sizing: border-box;
          }
          .td-task-card {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 7px 9px;
            border-radius: 7px;
            background: #ffffff;
            border: 1px solid rgba(0, 0, 0, 0.08);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
            transition: border-color 0.15s, box-shadow 0.15s;
            box-sizing: border-box;
          }
          .td-task-card:hover {
            border-color: rgba(5, 150, 105, 0.4);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
          }
          .td-task-card.is-completed {
            opacity: 0.65;
            background: #f8fafc;
          }
          .td-task-row {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .td-prio-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            flex-shrink: 0;
          }
          .td-prio-high { background: #ef4444; }
          .td-prio-medium { background: #f59e0b; }
          .td-prio-low { background: #10b981; }

          .td-checkbox {
            cursor: pointer;
            width: 14px;
            height: 14px;
            margin: 0;
            accent-color: #059669;
            flex-shrink: 0;
          }
          .td-task-title {
            flex: 1;
            font-size: 12px;
            font-weight: 500;
            color: #1e293b;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            cursor: pointer;
          }
          .td-task-title.is-done {
            text-decoration: line-through;
            color: #94a3b8;
          }
          .td-badge-date {
            font-size: 10px;
            padding: 1px 5px;
            border-radius: 4px;
            background: rgba(217, 119, 6, 0.12);
            color: #d97706;
            flex-shrink: 0;
            line-height: 1.3;
          }
          .td-badge-date.is-overdue {
            background: rgba(239, 68, 68, 0.12);
            color: #dc2626;
            font-weight: 600;
          }
          .td-subtask-toggle {
            font-size: 10px;
            padding: 1px 5px;
            border-radius: 4px;
            background: rgba(0, 0, 0, 0.05);
            color: #475569;
            cursor: pointer;
            user-select: none;
            flex-shrink: 0;
            border: none;
            appearance: none;
            -moz-appearance: none;
            line-height: 1.3;
          }
          .td-subtask-toggle:hover {
            background: rgba(0, 0, 0, 0.09);
          }
          .td-task-delete {
            background: none !important;
            border: none !important;
            color: #94a3b8 !important;
            cursor: pointer !important;
            font-size: 14px !important;
            line-height: 1 !important;
            padding: 0 3px !important;
            opacity: 1;
            min-width: 36px;
            min-height: 28px;
            appearance: none;
            -moz-appearance: none;
            flex-shrink: 0;
          }
          .td-task-delete:hover {
            opacity: 1;
            color: #ef4444 !important;
          }

          /* Subtask list */
          .td-subtask-list {
            display: flex;
            flex-direction: column;
            gap: 3px;
            margin-left: 20px;
            padding-left: 6px;
            border-left: 2px solid rgba(0, 0, 0, 0.07);
            margin-top: 3px;
            margin-bottom: 2px;
          }
          .td-subtask-item {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            color: #475569;
          }
          .td-subtask-title {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .td-subtask-title.is-done {
            text-decoration: line-through;
            color: #94a3b8;
          }

          /* Compound Quick Add Row */
          .td-quick-box {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 3px 5px 3px 6px;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            margin-top: 2px;
            transition: border-color 0.15s, box-shadow 0.15s;
            box-sizing: border-box;
          }
          .td-quick-box:focus-within {
            border-color: #059669;
            box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.15);
          }
          .td-prio-select {
            font-size: 11px;
            padding: 2px 4px;
            border-radius: 4px;
            border: 1px solid rgba(0, 0, 0, 0.08);
            background: rgba(0, 0, 0, 0.03);
            color: #475569;
            cursor: pointer;
            outline: none;
            flex-shrink: 0;
          }
          .td-quick-input {
            flex: 1;
            border: none !important;
            background: transparent !important;
            font-size: 12px;
            color: #1e293b;
            outline: none;
            padding: 3px 4px;
            min-width: 0;
            box-sizing: border-box;
          }
          .td-quick-input::placeholder {
            color: #94a3b8;
          }
          .td-quick-submit {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            border-radius: 4px;
            background: #059669 !important;
            color: #ffffff !important;
            border: none !important;
            cursor: pointer !important;
            font-size: 15px;
            font-weight: 700;
            line-height: 1;
            flex-shrink: 0;
            appearance: none;
            -moz-appearance: none;
            transition: background 0.15s;
          }
          .td-quick-submit:hover {
            background: #047857 !important;
          }

          /* Action Buttons Grid (2 Columns, perfectly aligned, no overflow) */
          .td-action-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            margin-top: 4px;
            box-sizing: border-box;
          }
          .td-action-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 5px 6px;
            font-size: 11px;
            font-weight: 500;
            color: #334155 !important;
            background: #ffffff !important;
            border: 1px solid rgba(0, 0, 0, 0.1) !important;
            border-radius: 6px !important;
            cursor: pointer !important;
            text-decoration: none;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            appearance: none;
            -moz-appearance: none;
            transition: all 0.15s ease;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
            box-sizing: border-box;
          }
          .td-action-btn:hover {
            background: #f8fafc !important;
            border-color: rgba(5, 150, 105, 0.4) !important;
            color: #059669 !important;
            transform: translateY(-0.5px);
          }
          .td-action-btn:active {
            transform: translateY(0);
          }
          .td-action-btn-pdf {
            grid-column: 1 / -1;
            background: linear-gradient(135deg, rgba(37, 99, 235, 0.06), rgba(59, 130, 246, 0.1)) !important;
            border-color: rgba(37, 99, 235, 0.25) !important;
            color: #1d4ed8 !important;
            font-weight: 600;
          }
          .td-action-btn-pdf:hover {
            background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(59, 130, 246, 0.18)) !important;
            border-color: #2563eb !important;
            color: #1e40af !important;
          }

          /* The ItemPane sidenav is an icon rail. Keep its localized name as
             a tooltip/accessibility label without allowing it to wrap beside
             the icon in narrow Zotero panes. */
          item-pane-sidenav .btn[data-pane*="todolist-item-pane"] {
            width: 28px !important;
            height: 28px !important;
            min-width: 28px !important;
            padding: 4px !important;
            overflow: hidden !important;
            font-size: 0 !important;
            line-height: 0 !important;
            color: transparent !important;
            text-indent: -9999px !important;
            white-space: nowrap !important;
          }
          item-pane-sidenav .btn[data-pane*="todolist-item-pane"]::before,
          item-pane-sidenav .btn[data-pane*="todolist-item-pane"]::after {
            content: none !important;
          }

          /* Dark theme support */
          @media (prefers-color-scheme: dark) {
            .td-pane-wrap { color: #e2e8f0; }
            .td-header-card {
              background: rgba(255, 255, 255, 0.04);
              border-color: rgba(255, 255, 255, 0.08);
            }
            .td-empty-card {
              background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
              border-color: rgba(255, 255, 255, 0.1);
            }
            .td-empty-title { color: #f1f5f9; }
            .td-empty-desc { color: #94a3b8; }
            .td-task-card {
              background: #1e293b;
              border-color: rgba(255, 255, 255, 0.08);
            }
            .td-task-card.is-completed {
              background: rgba(30, 41, 59, 0.6);
            }
            .td-task-title { color: #f1f5f9; }
            .td-subtask-item { color: #cbd5e1; }
            .td-quick-box {
              background: #1e293b;
              border-color: #334155;
            }
            .td-prio-select {
              background: #0f172a;
              border-color: #334155;
              color: #e2e8f0;
            }
            .td-quick-input { color: #f1f5f9; }
            .td-action-btn {
              background: #1e293b !important;
              border-color: rgba(255, 255, 255, 0.1) !important;
              color: #e2e8f0 !important;
            }
            .td-action-btn:hover {
              background: #334155 !important;
              border-color: #10b981 !important;
              color: #34d399 !important;
            }
            .td-action-btn-pdf {
              background: rgba(37, 99, 235, 0.15) !important;
              border-color: rgba(59, 130, 246, 0.35) !important;
              color: #60a5fa !important;
            }
          }
        `;
        (doc.head || doc.documentElement || doc.body).appendChild(style);
      } catch (e) {
        Zotero.logError?.('[Todolist] Failed to inject itemPane styles: ' + e);
      }
    },

    getDataFilePath() {
      const baseDir = Zotero.DataDirectory?.dir || PathUtils.profileDir;
      return PathUtils.join(baseDir, 'todolist-data.json');
    },

    localDateString(date) {
      return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    },

    serializeLiteratureItem,

    cloneData(data) { return JSON.parse(JSON.stringify(data)); },

    async loadData() {
      if (this._cachedData) return this.cloneData(this._cachedData);
      if (!this._loadPromise) this._loadPromise = this.readDataFile();
      try { return this.cloneData(await this._loadPromise); }
      finally { this._loadPromise = null; }
    },

    async readDataFile() {
      const filePath = this.getDataFilePath();
      try {
        if (await IOUtils.exists(filePath)) {
          const data = JSON.parse(await IOUtils.readUTF8(filePath));
          if (!data || !Array.isArray(data.tasks)) throw new Error('任务数据格式无效');
          const seen = new Set();
          data.tasks = data.tasks.filter(t => t && t.id && !seen.has(t.id) && seen.add(t.id));
          this._cachedData = data;
        } else {
          this._cachedData = { tasks: [], settings: { defaultView: 'list', showCompleted: true,
            sortOrder: 'dueDate', theme: 'light', dailySummary: false, summaryTime: '09:00' }, customTags: [] };
        }
        return this._cachedData;
      } catch (error) {
        Zotero.logError?.('[Todolist] 数据读取失败，保留原文件: ' + error);
        throw error;
      }
    },

    async saveData(data) {
      const request = this.cloneData(data);
      const run = async () => {
        const current = await this.loadData();
        const prepared = request.importRequest ? TaskRules.prepareImport(current, request.importRequest.payload, request.importRequest.mode) : null;
        const patch = prepared ? { ...prepared.patch, syncLinkedItems: request.syncLinkedItems } : request;
        const next = { ...current, ...patch };
        TaskRules.applyTaskGeneration(current, next, patch);
        delete next.syncLinkedItems;
        if (patch.settings) next.settings = patch.replaceSettings ? patch.settings : { ...current.settings, ...patch.settings };
        delete next.replaceSettings;
        if (patch.taskChanges) {
          const { added = [], updated = [], deleted = [] } = patch.taskChanges;
          const removed = new Set(deleted);
          next.tasks = current.tasks.filter(t => !removed.has(t.id)).map(t => {
            const update = updated.find(u => u.id === t.id);
            return update ? { ...t, ...update.changes, id: t.id } : t;
          });
          for (const task of added) if (!next.tasks.some(t => t.id === task.id)) next.tasks.push(task);
          delete next.taskChanges;
        }
        if (patch.activeTimerChanges) {
          next.activeTimers = { ...current.activeTimers };
          for (const [id, timer] of Object.entries(patch.activeTimerChanges)) {
            if (timer) next.activeTimers[id] = timer;
            else delete next.activeTimers[id];
          }
          delete next.activeTimerChanges;
        }
        TaskRules.applyTimerAction(next, patch.timerAction);
        delete next.timerAction;
        const notificationResult = TaskRules.applyNotificationAction(next, patch.notificationAction);
        delete next.notificationAction;
        if (patch.taskChanges) {
          for (const task of [...next.tasks]) {
            const was = current.tasks.find(t => t.id === task.id);
            if (task.completed && !was?.completed) {
              const recurring = TaskRules.buildNextTask(task, next.tasks,
                () => 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10));
              if (recurring) next.tasks.push(recurring);
            }
          }
        }
        const seen = new Set();
        next.tasks = next.tasks.filter(t => t && t.id && !seen.has(t.id) && seen.add(t.id));
        next.tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
        next.revision = (current.revision || 0) + 1;
        const ids = new Set(next.tasks.map(t => t.id));
        next.activeTimers = Object.fromEntries(Object.entries(next.activeTimers || {}).filter(([id]) => ids.has(id)));
        const filePath = this.getDataFilePath();
        try {
          await IOUtils.writeUTF8(filePath, JSON.stringify(next, null, 2), { tmpPath: filePath + '.tmp' });
        } catch (error) {
          Zotero.logError?.('[Todolist] 数据保存失败: ' + error);
          throw error;
        }
        this._cachedData = next;
        if (patch.tasks) {
          this._paneDeleted = [];
          clearTimeout(this._paneUndoTimer);
        }
        this.notifyDataChanged();
        if (patch.syncLinkedItems) {
          try { await this.syncLinkedTaskChanges(current, next); }
          catch (error) { Zotero.logError?.('[Todolist] 任务已保存，文献联动更新失败: ' + error); }
        }
        const result = this.cloneData(next);
        if (prepared) result.importResult = { imported: prepared.imported };
        if (notificationResult) result.notificationResult = notificationResult;
        return result;
      };
      const result = (this._saveQueue || Promise.resolve()).then(run);
      this._saveQueue = result.catch(() => {});
      return result;
    },

    async syncLinkedTaskChanges(before, after) {
      const previous = new Map(before.tasks.map(t => [t.id, t]));
      const current = new Map(after.tasks.map(t => [t.id, t]));
      const affected = new Map();
      for (const id of new Set([...previous.keys(), ...current.keys()])) {
        const oldTask = previous.get(id), newTask = current.get(id);
        if (JSON.stringify(oldTask) === JSON.stringify(newTask)) continue;
        for (const task of [oldTask, newTask]) {
          if (!task?.zoteroItemKey) continue;
          const key = String(task.zoteroLibraryID || Zotero.Libraries.userLibraryID) + ':' + task.zoteroItemKey;
          const onlySubtasks = oldTask && newTask && JSON.stringify({ ...oldTask, subtasks: null }) ===
            JSON.stringify({ ...newTask, subtasks: null });
          affected.set(key, { task, syncNote: (affected.get(key)?.syncNote || !onlySubtasks ||
            this.getPref('childNoteAutoUpdateOnSubtask', true)) });
        }
      }
      for (const { task, syncNote } of affected.values()) {
        try {
        const libraryID = task.zoteroLibraryID || Zotero.Libraries.userLibraryID;
        const item = this.resolveItemReference(task.zoteroItemKey, libraryID);
        if (!item) continue;
        await this.tagItemOnTaskEvent(task.zoteroItemKey, 'complete_check', libraryID);
        if (syncNote && this.getPref('autoSyncChildNote', true)) {
          const note = await this.syncTasksToChildNote(item, null, { silent: true });
          if (!note) Zotero.logError?.('[Todolist] 任务已保存，但子笔记未能更新: ' + task.zoteroItemKey);
        }
        } catch (error) { Zotero.logError?.('[Todolist] 任务已保存，文献联动更新失败: ' + task.zoteroItemKey + ': ' + error); }
      }
    },

    async updateTaskState(id, change) {
      const data = await this.loadData();
      const task = data.tasks.find(t => t.id === id);
      if (!task) return null;
      const changes = typeof change === 'function' ? change(task) : change;
      await this.saveData({ taskChanges: { updated: [{ id, changes }] }, expectedTasksGeneration: data.tasksGeneration || 0 });
      return task;
    },

    registerDataListener(listener) {
      this._dataListeners.add(listener);
    },

    unregisterDataListener(listener) {
      this._dataListeners.delete(listener);
    },

    notifyDataChanged() {
      for (const client of this._uiClients || []) {
        try {
          if (client.closed) { this._uiClients.delete(client); continue; }
          client.postMessage({ type: 'TODOLIST_DATA_CHANGED', data: this.cloneData(this._cachedData) }, '*');
        } catch (_) { this._uiClients.delete(client); }
      }
      for (const listener of this._dataListeners) {
        try {
          listener(this.cloneData(this._cachedData));
        } catch (e) {
          Zotero.logError?.('[Todolist] Error in data listener: ' + e);
        }
      }
    },

    getPref(key, defaultVal) {
      try {
        if (Zotero.Prefs) {
          const val = Zotero.Prefs.get(`extensions.todolist.${key}`, true);
          return val !== undefined ? val : defaultVal;
        }
      } catch (_) {}
      return defaultVal;
    },

    showNotice(headline, description = '', timeout = 4000) {
      try {
        const progress = new Zotero.ProgressWindow({ closeOnClick: true });
        progress.changeHeadline(headline);
        if (description) progress.addDescription(description);
        progress.show();
        progress.startCloseTimer(timeout);
      } catch (e) {
        Zotero.log?.(`[Todolist] Notice: ${headline} - ${description}`);
      }
    },

    openPdfAttachment(item, page = null) {
      if (!item) return;
      const target = getLiteratureItem(item) || item;
      let pdfAtt = null;
      if (typeof target.isAttachment === 'function' && target.isAttachment() && target.isPDFAttachment && target.isPDFAttachment()) {
        pdfAtt = target;
      } else if (typeof target.getAttachments === 'function') {
        const attIds = target.getAttachments();
        for (const attId of attIds) {
          const att = Zotero.Items.get(attId);
          if (att && att.isPDFAttachment && att.isPDFAttachment()) {
            pdfAtt = att;
            break;
          }
        }
      }
      if (pdfAtt && Zotero.Reader && typeof Zotero.Reader.open === 'function') {
        const openOptions = { itemID: pdfAtt.id };
        if (page && Number.isInteger(Number(page)) && Number(page) > 0) {
          openOptions.pageIndex = Number(page) - 1;
        }
        Promise.resolve(Zotero.Reader.open(openOptions)).catch((err) => {
          Zotero.logError?.('[Todolist] PDF reader opening failed: ' + err);
        });
      }
    },

    getZoteroCollections(libraryID = null) {
      const libID = Number.isInteger(Number(libraryID)) && Number(libraryID) > 0
        ? Number(libraryID) : (Zotero.Libraries?.userLibraryID || 1);
      const collections = Zotero.Collections?.getByLibrary?.(libID) || [];
      return collections.map((col) => ({
        id: col.id,
        key: col.key,
        name: col.name,
        parentID: col.parentID,
        itemCount: typeof col.getChildItemsCount === 'function' ? col.getChildItemsCount() : 0
      }));
    },

    async syncTasksToChildNote(item, tasks = null, options = {}) {
      const target = getLiteratureItem(item);
      if (!target) return null;

      try {
        const data = await this.loadData();
        const allTasks = (tasks || data.tasks || []).filter(t => t.zoteroItemKey === target.key &&
          (t.zoteroLibraryID || Zotero.Libraries.userLibraryID) === target.libraryID);
        const meta = serializeLiteratureItem(target);

        const total = allTasks.length;
        const completed = allTasks.filter((t) => t.completed).length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        // Construct formatted HTML note
        let noteHtml = `<h1>${escapeHtml(this.getPref('childNoteTitle', '📝 [Todolist] 研读清单与进度'))}</h1>`;
        noteHtml += `<p><strong>文献：</strong>${escapeHtml(meta.title)} (${escapeHtml(meta.authors)} ${escapeHtml(meta.year)})</p>`;
        noteHtml += `<p><strong>研读进度：</strong>${completed}/${total} 已完成 (<strong>${percent}%</strong>) | 更新于：${new Date().toLocaleString()}</p>`;
        noteHtml += `<div style="background:#e2e8f0;border-radius:4px;height:10px;width:100%;margin:8px 0;overflow:hidden;"><div style="background:#059669;height:10px;width:${percent}%;"></div></div>`;

        if (total === 0) {
          noteHtml += `<p><em>暂无关联待办事项。可通过 Todolist 插件或侧边栏添加研读计划。</em></p>`;
        } else {
          noteHtml += `<ul>`;
          for (const t of allTasks) {
            const checkMark = t.completed ? '☑' : '☐';
            const statusStyle = t.completed ? 'text-decoration:line-through;color:#64748b;' : 'font-weight:600;';
            const dueInfo = t.dueDate ? ` <span style="font-size:11px;color:#d97706;">(截止: ${escapeHtml(t.dueDate)})</span>` : '';
            noteHtml += `<li>${checkMark} <span style="${statusStyle}">${escapeHtml(t.title)}</span>${dueInfo}`;
            if (this.getPref('childNoteIncludeSubtasks', true) && t.subtasks && t.subtasks.length > 0) {
              noteHtml += `<ul>`;
              for (const sub of t.subtasks) {
                noteHtml += `<li>${sub.completed ? '☑' : '☐'} ${escapeHtml(sub.title)}</li>`;
              }
              noteHtml += `</ul>`;
            }
            if (this.getPref('childNoteIncludeQuotes', true) && t.description && t.description.trim()) {
              noteHtml += `<blockquote>${escapeHtml(t.description).replace(/\n/g, '<br/>')}</blockquote>`;
            }
            noteHtml += `</li>`;
          }
          noteHtml += `</ul>`;
        }

        noteHtml += `<hr/><p style="font-size:11px;color:#94a3b8;">由 Todolist for Zotero 自动生成并同步至 Zotero 云端笔记</p>`;

        // Find existing child note
        let targetNote = null;
        if (typeof target.getNotes === 'function') {
          const noteIDs = target.getNotes();
          for (const nid of noteIDs) {
            const noteItem = Zotero.Items.get(nid);
            if (noteItem && noteItem.isNote && noteItem.isNote()) {
              const content = noteItem.getNote();
              if (content && (content.includes('[Todolist]') || content.includes('Todolist for Zotero'))) {
                targetNote = noteItem;
                break;
              }
            }
          }
        }

        if (targetNote) {
          targetNote.setNote(noteHtml);
          await targetNote.saveTx();
        } else {
          const newNote = new Zotero.Item('note');
          newNote.libraryID = target.libraryID;
          newNote.parentID = target.id;
          newNote.setNote(noteHtml);
          try {
            newNote.addTag('Todolist');
          } catch (_) {}
          await newNote.saveTx();
          targetNote = newNote;
        }

        if (!options.silent) this.showNotice('文献笔记同步成功', `已更新《${meta.title.slice(0, 20)}...》的研读进度笔记，支持多端云同步！`);
        return targetNote;
      } catch (err) {
        Zotero.logError?.('[Todolist] syncTasksToChildNote error: ' + err);
        return null;
      }
    },

    async tagItemOnTaskEvent(itemKey, eventType, libraryID = null) {
      if (!itemKey) return;
      try {
        const item = resolveItemReference(itemKey, libraryID);
        const target = getLiteratureItem(item);
        if (!target) return;

        const autoTagOnCreate = this.getPref('autoTagOnCreate', true);
        const autoTagOnComplete = this.getPref('autoTagOnComplete', true);
        const pendingTag = this.getPref('tagForPending', '待研读');
        const completedTag = this.getPref('tagForCompleted', '精读已完成');

        const data = await this.loadData();
        const tasks = (data.tasks || []).filter(t => t.zoteroItemKey === target.key &&
          (t.zoteroLibraryID || Zotero.Libraries.userLibraryID) === target.libraryID);
        const uncompleted = tasks.filter((t) => !t.completed);

        let modified = false;

        if (eventType === 'create' && autoTagOnCreate) {
          if (pendingTag && !target.hasTag(pendingTag)) {
            target.addTag(pendingTag);
            modified = true;
          }
        } else if (eventType === 'complete_check') {
          if (tasks.length > 0 && uncompleted.length === 0) {
            // All tasks completed
            if (autoTagOnComplete && completedTag) {
              if (!target.hasTag(completedTag)) {
                target.addTag(completedTag);
                modified = true;
              }
              if (pendingTag && target.hasTag(pendingTag)) {
                target.removeTag(pendingTag);
                modified = true;
              }
            }
          } else if (tasks.length === 0) {
            for (const tag of [pendingTag, completedTag]) {
              if (tag && target.hasTag(tag)) { target.removeTag(tag); modified = true; }
            }
          } else if (uncompleted.length > 0) {
            // Still has uncompleted tasks
            if (completedTag && target.hasTag(completedTag)) {
              target.removeTag(completedTag);
              modified = true;
            }
            if (autoTagOnCreate && pendingTag && !target.hasTag(pendingTag)) {
              target.addTag(pendingTag);
              modified = true;
            }
          }
        }

        if (modified) {
          await target.saveTx();
        }
      } catch (err) {
        Zotero.logError?.('[Todolist] tagItemOnTaskEvent error: ' + err);
      }
    },

    async createCollectionReadingPlan(collection, window = null) {
      if (!collection) return;
      try {
        const items = collection.getChildItems ? collection.getChildItems(false) : [];
        const regularItems = items.map((it) => getLiteratureItem(it)).filter(Boolean);
        if (regularItems.length === 0) {
          this.showNotice('未找到文献', `分类【${collection.name}】中暂无有效文献`);
          return;
        }

        const data = await this.loadData();
        const existingKeys = new Set((data.tasks || []).filter(t => t.zoteroItemKey)
          .map(t => (t.zoteroLibraryID || Zotero.Libraries.userLibraryID) + ':' + t.zoteroItemKey));
        let addedCount = 0;
        const addedTasks = [];

        for (const item of regularItems) {
          if (existingKeys.has(item.libraryID + ':' + item.key)) continue;
          const meta = serializeLiteratureItem(item);
          const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
          const mainTask = {
            id: taskId,
            title: `📖 研读：${meta.title}`,
            description: `分类专题：${collection.name}\n作者：${meta.authors} (${meta.year})\n出版物：${meta.publication}\n文献链接：${meta.zoteroUri}`,
            dueDate: null,
            dueTime: null,
            priority: 'medium',
            category: '论文研读',
            completed: false,
            createdAt: new Date().toISOString(),
            completedAt: null,
            tags: [collection.name, '专题研读', '待研读'],
            reminder: { enabled: false, before: 15, notified: false },
            order: (data.tasks || []).length,
            zoteroItemKey: meta.key,
            zoteroItemTitle: meta.title,
            zoteroAuthors: meta.authors,
            zoteroLibraryID: meta.libraryID,
            zoteroPublication: meta.publication,
            zoteroYear: meta.year,
            zoteroUri: meta.zoteroUri,
            zoteroPdfUri: meta.pdfUri,
            academicType: 'literature_reading',
            subtasks: [
              { id: 'sub_' + Date.now() + '_1', title: '1. 快速通读 Abstract 与核心贡献', completed: false },
              { id: 'sub_' + Date.now() + '_2', title: '2. 梳理方法论、算法架构与公式推导', completed: false },
              { id: 'sub_' + Date.now() + '_3', title: '3. 对比实验分析与关键指标验证', completed: false },
              { id: 'sub_' + Date.now() + '_4', title: '4. 提炼核心启发并记录文献笔记', completed: false },
            ]
          };
          data.tasks.push(mainTask);
          addedTasks.push(mainTask);
          existingKeys.add(item.libraryID + ':' + item.key);
          addedCount++;
        }

        if (addedCount > 0) {
          await this.saveData({ taskChanges: { added: addedTasks }, syncLinkedItems: true });
          this.showNotice(
            '专题研读规划已建立',
            `已为【${collection.name}】下的 ${addedCount} 篇文献批量生成研读清单！`
          );
        } else {
          this.showNotice(
            '研读规划已存在',
            `【${collection.name}】下的文献均已存在对应研读任务。`
          );
        }

        this.openTodolist({ mode: 'create_from_collection', collectionName: collection.name }, window);
      } catch (err) {
        Zotero.logError?.('[Todolist] createCollectionReadingPlan error: ' + err);
      }
    },

    async createTaskFromReader(window = null) {
      const win = window || (Zotero.getMainWindow ? Zotero.getMainWindow() : null);
      const tabs = win?.Zotero_Tabs || (typeof Zotero_Tabs !== 'undefined' ? Zotero_Tabs : null);
      if (!tabs || !tabs.selectedTab || tabs.selectedTab.type !== 'reader') {
        const selected = this.getSelectedRegularItems(win);
        if (selected.length > 0) {
          this.openTodolist({ mode: 'create_from_item', item: serializeLiteratureItem(selected[0]) }, win);
          return;
        }
        this.showNotice('提示', '请在 PDF 阅读器中或文献列表中使用此快捷键');
        return;
      }

      try {
        const reader = Zotero.Reader?.getByTabID?.(tabs.selectedTab.id);
        const itemID = reader?.itemID || tabs.selectedTab.data?.itemID;
        if (!itemID) return;

        const attachmentItem = Zotero.Items.get(itemID);
        const regularItem = getLiteratureItem(attachmentItem);
        if (!regularItem) return;

        const meta = serializeLiteratureItem(regularItem);

        // Get selected text if any
        let selectedText = '';
        try {
          if (typeof reader.getSelectedText === 'function') {
            selectedText = await reader.getSelectedText();
          }
        } catch (_) {}

        if (!selectedText && reader._iframeWindow) {
          try {
            selectedText = reader._iframeWindow.getSelection?.()?.toString() || '';
          } catch (_) {}
        }
        selectedText = String(selectedText || '').trim();

        // Get page index
        let pageIndex = 0;
        try {
          if (reader.state && typeof reader.state.pageIndex === 'number') {
            pageIndex = reader.state.pageIndex;
          } else if (reader._iframeWindow?.PDFViewerApplication?.page) {
            pageIndex = reader._iframeWindow.PDFViewerApplication.page - 1;
          }
        } catch (_) {}
        const pageNum = pageIndex + 1;

        // Construct PDF anchor deep link
        const pdfKey = attachmentItem?.key || meta.key;
        const groupID = Zotero.Libraries?.get?.(regularItem.libraryID)?.groupID;
        const pageLink = groupID
          ? `zotero://open-pdf/groups/${groupID}/items/${pdfKey}?page=${pageNum}`
          : `zotero://open-pdf/library/items/${pdfKey}?page=${pageNum}`;

        const taskTitle = selectedText
          ? (selectedText.length > 50 ? selectedText.slice(0, 50) + '...' : selectedText)
          : `文献研读思考 (P.${pageNum})`;

        let description = `来自 PDF 第 ${pageNum} 页的摘录与待办：\n`;
        if (selectedText) {
          description += `“${selectedText}”\n\n`;
        }
        description += `文献：《${meta.title}》\nPDF 锚点直达：${pageLink}`;

        const data = await this.loadData();
        const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        const newTask = {
          id: taskId,
          title: `📌 [P.${pageNum}] ${taskTitle}`,
          description,
          dueDate: null,
          dueTime: null,
          priority: 'medium',
          category: '论文研读',
          completed: false,
          createdAt: new Date().toISOString(),
          completedAt: null,
          subtasks: [],
          tags: [...(meta.tags || []), `P.${pageNum}`, 'PDF摘录'],
          reminder: { enabled: false, before: 15, notified: false },
          order: (data.tasks || []).length,
          zoteroItemKey: meta.key,
          zoteroItemTitle: meta.title,
          zoteroAuthors: meta.authors,
            zoteroLibraryID: meta.libraryID,
            zoteroPublication: meta.publication,
          zoteroYear: meta.year,
          zoteroUri: meta.zoteroUri,
          zoteroPdfUri: pageLink,
          academicType: 'literature_reading'
        };

        const shortcutAction = this.getPref('readerShortcutAction', 'create_instant');
        if (shortcutAction === 'open_modal') {
          this.openTodolist({ mode: 'open_modal_prefill', prefill: newTask }, window);
          return;
        }

        await this.saveData({ taskChanges: { added: [newTask] } });

        if (this.getPref('autoTagOnCreate', true)) {
          await this.tagItemOnTaskEvent(meta.key, 'create', regularItem.libraryID);
        }
        if (this.getPref('autoSyncChildNote', true)) {
          await this.syncTasksToChildNote(regularItem);
        }

        this.showNotice(
          '已从 PDF 提取待办',
          `已记录第 ${pageNum} 页任务，并生成一键直达锚点链接！`
        );
      } catch (err) {
        Zotero.logError?.('[Todolist] createTaskFromReader error: ' + err);
      }
    },

    async exportData(format = 'json') {
      try {
        const data = await this.loadData();
        const fp = Cc['@mozilla.org/filepicker;1'].createInstance(Ci.nsIFilePicker);
        const win = Zotero.getMainWindow?.() || Services.wm.getMostRecentWindow('navigator:browser');
        const titleMap = {
          json: '导出 Todolist JSON 备份',
          csv: '导出 Todolist CSV 表格 (Excel 兼容)',
          markdown: '导出 Todolist Markdown 清单',
          txt: '导出 Todolist 纯文本清单'
        };
        fp.init(win, titleMap[format] || '导出 Todolist 数据', Ci.nsIFilePicker.modeSave);
        const dateStr = new Date().toISOString().slice(0, 10);
        if (format === 'json') {
          fp.appendFilter('JSON Files (*.json)', '*.json');
          fp.defaultString = `todolist-backup-${dateStr}.json`;
        } else if (format === 'csv') {
          fp.appendFilter('CSV Files (*.csv)', '*.csv');
          fp.defaultString = `todolist-tasks-${dateStr}.csv`;
        } else if (format === 'markdown') {
          fp.appendFilter('Markdown Files (*.md)', '*.md');
          fp.defaultString = `todolist-tasks-${dateStr}.md`;
        } else {
          fp.appendFilter('Text Files (*.txt)', '*.txt');
          fp.defaultString = `todolist-tasks-${dateStr}.txt`;
        }

        const res = await new Promise((resolve) => fp.open(resolve));
        if (res === Ci.nsIFilePicker.returnOK || res === Ci.nsIFilePicker.returnReplace) {
          const filePath = fp.file.path;
          let content = '';
          const tasks = data.tasks || [];

          if (format === 'json') {
            content = JSON.stringify(data, null, 2);
          } else if (format === 'csv') {
            const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
            const headers = ['标题', '学术分类', '状态', '优先级', '截止日期', '时间', '关联文献', '文献年份', 'PDF链接', '描述', '创建时间', '完成时间'];
            const rows = tasks.map((t) => [
              escapeCsv(t.title),
              escapeCsv(t.academicType || t.category || 'generic'),
              escapeCsv(t.completed ? '已完成' : '待完成'),
              escapeCsv(t.priority || 'medium'),
              escapeCsv(t.dueDate || ''),
              escapeCsv(t.dueTime || ''),
              escapeCsv(t.zoteroItemTitle || ''),
              escapeCsv(t.zoteroYear || ''),
              escapeCsv(t.zoteroPdfUri || ''),
              escapeCsv(t.description || ''),
              escapeCsv(t.createdAt || ''),
              escapeCsv(t.completedAt || '')
            ].join(','));
            content = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
          } else if (format === 'markdown') {
            content = `# Todolist 学术任务清单\n导出时间：${new Date().toLocaleString()}\n总计：${tasks.length} 项 (已完成：${tasks.filter(t => t.completed).length}，待研读：${tasks.filter(t => !t.completed).length})\n\n---\n\n`;
            for (const t of tasks) {
              content += `- [${t.completed ? 'x' : ' '}] **${t.title}**${t.dueDate ? ` (截止: ${t.dueDate})` : ''}\n`;
              if (t.academicType) content += `  - 学术类型: ${t.academicType}\n`;
              if (t.zoteroItemTitle) content += `  - 关联文献: 《${t.zoteroItemTitle}》${t.zoteroYear ? ` (${t.zoteroYear})` : ''}\n`;
              if (t.zoteroPdfUri) content += `  - PDF 伴读链接: [打开 PDF](${t.zoteroPdfUri})\n`;
              if (t.description) content += `  - 描述: ${t.description.replace(/\n/g, ' ')}\n`;
              if (t.subtasks && t.subtasks.length > 0) {
                for (const sub of t.subtasks) {
                  content += `    - [${sub.completed ? 'x' : ' '}] ${sub.title}\n`;
                }
              }
            }
          } else {
            content = `Todolist 学术任务清单\n导出时间：${new Date().toLocaleString()}\n====================================\n\n`;
            const incomplete = tasks.filter(t => !t.completed);
            const completed = tasks.filter(t => t.completed);
            if (incomplete.length > 0) {
              content += `【待完成研读与任务】(${incomplete.length})\n`;
              incomplete.forEach((t, i) => {
                content += `${i + 1}. ${t.title}${t.dueDate ? ` [${t.dueDate}]` : ''}\n`;
                if (t.zoteroItemTitle) content += `   文献: 《${t.zoteroItemTitle}》\n`;
              });
              content += '\n';
            }
            if (completed.length > 0) {
              content += `【已完成任务】(${completed.length})\n`;
              completed.forEach((t, i) => {
                content += `${i + 1}. ✓ ${t.title}\n`;
              });
            }
          }

          await IOUtils.writeUTF8(filePath, content);
          this.showNotice('导出成功', `已成功导出至：${filePath}`);
          return filePath;
        }
      } catch (err) {
        Zotero.logError?.('[Todolist] exportData error: ' + err);
        this.showNotice('导出失败', String(err.message || err));
      }
      return null;
    },

    async importDataFile(mode = 'merge', window = null) {
      try {
        const fp = Cc['@mozilla.org/filepicker;1'].createInstance(Ci.nsIFilePicker);
        const win = window || Zotero.getMainWindow?.() || Services.wm.getMostRecentWindow('navigator:browser');
        fp.init(win, '选择 Todolist JSON 备份文件导入', Ci.nsIFilePicker.modeOpen);
        fp.appendFilter('JSON Files (*.json)', '*.json');

        const res = await new Promise((resolve) => fp.open(resolve));
        if (res === Ci.nsIFilePicker.returnOK) {
          const filePath = fp.file.path;
          const rawText = await IOUtils.readUTF8(filePath);
          let importedJson;
          try {
            importedJson = JSON.parse(rawText);
          } catch (pe) {
            throw new Error('所选文件不是合法的 JSON 格式数据');
          }

          const saved = await this.saveData({ importRequest: { payload: importedJson, mode }, syncLinkedItems: true });
          const imported = saved.importResult.imported;
          if (mode === 'replace') {
            this._paneDeleted = [];
            clearTimeout(this._paneUndoTimer);
          }

          this.showNotice('导入成功', `已成功导入 ${imported} 个任务与标签数据！`);
          return { success: true, count: imported };
        }
      } catch (err) {
        Zotero.logError?.('[Todolist] importDataFile error: ' + err);
        this.showNotice('导入失败', String(err.message || err));
        return { success: false, error: err.message };
      }
      return { success: false, cancelled: true };
    },

    async clearAllData(window = null) {
      try {
        await this.saveData({ tasks: [], history: [], customTags: [], customTemplates: [],
          searchHistory: [], activeTimers: {}, syncLinkedItems: true });
        this._paneDeleted = [];
        clearTimeout(this._paneUndoTimer);
        this.showNotice('数据已清空', '所有任务、历史记录与自定义标签已安全清空。');
        return true;
      } catch (err) {
        Zotero.logError?.('[Todolist] clearAllData error: ' + err);
        return false;
      }
    },

    async getTasksSummaryText() {
      const data = await this.loadData();
      const tasks = data.tasks || [];
      const total = tasks.length;
      const completed = tasks.filter(t => t.completed).length;
      const pending = total - completed;
      const litTasks = tasks.filter(t => t.zoteroItemKey);

      let summary = `# 📋 Todolist 学术任务研读概览\n`;
      summary += `生成时间：${new Date().toLocaleString()}\n`;
      summary += `任务总数：${total} 项 | 已完成：${completed} 项 | 进行中：${pending} 项 | 文献关联：${litTasks.length} 篇\n`;
      summary += `总体完成率：${total > 0 ? Math.round((completed / total) * 100) : 0}%\n\n`;

      if (pending > 0) {
        summary += `### ⏳ 进行中研读待办\n`;
        tasks.filter(t => !t.completed).forEach((t, i) => {
          summary += `${i + 1}. **${t.title}**`;
          if (t.zoteroItemTitle) summary += ` (文献: 《${t.zoteroItemTitle}》)`;
          if (t.dueDate) summary += ` [截止: ${t.dueDate}]`;
          summary += `\n`;
        });
        summary += `\n`;
      }

      if (completed > 0) {
        summary += `### ✅ 已完成研读精读\n`;
        tasks.filter(t => t.completed).slice(-10).forEach((t, i) => {
          summary += `${i + 1}. ✓ ~~${t.title}~~`;
          if (t.zoteroItemTitle) summary += ` (《${t.zoteroItemTitle}》)`;
          summary += `\n`;
        });
      }

      return summary;
    },

    async copyTasksSummary(window = null) {
      try {
        const text = await this.getTasksSummaryText();
        const clipboard = Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper);
        clipboard.copyString(text);
        this.showNotice('已复制概览', '学术任务概览已复制到系统剪贴板，可直接粘贴至周报或笔记。');
        return true;
      } catch (err) {
        Zotero.logError?.('[Todolist] copyTasksSummary error: ' + err);
        return false;
      }
    },

    async printTasks(window = null) {
      try {
        const data = await this.loadData();
        const tasks = data.tasks || [];
        const win = window || Zotero.getMainWindow?.() || Services.wm.getMostRecentWindow('navigator:browser');

        let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Todolist 学术任务清单</title><style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; line-height: 1.5; }
          h1 { font-size: 20px; border-bottom: 2px solid #059669; padding-bottom: 8px; margin-bottom: 4px; color: #065f46; }
          .meta { font-size: 12px; color: #64748b; margin-bottom: 20px; }
          .task-row { display: flex; align-items: baseline; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
          .box { width: 14px; height: 14px; border: 1.5px solid #94a3b8; border-radius: 3px; display: inline-block; }
          .done .box { background: #059669; border-color: #059669; }
          .done .title { text-decoration: line-through; color: #94a3b8; }
          .title { font-weight: 600; font-size: 14px; }
          .lit { font-size: 12px; color: #2563eb; background: #eff6ff; padding: 1px 6px; border-radius: 4px; }
          .date { font-size: 11px; color: #d97706; margin-left: auto; }
          @media print { body { padding: 0; } }
        </style></head><body>`;

        html += `<h1>Todolist 学术日程与研读清单</h1>`;
        html += `<div class="meta">打印时间：${new Date().toLocaleString()} | 共 ${tasks.length} 项 (已完成：${tasks.filter(t => t.completed).length})</div>`;

        tasks.forEach((t) => {
          html += `<div class="task-row ${t.completed ? 'done' : ''}">
            <span class="box"></span>
            <span class="title">${escapeHtml(t.title || '')}</span>
            ${t.zoteroItemTitle ? `<span class="lit">📖 ${escapeHtml(t.zoteroItemTitle)}</span>` : ''}
            ${t.dueDate ? `<span class="date">📅 ${escapeHtml(t.dueDate)}</span>` : ''}
          </div>`;
        });

        html += `</body></html>`;

        const printWin = win.open('', '_blank', 'width=800,height=700');
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
          printWin.print();
        }, 300);
      } catch (err) {
        Zotero.logError?.('[Todolist] printTasks error: ' + err);
      }
    },

    switchWindowMode(mode, window = null) {
      try {
        if (Zotero.Prefs) {
          Zotero.Prefs.set('extensions.todolist.windowMode', mode, true);
        }
      } catch (_) {}

      const mainWin = (window && window.Zotero_Tabs)
        ? window
        : (Zotero.getMainWindow ? Zotero.getMainWindow() : Services.wm.getMostRecentWindow('navigator:browser'));

      if (mode === 'subwindow' || mode === 'window') {
        // Close internal Todolist tab if open in main window to make mode switch clean
        if (mainWin?.Zotero_Tabs?._tabs) {
          try {
            const existingTab = mainWin.Zotero_Tabs._tabs.find((t) => t && t.type === 'todolist');
            if (existingTab) {
              mainWin.Zotero_Tabs.close(existingTab.id);
            }
          } catch (_) {}
        }
        this.openStandaloneWindow({}, mainWin, mode);
      } else if (mode === 'tab') {
        // Close standalone windows if open
        try {
          const windows = Services.wm.getEnumerator(null);
          while (windows.hasMoreElements()) {
            const w = windows.getNext();
            if (w && (w.name === 'Todolist_SubWindow' || w.name === 'Todolist_Window')) {
              try { w.close(); } catch (_) {}
            }
          }
        } catch (_) {}
        this.openTodolist({ targetMode: 'tab' }, mainWin);
      }
    },

    registerMenus() {
      if (Zotero.MenuManager && typeof Zotero.MenuManager.registerMenu === 'function') {
        try {
          this._menuManagerId = Zotero.MenuManager.registerMenu({
            menuID: 'todolist-itemmenu-create',
            pluginID: ADDON_ID,
            target: 'main/library/item',
            menus: [
              {
                menuType: 'menuitem',
                label: '添加为待办',
                onCommand: () => {
                  try {
                    this.createTaskFromSelection();
                  } catch (err) {
                    Zotero.logError?.('[Todolist] Failed to create task: ' + err);
                  }
                },
              },
            ],
          });
        } catch (err) {
          Zotero.logError?.('[Todolist] MenuManager.registerMenu failed: ' + err);
        }
      }
    },

    init() {
      this.initWindowListener();

      // Register modern MenuManager if available (Zotero 8+)
      this.registerMenus();

      // Purge any rogue buttons from existing non-main windows (e.g. 插件市场, 偏好设置, 对话框)
      try {
        if (typeof Services !== 'undefined' && Services.wm?.getEnumerator) {
          const allWindows = Services.wm.getEnumerator(null);
          while (allWindows.hasMoreElements()) {
            const win = allWindows.getNext();
            if (win && win.document && !this.isMainWindow(win)) {
              try {
                win.document.getElementById('todolist-toolbar-button')?.remove();
              } catch (_) {}
            }
          }
        }
      } catch (_) {}

      const windows = Services.wm.getEnumerator('navigator:browser');
      while (windows.hasMoreElements()) {
        const win = windows.getNext();
        this.addToWindow(win);
      }

      // Register Zotero Preference Pane
      if (Zotero.PreferencePanes && typeof Zotero.PreferencePanes.register === 'function') {
        try {
          const prefSrc = this.rootURI
            ? `${this.rootURI}chrome/content/preferences.xhtml`
            : `${CHROME_ROOT}preferences.xhtml`;
          const prefScript = this.rootURI
            ? `${this.rootURI}chrome/content/scripts/preferences.js`
            : `${CHROME_ROOT}scripts/preferences.js`;
          const prefCss = this.rootURI
            ? `${this.rootURI}chrome/content/assets/preferences.css`
            : `${CHROME_ROOT}assets/preferences.css`;
          const prefIcon = this.rootURI
            ? `${this.rootURI}chrome/content/icons/todolist.svg`
            : `${CHROME_ROOT}icons/todolist.svg`;

          Zotero.PreferencePanes.register({
            pluginID: ADDON_ID,
            src: prefSrc,
            label: 'Todolist',
            image: prefIcon,
            scripts: [prefScript],
            stylesheets: [prefCss],
          });
        } catch (prefErr) {
          Zotero.log?.('[Todolist] PreferencePanes registration note: ' + prefErr);
        }
      }

      // Register ItemPane Section (Literature details inspector panel)
      this.registerItemPaneSection();

      Zotero.log('[Todolist] Initialized successfully in Zotero');
    },

    registerItemPaneSection() {
      if (typeof Zotero.ItemPaneManager?.registerSection !== 'function') return;
      try {
        const sectionStates = new WeakMap();
        const icon = `${CHROME_ROOT}icons/todolist.svg`;

        this.itemPaneSectionID = Zotero.ItemPaneManager.registerSection({
          paneID: 'todolist-item-pane',
          pluginID: ADDON_ID,
          header: { l10nID: 'todolist-item-pane-header', icon },
          sidenav: { l10nID: 'todolist-item-pane-sidenav', icon },
          onInit: ({ doc, body, item, refresh }) => {
            const document = doc || body?.ownerDocument;
            if (document) {
              this.ensureLocalization(document);
              this.ensureItemPaneStyles(document);
            }
            const target = getLiteratureItem(item);
            const state = {
              itemKey: target?.key || null,
              refresh,
              onDataChanged: () => {
                Promise.resolve(refresh?.()).catch((err) => {
                  Zotero.logError?.('[Todolist] ItemPane refresh failed: ' + err);
                });
              }
            };
            this.registerDataListener(state.onDataChanged);
            sectionStates.set(body, state);
          },
          onDestroy: ({ body }) => {
            const state = sectionStates.get(body);
            if (state?.onDataChanged) {
              this.unregisterDataListener(state.onDataChanged);
            }
            sectionStates.delete(body);
          },
          onItemChange: ({ body, item, setEnabled }) => {
            const target = getLiteratureItem(item);
            const state = sectionStates.get(body);
            if (state) state.itemKey = target?.key || null;
            setEnabled(Boolean(target));
          },
          onRender: async ({ doc, body, item, setSectionSummary }) => {
            if (!body) return;
            const document = doc || body.ownerDocument;
            if (document) {
              this.ensureItemPaneStyles(document);
            }
            body.replaceChildren();
            const target = getLiteratureItem(item);
            if (!target) return;

            const state = sectionStates.get(body);
            const html = 'http://www.w3.org/1999/xhtml';
            const createEl = (tag, className = '', text = null) => {
              const el = document.createElementNS
                ? document.createElementNS(html, tag)
                : document.createElement(tag);
              if (className) el.className = className;
              if (text !== null && text !== undefined) {
                el.textContent = text;
              }
              return el;
            };

            const data = await this.loadData();
            const targetKey = target.key;
            const tasks = (data.tasks || []).filter(t => t.zoteroItemKey === targetKey &&
              (t.zoteroLibraryID || Zotero.Libraries.userLibraryID) === target.libraryID);
            const uncompletedTasks = tasks.filter((t) => !t.completed);
            const total = tasks.length;
            const done = total - uncompletedTasks.length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            setSectionSummary?.(total ? `${done}/${total} (${pct}%)` : '');

            const wrapper = createEl('div', 'td-pane-wrap');

            // 1. Header & Progress Card
            const headerCard = createEl('div', 'td-header-card');
            const headerTop = createEl('div', 'td-header-top');

            let statusText = '暂无待办';
            let badgeClass = 'td-status-badge td-status-empty';
            if (total > 0) {
              if (done === total) {
                statusText = `🎉 精读已完成 (${done}/${total})`;
                badgeClass = 'td-status-badge td-status-done';
              } else {
                statusText = `⏳ 研读进行中 (${done}/${total})`;
                badgeClass = 'td-status-badge td-status-active';
              }
            }
            const statusBadge = createEl('span', badgeClass, statusText);
            headerTop.appendChild(statusBadge);

            if (total > 0) {
              const pctSpan = createEl('span', 'td-progress-pct', `${pct}%`);
              headerTop.appendChild(pctSpan);
            }
            headerCard.appendChild(headerTop);

            const showProgressBar = this.getPref('itemPaneShowProgressBar', true);
            if (total > 0 && showProgressBar) {
              const track = createEl('div', 'td-progress-track');
              const fill = createEl('div', 'td-progress-fill');
              fill.style.width = `${pct}%`;
              track.appendChild(fill);
              headerCard.appendChild(track);
            }
            wrapper.appendChild(headerCard);

            // 2. Empty State Card
            if (total === 0) {
              const emptyCard = createEl('div', 'td-empty-card');

              const emptyTitle = createEl('div', 'td-empty-title', '📚 暂未建立学术研读清单');
              const emptyDesc = createEl('div', 'td-empty-desc', '可一键为本文献自动规划 5 步精读里程碑，或在下方快速添加待办');

              const btnCreateMilestones = createEl('button', 'td-btn-milestone-primary', '⚡ 一键生成 5 步精读清单');
              btnCreateMilestones.type = 'button';
              btnCreateMilestones.title = '为本文献快速拆解：通读、算法、实验、复现与批判性总结';
              btnCreateMilestones.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.createReadingMilestones(target, Zotero.getMainWindow?.());
                state?.refresh?.();
              });

              emptyCard.appendChild(emptyTitle);
              emptyCard.appendChild(emptyDesc);
              emptyCard.appendChild(btnCreateMilestones);
              wrapper.appendChild(emptyCard);
            }

            // 3. Task List Inside Pane
            if (total > 0) {
              const taskList = createEl('div', 'td-task-list');
              const showSubtasks = this.getPref('itemPaneShowSubtasks', true);

              for (const t of tasks) {
                const taskCard = createEl('div', `td-task-card ${t.completed ? 'is-completed' : ''}`);

                const row = createEl('div', 'td-task-row');

                // Priority dot
                const prio = t.priority || 'medium';
                const prioDot = createEl('span', `td-prio-dot td-prio-${prio}`);
                const prioLabel = prio === 'high' ? '高' : (prio === 'low' ? '低' : '中');
                prioDot.title = `优先级: ${prioLabel}`;
                row.appendChild(prioDot);

                // Checkbox
                const checkbox = createEl('input', 'td-checkbox');
                checkbox.type = 'checkbox';
                checkbox.checked = Boolean(t.completed);
                checkbox.title = t.completed ? '标记为未完成' : '标记为已完成';
                checkbox.addEventListener('change', async (e) => {
                  e.stopPropagation();
                  try {
                    await this.updateTaskState(t.id, current => ({ completed: checkbox.checked,
                      completedAt: checkbox.checked ? new Date().toISOString() : null,
                      status: checkbox.checked ? 'done' : 'todo',
                      subtasks: (current.subtasks || []).map(sub => ({ ...sub, completed: checkbox.checked ? true : sub.completed })) }));
                  } catch (error) { checkbox.checked = t.completed; this.showNotice('保存失败', String(error)); return; }
                  await this.tagItemOnTaskEvent(target.key, 'complete_check', target.libraryID);
                  if (this.getPref('autoSyncChildNote', true)) {
                    await this.syncTasksToChildNote(target);
                  }
                  state?.refresh?.();
                });
                row.appendChild(checkbox);

                // Title
                const titleSpan = createEl('span', `td-task-title ${t.completed ? 'is-done' : ''}`, t.title);
                titleSpan.title = `${t.title} (点击在看板中查看详情)`;
                titleSpan.addEventListener('click', () => {
                  this.openTodolist({ mode: 'view_task', taskId: t.id }, Zotero.getMainWindow?.());
                });
                row.appendChild(titleSpan);

                // Due date badge
                if (t.dueDate) {
                  const todayStr = this.localDateString(new Date());
                  const isOverdue = !t.completed && t.dueDate < todayStr;
                  const dateText = (isOverdue ? '⚠️ ' : '📅 ') + (t.dueDate.length > 5 ? t.dueDate.slice(5) : t.dueDate);
                  const dueBadge = createEl('span', `td-badge-date ${isOverdue ? 'is-overdue' : ''}`, dateText);
                  dueBadge.title = isOverdue ? `已逾期！截止日期: ${t.dueDate}` : `截止日期: ${t.dueDate}`;
                  row.appendChild(dueBadge);
                }

                // Subtask toggle button if subtasks exist
                let subList = null;
                if (Array.isArray(t.subtasks) && t.subtasks.length > 0) {
                  const doneSubs = t.subtasks.filter((s) => s.completed).length;
                  const subToggle = createEl('button', 'td-subtask-toggle', `☑️ ${doneSubs}/${t.subtasks.length}`);
                  subToggle.type = 'button';
                  subToggle.title = '展开/收起子任务清单';
                  row.appendChild(subToggle);

                  subList = createEl('div', 'td-subtask-list');
                  if (!showSubtasks) subList.style.display = 'none';

                  subToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isHidden = subList.style.display === 'none';
                    subList.style.display = isHidden ? 'flex' : 'none';
                  });

                  for (const sub of t.subtasks) {
                    const subRow = createEl('div', 'td-subtask-item');

                    const subCheck = createEl('input', 'td-checkbox');
                    subCheck.type = 'checkbox';
                    subCheck.checked = Boolean(sub.completed);
                    subCheck.style.transform = 'scale(0.85)';
                    subCheck.addEventListener('change', async (e) => {
                      e.stopPropagation();
                      try {
                        await this.updateTaskState(t.id, current => {
                          const subtasks = (current.subtasks || []).map(st => st.id === sub.id ? { ...st, completed: subCheck.checked } : st);
                          const completed = subtasks.every(st => st.completed);
                          return { subtasks, completed, completedAt: completed ? (current.completedAt || new Date().toISOString()) : null,
                            status: completed ? 'done' : 'todo' };
                        });
                      } catch (error) { subCheck.checked = sub.completed; this.showNotice('保存失败', String(error)); return; }
                      await this.tagItemOnTaskEvent(target.key, 'complete_check', target.libraryID);
                      if (this.getPref('autoSyncChildNote', true) && this.getPref('childNoteAutoUpdateOnSubtask', true)) {
                        await this.syncTasksToChildNote(target);
                      }
                      state?.refresh?.();
                    });

                    const subSpan = createEl('span', `td-subtask-title ${sub.completed ? 'is-done' : ''}`, sub.title);
                    subRow.appendChild(subCheck);
                    subRow.appendChild(subSpan);
                    subList.appendChild(subRow);
                  }
                }

                // Delete task button
                const delBtn = createEl('button', 'td-task-delete', '删除');
                delBtn.type = 'button';
                delBtn.title = '删除此待办';
                delBtn.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  if (delBtn.disabled) return;
                  delBtn.disabled = true;
                  try {
                    await this.saveData({ taskChanges: { deleted: [t.id] } });
                    this._paneDeleted ||= [];
                    this._paneDeleted.push(this.cloneData(t));
                    clearTimeout(this._paneUndoTimer);
                    this._paneUndoTimer = setTimeout(() => { this._paneDeleted = []; this.notifyDataChanged(); }, 8000);
                  } catch (error) {
                    delBtn.disabled = false;
                    this.showNotice('删除失败', String(error));
                    return;
                  }
                  await this.tagItemOnTaskEvent(target.key, 'complete_check', target.libraryID);
                  if (this.getPref('autoSyncChildNote', true)) {
                    await this.syncTasksToChildNote(target);
                  }
                  state?.refresh?.();
                });
                row.appendChild(delBtn);

                taskCard.appendChild(row);
                if (subList) taskCard.appendChild(subList);
                taskList.appendChild(taskCard);
              }
              wrapper.appendChild(taskList);
            }

            if (this._paneDeleted?.length) {
              const undoBtn = createEl('button', 'td-subtask-toggle', '撤销删除（8 秒内）');
              undoBtn.type = 'button';
              undoBtn.addEventListener('click', async () => {
                if (undoBtn.disabled) return;
                undoBtn.disabled = true;
                try {
                  const restored = this._paneDeleted;
                  await this.saveData({ taskChanges: { added: restored } });
                  this._paneDeleted = [];
                  clearTimeout(this._paneUndoTimer);
                  for (const task of restored) await this.tagItemOnTaskEvent(task.zoteroItemKey, 'complete_check', task.zoteroLibraryID);
                  if (this.getPref('autoSyncChildNote', true)) await this.syncTasksToChildNote(target);
                  state?.refresh?.();
                } catch (error) { undoBtn.disabled = false; this.showNotice('恢复失败', String(error)); }
              });
              wrapper.appendChild(undoBtn);
            }

            // 4. Compound Quick Add Row
            const quickBox = createEl('div', 'td-quick-box');

            const prioSelect = createEl('select', 'td-prio-select');
            const defaultPrio = this.getPref('defaultPriority', 'medium');
            const priorities = [
              { val: 'medium', label: '🟡 中' },
              { val: 'high', label: '🔴 高' },
              { val: 'low', label: '🟢 低' }
            ];
            for (const p of priorities) {
              const opt = createEl('option', '', p.label);
              opt.value = p.val;
              if (p.val === defaultPrio) opt.selected = true;
              prioSelect.appendChild(opt);
            }

            const quickInput = createEl('input', 'td-quick-input');
            quickInput.type = 'text';
            quickInput.placeholder = '+ 添加研读待办 (Enter 保存)...';

            const quickBtn = createEl('button', 'td-quick-submit', '+');
            quickBtn.type = 'button';
            quickBtn.title = '添加待办任务';

            const handleQuickAdd = async () => {
              const text = quickInput.value.trim();
              if (!text) return;
              const meta = serializeLiteratureItem(target);
              const selectedPrio = prioSelect.value || defaultPrio;
              const defaultType = this.getPref('defaultTaskType', 'literature_reading');
              const inheritTags = this.getPref('autoTagFromItem', true);
              const newTask = {
                id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                title: text,
                description: `文献研读待办：${meta.title} (${meta.authors} ${meta.year})`,
                dueDate: null,
                dueTime: null,
                priority: selectedPrio,
                category: '论文研读',
                completed: false,
                createdAt: new Date().toISOString(),
                completedAt: null,
                subtasks: [],
                tags: inheritTags ? (meta.tags || []) : [],
                reminder: { enabled: false, before: 15, notified: false },
                order: (data.tasks || []).length,
                zoteroItemKey: meta.key,
                zoteroItemTitle: meta.title,
                zoteroAuthors: meta.authors,
            zoteroLibraryID: meta.libraryID,
            zoteroPublication: meta.publication,
                zoteroYear: meta.year,
                zoteroUri: meta.zoteroUri,
                zoteroPdfUri: meta.pdfUri,
                academicType: defaultType
              };
              if (quickBtn.disabled) return;
              quickBtn.disabled = true;
              try { await this.saveData({ taskChanges: { added: [newTask] } }); }
              catch (error) { this.showNotice('保存失败', String(error)); return; }
              finally { quickBtn.disabled = false; }
              quickInput.value = '';
              await this.tagItemOnTaskEvent(target.key, 'create', target.libraryID);
              if (this.getPref('autoSyncChildNote', true)) {
                await this.syncTasksToChildNote(target);
              }
              state?.refresh?.();
            };

            quickInput.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleQuickAdd();
              }
            });
            quickBtn.addEventListener('click', (e) => {
              e.preventDefault();
              handleQuickAdd();
            });

            quickBox.appendChild(prioSelect);
            quickBox.appendChild(quickInput);
            quickBox.appendChild(quickBtn);
            wrapper.appendChild(quickBox);

            // 5. Action Buttons Grid (2 Columns, perfectly aligned, no overflow)
            const actionGrid = createEl('div', 'td-action-grid');

            const btnOpenBoard = createEl('button', 'td-action-btn', '📋 待办看板');
            btnOpenBoard.type = 'button';
            btnOpenBoard.title = '在主标签页中打开 Todolist 学术看板';
            btnOpenBoard.addEventListener('click', () => {
              this.openTodolist({ mode: 'filter_item', itemKey: target.key }, Zotero.getMainWindow?.());
            });
            actionGrid.appendChild(btnOpenBoard);

            const btnSubwin = createEl('button', 'td-action-btn', '🗗 伴读子窗口');
            btnSubwin.type = 'button';
            btnSubwin.title = '打开轻量伴读窗口，适合与 PDF 左右分屏对照';
            btnSubwin.addEventListener('click', () => {
              this.openStandaloneWindow({ mode: 'filter_item', itemKey: target.key }, Zotero.getMainWindow?.(), 'subwindow');
            });
            actionGrid.appendChild(btnSubwin);

            const btnMilestones = createEl('button', 'td-action-btn', '⚡ 精读清单');
            btnMilestones.type = 'button';
            btnMilestones.title = '一键为本篇文献生成 5 项精读里程碑待办';
            btnMilestones.addEventListener('click', async () => {
              await this.createReadingMilestones(target, Zotero.getMainWindow?.());
              state?.refresh?.();
            });
            actionGrid.appendChild(btnMilestones);

            const btnSyncNote = createEl('button', 'td-action-btn', '📝 同步子笔记');
            btnSyncNote.type = 'button';
            btnSyncNote.title = '将本文献的所有研读待办同步导出为文献子笔记 (云端)';
            btnSyncNote.addEventListener('click', async () => {
              await this.syncTasksToChildNote(target);
              this.showNotice('同步成功', '已更新文献子笔记研读清单');
            });
            actionGrid.appendChild(btnSyncNote);

            const meta = serializeLiteratureItem(target);
            if (meta?.pdfUri) {
              const btnPdf = createEl('button', 'td-action-btn td-action-btn-pdf', '📖 打开伴读 PDF');
              btnPdf.type = 'button';
              btnPdf.title = '在 Zotero 内置阅读器中打开该文献的 PDF 全文';
              btnPdf.addEventListener('click', () => {
                this.openPdfAttachment(target);
              });
              actionGrid.appendChild(btnPdf);
            }

            wrapper.appendChild(actionGrid);
            body.appendChild(wrapper);
          },
        });
      } catch (error) {
        Zotero.logError?.('[Todolist] Could not register ItemPane section: ' + error);
      }
    },

    initWindowListener() {
      windowListener = {
        onOpenWindow: (xulWindow) => {
          let domWindow;
          try {
            domWindow = xulWindow
              .QueryInterface(Ci.nsIInterfaceRequestor)
              .getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
          } catch (_) {
            return;
          }
          const onLoad = () => {
            domWindow.removeEventListener('load', onLoad, false);
            pendingWindowLoads.delete(domWindow);
            if (!domWindow.closed) Zotero.Todolist?.addToWindow(domWindow);
          };
          pendingWindowLoads.set(domWindow, onLoad);
          domWindow.addEventListener('load', onLoad, { once: true });
          if (domWindow.document?.readyState === 'complete') onLoad();
        },
        onCloseWindow: (xulWindow) => {
          try {
            const domWindow = xulWindow
              .QueryInterface(Ci.nsIInterfaceRequestor)
              .getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
            const onLoad = pendingWindowLoads.get(domWindow);
            if (onLoad) domWindow.removeEventListener('load', onLoad, false);
            pendingWindowLoads.delete(domWindow);
            Zotero.Todolist?.removeFromWindow(domWindow);
          } catch (_) {}
        },
        onWindowTitleChange: () => {},
      };
      Services.wm.addListener(windowListener);
    },

    createXULElement(doc, tagName) {
      if (typeof doc.createXULElement === 'function') {
        return doc.createXULElement(tagName);
      }
      const xulNs = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
      if (typeof doc.createElementNS === 'function') {
        return doc.createElementNS(xulNs, tagName);
      }
      return doc.createElement(tagName);
    },

    isMainWindow(win) {
      if (!win || !win.document) return false;
      if (win.ZoteroPane) return true;
      const doc = win.document;
      if (doc.getElementById('zotero-pane') || doc.getElementById('zotero-items-tree') || doc.getElementById('zotero-items-toolbar')) {
        return true;
      }
      const href = String(win.location?.href || '');
      return href.includes('zoteroPane') || href.includes('standalone/standalone');
    },

    isReaderWindow(win) {
      if (!win || !win.document) return false;
      const doc = win.document;
      if (doc.getElementById('reader-toolbar') || doc.querySelector?.('.reader')) return true;
      const href = String(win.location?.href || '');
      return href.includes('reader');
    },

    addToWindow(window) {
      if (!window || !window.document) return;
      const doc = window.document;

      const isMain = this.isMainWindow(window);
      const isReader = !isMain && this.isReaderWindow(window);

      // If this window is neither the main Zotero library window nor a reader window
      // (e.g. 插件市场, 偏好设置, 独立对话框等), immediately clean up any mistakenly
      // injected Todolist toolbar buttons, menu items or styles and do NOT inject into it!
      if (!isMain && !isReader) {
        try {
          doc.getElementById('todolist-toolbar-button')?.remove();
          doc.getElementById('todolist-tools-menu')?.remove();
          doc.getElementById('todolist-tools-preferences')?.remove();
          doc.getElementById('todolist-tab-style')?.remove();
        } catch (_) {}
        return;
      }

      // Standalone reader windows should never have the library toolbar button
      if (!isMain) {
        try {
          doc.getElementById('todolist-toolbar-button')?.remove();
        } catch (_) {}
      }

      // Always clean up any stale or previous context menu items first (guarantees "仅保留添加为待办")
      const staleMenuIds = [
        'todolist-itemmenu-separator',
        'todolist-itemmenu-create',
        'todolist-collectionmenu-create',
        'todolist-collectionmenu-plan',
        'todolist-reader-context-create',
      ];
      for (const id of staleMenuIds) {
        try {
          doc.getElementById(id)?.remove();
        } catch (_) {}
      }

      if (doc.getElementById('todolist-tools-menu')) return;

      const windowElements = [];
      this.ensureLocalization(doc);

      // 1. Add to "Tools" (工具) Menu
      const toolsPopup = doc.getElementById('menu_ToolsPopup');
      if (toolsPopup) {
        const toolsItem = this.createXULElement(doc, 'menuitem');
        toolsItem.id = 'todolist-tools-menu';
        toolsItem.setAttribute('label', 'Todolist 学术待办看板');
        toolsItem.setAttribute('image', `${CHROME_ROOT}icons/todolist.svg`);
        toolsItem.setAttribute('class', 'menuitem-iconic');
        toolsItem.addEventListener('command', () => {
          this.triggerTodolistOpen(window);
        });
        toolsPopup.appendChild(toolsItem);
        windowElements.push(toolsItem);

        const prefItem = this.createXULElement(doc, 'menuitem');
        prefItem.id = 'todolist-tools-preferences';
        prefItem.setAttribute('label', 'Todolist 偏好设置...');
        prefItem.setAttribute('image', `${CHROME_ROOT}icons/todolist.svg`);
        prefItem.setAttribute('class', 'menuitem-iconic');
        prefItem.addEventListener('command', () => {
          this.openPreferencesPane(window);
        });
        toolsPopup.appendChild(prefItem);
        windowElements.push(prefItem);
      }

      // 2. Add to Item Context Menu (文献右键菜单 - 仅保留“添加为待办”)
      // If MenuManager already registered natively (Zotero 8+), do not manually inject into #zotero-itemmenu
      if (!this._menuManagerId) {
        const itemMenu = doc.getElementById('zotero-itemmenu');
        if (itemMenu) {
          const separator = this.createXULElement(doc, 'menuseparator');
          separator.id = 'todolist-itemmenu-separator';
          itemMenu.appendChild(separator);
          windowElements.push(separator);

          const createFromItem = this.createXULElement(doc, 'menuitem');
          createFromItem.id = 'todolist-itemmenu-create';
          createFromItem.setAttribute('label', '添加为待办');

          // ONLY use 'command' event! Never attach 'click' or 'mousedown', which conflicts with Gecko popup manager!
          createFromItem.addEventListener('command', (e) => {
            try {
              this.createTaskFromSelection(window, doc, itemMenu);
            } catch (err) {
              Zotero.logError?.('[Todolist] Failed to create task from item context menu: ' + err);
            }
          });

          itemMenu.appendChild(createFromItem);
          windowElements.push(createFromItem);
        }
      }

      // 3. Inject Tab Icon Style
      try {
        if (!doc.getElementById('todolist-tab-style')) {
          const style = doc.createElement('style');
          style.id = 'todolist-tab-style';
          style.textContent = `
            tab[type="todolist"] .tab-icon,
            .tab[type="todolist"] .tab-icon {
              list-style-image: url("${CHROME_ROOT}icons/todolist.svg") !important;
              width: 16px !important;
              height: 16px !important;
            }
          `;
          (doc.head || doc.documentElement).appendChild(style);
          windowElements.push(style);
        }
      } catch (_) {}

      // 5. Global Keyboard Shortcuts:
      // Ctrl+Alt+T / Cmd+Alt+T: Open Todolist Workspace
      // Ctrl+Shift+T / Cmd+Shift+T: Convert Reader Selection / Page to Task
      const handleGlobalKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 't' || e.key === 'T')) {
          e.preventDefault?.();
          e.stopPropagation?.();
          this.triggerTodolistOpen(window);
        } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 't' || e.key === 'T')) {
          e.preventDefault?.();
          e.stopPropagation?.();
          this.createTaskFromReader(window);
        }
      };
      window.addEventListener('keydown', handleGlobalKeyDown, true);
      windowElements.push({
        remove: () => window.removeEventListener('keydown', handleGlobalKeyDown, true),
      });

      // 6. Host-level listener for Todolist iframe and window postMessages
      const handleHostMessage = (event) => {
        try {
          const data = event.data;
          if (!data || typeof data !== 'object') return;
          if (typeof data.type !== 'string' || !data.type.startsWith('TODOLIST_')) return;

          const sourceWin = event.source;
          const iframe = window.document.getElementById('todolist-tab-iframe');

          if (iframe && (event.source === iframe.contentWindow || !sourceWin)) {
            iframe._todolistReady = true;
          }

          const replyResult = (msgObj) => {
            try {
              if (sourceWin && typeof sourceWin.postMessage === 'function') {
                sourceWin.postMessage(msgObj, '*');
              } else if (iframe?.contentWindow) {
                iframe.contentWindow.postMessage(msgObj, '*');
              }
            } catch (_) {}
          };

          // A. Handshake Ready
          if (data.type === 'TODOLIST_READY') {
            this._uiClients ||= new Set();
            if (sourceWin) this._uiClients.add(sourceWin);
            if (iframe) iframe._todolistReady = true;
            this.loadData().then((storedData) => {
              const pendingNav = iframe?._todolistPending || null;
              if (iframe) iframe._todolistPending = null;
              replyResult({
                type: 'TODOLIST_INIT_DATA',
                data: storedData,
                pending: pendingNav
              });
            });
            return;
          }

          // B. Storage Save Request
          if (data.type === 'TODOLIST_STORAGE_SET' && data.payload) {
            this.saveData(data.payload).then((saved) => {
              if (data.requestId) {
                replyResult({
                  type: 'TODOLIST_STORAGE_SET_RESULT',
                  requestId: data.requestId,
                  data: saved,
                  success: true
                });
              }
            }).catch(error => replyResult({ type: 'TODOLIST_STORAGE_SET_RESULT',
              requestId: data.requestId, success: false, error: String(error) }));
            return;
          }

          if (data.type === 'TODOLIST_NOTIFY') {
            this.showNotice(data.title || '任务提醒', data.body || '');
            return;
          }

          // C. Locate and select item in Zotero library pane
          if (data.type === 'TODOLIST_LOCATE_ITEM' && data.key) {
            const tabs = window.Zotero_Tabs;
            if (tabs && Array.isArray(tabs._tabs)) {
              const libTab = tabs._tabs.find((t) => t && (t.type === 'library' || t.id === 'zotero-pane'));
              if (libTab) tabs.select(libTab.id);
            }
            const item = resolveItemReference(data.key, data.libraryID);
            if (item && window.ZoteroPane) {
              window.ZoteroPane.selectItem(item.id);
            }
            return;
          }

          // D. Open PDF Reader in Zotero (with optional page navigation)
          if (data.type === 'TODOLIST_OPEN_PDF' && data.key) {
            const item = resolveItemReference(data.key, data.libraryID);
            if (item) {
              let page = data.page || null;
              if (!page && data.pdfUri) {
                const match = String(data.pdfUri).match(/[?&]page=(\d+)/);
                if (match) page = Number(match[1]);
              }
              this.openPdfAttachment(item, page);
            }
            return;
          }

          // E. Open Zotero Preferences pane
          if (data.type === 'TODOLIST_OPEN_PREFERENCES') {
            this.openPreferencesPane(window);
            return;
          }

          // F. Request active item from library or reader
          if (data.type === 'TODOLIST_GET_ACTIVE_ITEM') {
            const activeItem = this.getCurrentActiveItem(window);
            replyResult({
              type: 'TODOLIST_GET_ACTIVE_ITEM_RESULT',
              requestId: data.requestId,
              item: activeItem ? serializeLiteratureItem(activeItem) : null
            });
            return;
          }

          // G. Sync tasks to Zotero child note
          if (data.type === 'TODOLIST_SYNC_NOTE' && data.key) {
            const item = resolveItemReference(data.key, data.libraryID);
            if (item) {
              this.syncTasksToChildNote(item).then((note) => {
                if (data.requestId) {
                  replyResult({
                    type: 'TODOLIST_SYNC_NOTE_RESULT',
                    requestId: data.requestId,
                    success: Boolean(note),
                    noteId: note?.id
                  });
                }
              });
            }
            return;
          }

          // H. Get Zotero Collections
          if (data.type === 'TODOLIST_GET_COLLECTIONS') {
            const collections = this.getZoteroCollections(data.libraryID);
            if (data.requestId) {
              replyResult({
                type: 'TODOLIST_GET_COLLECTIONS_RESULT',
                requestId: data.requestId,
                collections
              });
            }
            return;
          }

          // I. Create Collection Plan
          if (data.type === 'TODOLIST_CREATE_COLLECTION_PLAN' && data.collectionID) {
            const col = Zotero.Collections?.get?.(data.collectionID);
            if (col) {
              this.createCollectionReadingPlan(col, window);
            }
            return;
          }

          // J. Switch Window Mode (tab / window / subwindow)
          if (data.type === 'TODOLIST_SWITCH_WINDOW_MODE' && data.mode) {
            this.switchWindowMode(data.mode, window);
            return;
          }

          // K. Export Data
          if (data.type === 'TODOLIST_EXPORT_DATA') {
            this.exportData(data.format || 'json');
            return;
          }

          // L. Import Data
          if (data.type === 'TODOLIST_IMPORT_DATA') {
            this.importDataFile(data.mode || 'merge', window);
            return;
          }

          // M. Clear All Data
          if (data.type === 'TODOLIST_CLEAR_DATA') {
            this.clearAllData(window);
            return;
          }

          // N. Copy Tasks Summary
          if (data.type === 'TODOLIST_COPY_SUMMARY') {
            this.copyTasksSummary(window);
            return;
          }

          // O. Print Tasks
          if (data.type === 'TODOLIST_PRINT') {
            this.printTasks(window);
            return;
          }

        } catch (e) {
          Zotero.logError?.('[Todolist] Host message processing error: ' + e);
        }
      };

      window.addEventListener('message', handleHostMessage);
      windowElements.push({
        remove: () => window.removeEventListener('message', handleHostMessage),
      });

      // 7. Inject Toolbar Button with retry
      const toolbarRetryState = { cancelled: false, timers: new Set() };
      windowElements.push({
        remove: () => {
          toolbarRetryState.cancelled = true;
          for (const timer of toolbarRetryState.timers) window.clearTimeout(timer);
          toolbarRetryState.timers.clear();
        },
      });
      this.injectToolbarButton(window, windowElements, 0, toolbarRetryState);

      injectedElements.set(window, windowElements);
    },

    injectToolbarButton(window, windowElements, retryCount = 0, retryState = { cancelled: false, timers: new Set() }) {
      if (retryState.cancelled) return;
      if (!window || !window.document) return;
      const doc = window.document;

      // Strictly restrict toolbar button injection to the main Zotero library window!
      // NEVER inject into secondary windows or extension panels (e.g. 插件市场, 偏好设置, 对话框)
      if (!this.isMainWindow(window)) {
        try {
          doc.getElementById('todolist-toolbar-button')?.remove();
        } catch (_) {}
        return;
      }

      const toolbar =
        doc.getElementById('zotero-items-toolbar') ||
        doc.getElementById('zotero-item-toolbar') ||
        doc.getElementById('zotero-tb') ||
        doc.getElementById('zotero-toolbar') ||
        (doc.getElementById('zotero-pane')?.querySelector('toolbar') || null);

      if (!toolbar) {
        if (retryCount < 10) {
          const timer = window.setTimeout(() => {
            retryState.timers.delete(timer);
            if (!retryState.cancelled) this.injectToolbarButton(window, windowElements, retryCount + 1, retryState);
          }, 300);
          retryState.timers.add(timer);
        }
        return;
      }

      const isTodolistButton = (button) =>
        button.id === 'todolist-toolbar-button' ||
        (button.getAttribute('label') === 'Todolist' &&
          String(button.getAttribute('image') || '').includes('/icons/todolist.svg'));

      // Clean up any stale or misplaced duplicate buttons
      const existingButtons = Array.from(doc.querySelectorAll('toolbarbutton')).filter(isTodolistButton);
      let btn = existingButtons[0] || null;
      if (existingButtons.length > 1) {
        for (let i = 1; i < existingButtons.length; i++) {
          try { existingButtons[i].remove(); } catch (_) {}
        }
      }

      if (!btn) {
        btn = this.createXULElement(doc, 'toolbarbutton');

        btn.id = 'todolist-toolbar-button';
        btn.setAttribute('label', 'Todolist');
        btn.setAttribute('tooltiptext', '打开 Todolist 学术任务看板 (Ctrl+Alt+T)');
        btn.setAttribute('image', `${CHROME_ROOT}icons/todolist.svg`);
        btn.setAttribute('class', 'zotero-tb-button toolbarbutton-1 chromeclass-toolbar-additional');
        btn.setAttribute(
          'style',
          'cursor: pointer; margin: 0 3px; display: inline-flex; align-items: center; justify-content: center;'
        );

        const trigger = (e) => {
          if (e) {
            e.preventDefault?.();
            e.stopPropagation?.();
          }
          this.triggerTodolistOpen(window);
        };

        btn.addEventListener('command', trigger);
      }

      // Find the proper anchor: the LAST action button in the toolbar before the search box spacer
      const toolbarChildren = Array.from(toolbar.children || []);
      const flexibleSpacerIndex = toolbarChildren.findIndex((child) => {
        const tag = String(child.localName || child.tagName || '').toLowerCase();
        return tag === 'toolbarspring' ||
          (tag === 'spacer' && Number(child.getAttribute('flex') || 0) > 0) ||
          child.id === 'zotero-tb-search' ||
          child.id === 'zotero-tb-search-textbox' ||
          child.classList?.contains('zotero-search-box') ||
          child.classList?.contains('search-box');
      });

      const leadingActionItems = flexibleSpacerIndex >= 0
        ? toolbarChildren.slice(0, flexibleSpacerIndex)
        : toolbarChildren;

      const toolbarButtons = leadingActionItems.filter((child) =>
        String(child.localName || child.tagName || '').toLowerCase() === 'toolbarbutton' &&
        !isTodolistButton(child) &&
        !child.hidden &&
        child.getAttribute('hidden') !== 'true' &&
        child.getAttribute('collapsed') !== 'true'
      );

      // Find the last visible button in the action group (places Todolist at the end of the plugin row)
      const anchor = toolbarButtons.reverse().find((child) => {
        try {
          const style = window.getComputedStyle(child);
          return style.display !== 'none' && style.visibility !== 'collapse';
        } catch (_error) {
          return true;
        }
      }) || null;

      if (anchor && anchor.parentNode === toolbar) {
        if (anchor.nextSibling !== btn) {
          anchor.parentNode.insertBefore(btn, anchor.nextSibling);
        }
      } else {
        const searchBox =
          doc.getElementById('zotero-tb-search-textbox') ||
          doc.getElementById('zotero-tb-search') ||
          toolbar.querySelector('input') ||
          toolbar.querySelector('.zotero-search-box') ||
          (flexibleSpacerIndex >= 0 ? toolbarChildren[flexibleSpacerIndex] : null);
        if (searchBox && searchBox.parentNode === toolbar) {
          toolbar.insertBefore(btn, searchBox);
        } else {
          toolbar.appendChild(btn);
        }
      }

      if (!windowElements.includes(btn)) {
        windowElements.push(btn);
      }

      // Re-position safeguard after other extensions finish initializing
      if (retryCount === 0) {
        const delays = [400, 1200, 2500];
        delays.forEach((d) => {
          const timer = window.setTimeout(() => {
            retryState.timers.delete(timer);
            if (!retryState.cancelled) {
              this.repositionToolbarButton(window);
            }
          }, d);
          retryState.timers.add(timer);
        });
      }
    },

    repositionToolbarButton(window) {
      if (!window || !window.document) return;
      if (!this.isMainWindow(window)) {
        try {
          window.document.getElementById('todolist-toolbar-button')?.remove();
        } catch (_) {}
        return;
      }
      const doc = window.document;
      const btn = doc.getElementById('todolist-toolbar-button');
      if (!btn) return;

      const toolbar =
        btn.parentNode ||
        doc.getElementById('zotero-items-toolbar') ||
        doc.getElementById('zotero-item-toolbar') ||
        doc.getElementById('zotero-tb') ||
        doc.getElementById('zotero-toolbar') ||
        (doc.getElementById('zotero-pane')?.querySelector('toolbar') || null);
      if (!toolbar) return;

      const isTodolistButton = (b) => b.id === 'todolist-toolbar-button';
      const toolbarChildren = Array.from(toolbar.children || []);
      const flexibleSpacerIndex = toolbarChildren.findIndex((child) => {
        const tag = String(child.localName || child.tagName || '').toLowerCase();
        return tag === 'toolbarspring' ||
          (tag === 'spacer' && Number(child.getAttribute('flex') || 0) > 0) ||
          child.id === 'zotero-tb-search' ||
          child.id === 'zotero-tb-search-textbox' ||
          child.classList?.contains('zotero-search-box');
      });

      const leadingActionItems = flexibleSpacerIndex >= 0
        ? toolbarChildren.slice(0, flexibleSpacerIndex)
        : toolbarChildren;

      const toolbarButtons = leadingActionItems.filter((child) =>
        String(child.localName || child.tagName || '').toLowerCase() === 'toolbarbutton' &&
        !isTodolistButton(child) &&
        !child.hidden &&
        child.getAttribute('hidden') !== 'true' &&
        child.getAttribute('collapsed') !== 'true'
      );

      const anchor = toolbarButtons.reverse().find((child) => {
        try {
          const style = window.getComputedStyle(child);
          return style.display !== 'none' && style.visibility !== 'collapse';
        } catch (_error) {
          return true;
        }
      });

      if (anchor && anchor.parentNode === toolbar) {
        if (anchor.nextSibling !== btn) {
          anchor.parentNode.insertBefore(btn, anchor.nextSibling);
        }
      }
    },

    removeFromWindow(window) {
      if (!window || !window.document) return;
      const doc = window.document;

      const elements = injectedElements.get(window);
      if (elements) {
        for (const el of elements) {
          try {
            if (typeof el.remove === 'function') {
              el.remove();
            } else if (el.parentNode) {
              el.parentNode.removeChild(el);
            }
          } catch (_) {}
        }
        injectedElements.delete(window);
      }

      // Explicit cleanup of all Todolist DOM elements by ID
      const allTodolistIds = [
        'todolist-tools-menu',
        'todolist-tools-preferences',
        'todolist-itemmenu-separator',
        'todolist-itemmenu-create',
        'todolist-collectionmenu-create',
        'todolist-collectionmenu-plan',
        'todolist-reader-context-create',
        'todolist-toolbar-button',
        'todolist-tab-style',
      ];
      for (const id of allTodolistIds) {
        try {
          doc.getElementById(id)?.remove();
        } catch (_) {}
      }
    },

    getSelectedRegularItems(window) {
      const pane =
        window?.ZoteroPane ||
        (Zotero.getActiveZoteroPane ? Zotero.getActiveZoteroPane() : null) ||
        (Zotero.getMainWindow ? Zotero.getMainWindow().ZoteroPane : null);
      let rawSelection = [];
      if (pane && typeof pane.getSelectedItems === 'function') {
        try {
          rawSelection = pane.getSelectedItems() || [];
        } catch (_) {}
      }
      if ((!rawSelection || rawSelection.length === 0) && pane?.itemsView?.getSelectedItems) {
        try {
          rawSelection = pane.itemsView.getSelectedItems() || [];
        } catch (_) {}
      }
      const result = [];
      const seen = new Set();
      for (const item of rawSelection) {
        const lit = getLiteratureItem(item);
        if (lit && !seen.has(lit.id)) {
          seen.add(lit.id);
          result.push(lit);
        }
      }
      return result;
    },

    getCurrentActiveItem(window) {
      const tabs = window?.Zotero_Tabs || (typeof Zotero_Tabs !== 'undefined' ? Zotero_Tabs : null);
      if (tabs && tabs.selectedTab && tabs.selectedTab.type === 'reader') {
        const reader = Zotero.Reader?.getByTabID?.(tabs.selectedTab.id);
        const itemID = reader?.itemID || tabs.selectedTab.data?.itemID;
        if (itemID) {
          const item = Zotero.Items.get(itemID);
          return getLiteratureItem(item);
        }
      }
      const selected = this.getSelectedRegularItems(window);
      return selected[0] || null;
    },

    createTaskFromSelection(window = null, doc = null, itemMenu = null) {
      const win = window || (Zotero.getMainWindow ? Zotero.getMainWindow() : null);
      let targetItem = null;

      // 1. Try getSelectedRegularItems
      const selected = this.getSelectedRegularItems(win);
      if (selected.length > 0) {
        targetItem = selected[0];
      }

      // 2. Fallback to triggerNode / popupNode from context menu
      if (!targetItem) {
        const documentObj = doc || win?.document;
        const trigger = (itemMenu && itemMenu.triggerNode) || (documentObj && documentObj.popupNode);
        const pane = win?.ZoteroPane || (Zotero.getActiveZoteroPane ? Zotero.getActiveZoteroPane() : null);
        if (trigger && pane && typeof pane.getRowForNode === 'function') {
          try {
            const row = pane.getRowForNode(trigger);
            if (row && row.ref) {
              const rawItem = Zotero.Items.get(row.ref.id || row.ref);
              targetItem = getLiteratureItem(rawItem);
            }
          } catch (_) {}
        }
      }

      // 3. Fallback to getCurrentActiveItem (e.g. reader or active tab)
      if (!targetItem) {
        targetItem = this.getCurrentActiveItem(win);
      }

      if (targetItem) {
        const serialized = serializeLiteratureItem(targetItem);
        this.showNotice('已选取文献', `正在为《${serialized.title.slice(0, 22)}...》创建研读待办`);
        this.openTodolist({ mode: 'create_from_item', item: serialized }, win);
      } else {
        this.showNotice('创建待办', '正在打开任务面板...');
        this.openTodolist({ mode: 'open_modal_prefill', prefill: { category: '论文研读' } }, win);
      }
    },

    async createReadingMilestones(item, window = null) {
      const meta = serializeLiteratureItem(item);
      if (!meta) return;

      const data = await this.loadData();
      const parentTaskId = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      const nowStr = new Date().toISOString();

      const mainTask = {
        id: parentTaskId,
        title: `📖 精读研读：${meta.title}`,
        description: `文献作者：${meta.authors} (${meta.year})\n出版物：${meta.publication}\n文献链接：${meta.zoteroUri}`,
        dueDate: null,
        dueTime: null,
        priority: 'high',
        category: '论文研读',
        completed: false,
        createdAt: nowStr,
        completedAt: null,
        tags: [...(meta.tags || []), '精读计划'],
        reminder: { enabled: false, before: 15, notified: false },
        order: (data.tasks || []).length,
        zoteroItemKey: meta.key,
        zoteroItemTitle: meta.title,
        zoteroAuthors: meta.authors,
            zoteroLibraryID: meta.libraryID,
            zoteroPublication: meta.publication,
        zoteroYear: meta.year,
        zoteroUri: meta.zoteroUri,
        zoteroPdfUri: meta.pdfUri,
        academicType: 'literature_reading',
        subtasks: [
          { id: 'sub_' + Date.now() + '_1', title: '1. 快速通读 Abstract、Introduction 与 Conclusion', completed: false },
          { id: 'sub_' + Date.now() + '_2', title: '2. 深度梳理核心算法架构、数学公式与创新点', completed: false },
          { id: 'sub_' + Date.now() + '_3', title: '3. 仔细评估 Baseline 对比与 Ablation 消融实验', completed: false },
          { id: 'sub_' + Date.now() + '_4', title: '4. 查阅开源代码并跑通最小测试 Demo', completed: false },
          { id: 'sub_' + Date.now() + '_5', title: '5. 提炼批判性思考、局限性并整理学术笔记', completed: false },
        ]
      };

      await this.saveData({ taskChanges: { added: [mainTask] } });

      if (this.getPref('autoTagOnCreate', true)) {
        await this.tagItemOnTaskEvent(meta.key, 'create', item.libraryID);
      }
      if (this.getPref('autoSyncChildNote', true)) {
        await this.syncTasksToChildNote(item);
      }

      this.showNotice('精读清单创建成功', `已为《${meta.title.slice(0, 25)}...》生成 5 项研读里程碑`);
      this.openTodolist({ mode: 'view_task', taskId: parentTaskId }, window);
    },

    triggerTodolistOpen(window = null) {
      const win = window || (Zotero.getMainWindow ? Zotero.getMainWindow() : null);
      this.openTodolist({ mode: 'open' }, win);
    },

    openTodolist(options = {}, targetWindow = null) {
      try {
        const mainWin = (targetWindow && targetWindow.Zotero_Tabs)
          ? targetWindow
          : (Zotero.getMainWindow ? Zotero.getMainWindow() : Services.wm.getMostRecentWindow('navigator:browser'));

        let preferredWindowMode = 'tab';
        try {
          if (Zotero.Prefs) {
            preferredWindowMode = Zotero.Prefs.get('extensions.todolist.windowMode', true) || 'tab';
          }
        } catch (_) {}

        const effectiveMode = options.targetMode || preferredWindowMode;
        if (effectiveMode === 'window') {
          this.openStandaloneWindow(options, mainWin, 'window');
          return;
        } else if (effectiveMode === 'subwindow') {
          this.openStandaloneWindow(options, mainWin, 'subwindow');
          return;
        }

        const tabs = mainWin?.Zotero_Tabs || (Zotero.getMainWindow && Zotero.getMainWindow().Zotero_Tabs);
        if (tabs && typeof tabs.add === 'function') {
          // Check if Todolist tab is already open
          if (Array.isArray(tabs._tabs)) {
            const existingTab = tabs._tabs.find((t) => t && t.type === 'todolist');
            if (existingTab) {
              tabs.select(existingTab.id);
              if (mainWin && mainWin.focus) mainWin.focus();

              const iframe = mainWin.document.getElementById('todolist-tab-iframe') ||
                (existingTab.container && existingTab.container.querySelector('iframe'));
              if (iframe) {
                iframe._todolistPending = options;
                try {
                  if (iframe.contentWindow?.ZoteroBridge?.handleHostNavigation) {
                    iframe.contentWindow.ZoteroBridge.handleHostNavigation(options);
                  }
                } catch (_) {}
                try {
                  if (iframe.contentWindow?.postMessage) {
                    iframe.contentWindow.postMessage({ type: 'TODOLIST_NAVIGATE', options }, '*');
                  }
                } catch (_) {}
              }
              return;
            }
          }

          // Open as internal Tab
          const tabResult = tabs.add({
            type: 'todolist',
            title: 'Todolist 学术待办',
            select: true,
            data: options,
            onClose: () => {
              Zotero.log?.('[Todolist] Tab closed');
            }
          });

          const container = (tabResult && tabResult.container) ||
            (tabs.getTabContainer && tabs.getTabContainer(tabResult.id || tabResult)) ||
            (tabs.getTab && tabs.getTab(tabResult?.id)?.container);

          if (container) {
            const doc = container.ownerDocument || mainWin.document;
            const iframe = doc.createElement('iframe');
            iframe.id = 'todolist-tab-iframe';
            iframe.setAttribute('src', `${CHROME_ROOT}index.html`);
            iframe.setAttribute('style', 'width: 100%; height: 100%; border: none; flex: 1; display: block;');
            iframe.setAttribute('flex', '1');
            iframe._todolistReady = false;
            iframe._todolistPending = options;

            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.overflow = 'hidden';

            iframe.addEventListener('load', () => {
              try {
                if (iframe.contentWindow) {
                  iframe.contentWindow.Zotero = Zotero;
                  iframe.contentWindow._todolistPending = options;
                  if (iframe.contentWindow.ZoteroBridge?.handleHostNavigation) {
                    iframe.contentWindow.ZoteroBridge.handleHostNavigation(options);
                  }
                }
              } catch (_) {}
            });

            container.appendChild(iframe);
          }

          if (mainWin && mainWin.focus) mainWin.focus();
          return;
        }
      } catch (e) {
        Zotero.logError?.('[Todolist] openTodolist error: ' + e);
      }

      this.openStandaloneWindow(options, targetWindow, 'window');
    },

    openStandaloneWindow(options = {}, targetWindow = null, windowType = 'window') {
      try {
        const ww = Services.ww;
        let features = '';
        let windowName = '';
        const url = `${CHROME_ROOT}index.html?mode=${encodeURIComponent(windowType)}`;
        if (windowType === 'subwindow') {
          // Compact companion subwindow: ideal for side-by-side reading with PDF reader
          const alwaysRaised = this.getPref('subwindowAlwaysOnTop', false) ? ',alwaysRaised=yes' : '';
          features = `chrome,dialog=no,all,resizable=yes,minimizable=yes,width=460,height=760,top=80,left=80${alwaysRaised}`;
          windowName = 'Todolist_SubWindow';
        } else {
          // Full standalone desktop window
          features = 'chrome,dialog=no,all,resizable=yes,minimizable=yes,width=1120,height=760,centerscreen';
          windowName = 'Todolist_Window';
        }

        // Close the other standalone window type if open (switching between subwindow and window)
        const otherWindowName = windowType === 'subwindow' ? 'Todolist_Window' : 'Todolist_SubWindow';
        try {
          const windows = Services.wm.getEnumerator(null);
          while (windows.hasMoreElements()) {
            const w = windows.getNext();
            if (w && w.name === otherWindowName) {
              try { w.close(); } catch (_) {}
            }
          }
        } catch (_) {}

        const mainWin = (targetWindow && targetWindow.Zotero_Tabs)
          ? targetWindow
          : (Zotero.getMainWindow ? Zotero.getMainWindow() : Services.wm.getMostRecentWindow('navigator:browser'));

        const win = ww.openWindow(
          mainWin,
          url,
          windowName,
          features,
          { Zotero, options: { ...options, currentWindowType: windowType } }
        );
        if (win && win.focus) win.focus();

        if (options && options.mode && options.mode !== 'open') {
          const tryDeliver = (attempts = 0) => {
            try {
              if (win && !win.closed) {
                if (win.ZoteroBridge?.handleHostNavigation) {
                  win.ZoteroBridge.handleHostNavigation(options);
                  return;
                }
                win.postMessage?.({ type: 'TODOLIST_NAVIGATE', options }, '*');
              }
            } catch (_) {}
            if (attempts < 10) {
              mainWin.setTimeout(() => tryDeliver(attempts + 1), 200);
            }
          };
          mainWin.setTimeout(() => tryDeliver(0), 300);
        }
      } catch (err) {
        Zotero.logError?.('[Todolist] openStandaloneWindow error: ' + err);
      }
    },

    openPreferencesPane(window) {
      try {
        const win = window || Zotero.getMainWindow?.();
        if (Zotero.Utilities?.Internal?.openPreferences) {
          Zotero.Utilities.Internal.openPreferences('todolist-preferences-pane');
        } else if (win?.openPreferences) {
          win.openPreferences('todolist-preferences-pane');
        } else {
          win?.openDialog?.('chrome://zotero/content/preferences/preferences.xhtml', 'Preferences', 'chrome,titlebar,toolbar,centerscreen,dialog=yes');
        }
      } catch (e) {
        Zotero.logError?.('[Todolist] Could not open preferences: ' + e);
      }
    },

    async shutdown() {
      clearTimeout(this._paneUndoTimer);
      this._paneDeleted = [];
      this._uiClients?.clear();
      // Unregister data listeners
      this._dataListeners.clear();

      // Unregister MenuManager
      if (this._menuManagerId && Zotero.MenuManager && typeof Zotero.MenuManager.unregisterMenu === 'function') {
        try {
          Zotero.MenuManager.unregisterMenu(this._menuManagerId);
        } catch (_) {}
        this._menuManagerId = null;
      }

      // Clean windows
      const windows = Services.wm.getEnumerator('navigator:browser');
      while (windows.hasMoreElements()) {
        const win = windows.getNext();
        this.removeFromWindow(win);
      }

      // Remove window listener
      if (windowListener) {
        Services.wm.removeListener(windowListener);
        windowListener = null;
      }

      // Unregister ItemPane section
      if (this.itemPaneSectionID && Zotero.ItemPaneManager?.unregisterSection) {
        try {
          Zotero.ItemPaneManager.unregisterSection(this.itemPaneSectionID);
        } catch (_) {}
      }

      Zotero.log?.('[Todolist] Shutdown completed');
    }
  };

  // Run initialization
  Zotero.Todolist.init();
})();
