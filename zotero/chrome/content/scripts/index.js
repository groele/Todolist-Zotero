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
    if (typeof target.isAttachment === 'function' && target.isAttachment() && target.parentItemID) {
      target = Zotero.Items.get(target.parentItemID) || target;
    }
    if (typeof target.isNote === 'function' && target.isNote() && target.parentItemID) {
      target = Zotero.Items.get(target.parentItemID) || target;
    }
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
          if (att && att.isPDFAttachment && att.isPDFAttachment()) {
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

    getDataFilePath() {
      const baseDir = Zotero.DataDirectory?.dir || PathUtils.profileDir;
      return PathUtils.join(baseDir, 'todolist-data.json');
    },

    async loadData() {
      if (this._cachedData) return this._cachedData;
      const filePath = this.getDataFilePath();
      try {
        const exists = await IOUtils.exists(filePath);
        if (exists) {
          const content = await IOUtils.readUTF8(filePath);
          this._cachedData = JSON.parse(content);
          return this._cachedData;
        }
      } catch (e) {
        Zotero.logError?.('[Todolist] Failed to read todolist-data.json: ' + e);
      }

      // Default initial data
      this._cachedData = {
        tasks: [],
        settings: {
          defaultView: 'list',
          showCompleted: true,
          sortOrder: 'dueDate',
          theme: 'light',
          dailySummary: false,
          summaryTime: '09:00'
        },
        customTags: []
      };
      return this._cachedData;
    },

    async saveData(data) {
      this._cachedData = { ...this._cachedData, ...data };
      const filePath = this.getDataFilePath();
      try {
        const jsonStr = JSON.stringify(this._cachedData, null, 2);
        const tmpPath = `${filePath}.tmp-${Date.now()}`;
        await IOUtils.writeUTF8(filePath, jsonStr, { tmpPath });
        this.notifyDataChanged();
      } catch (e) {
        Zotero.logError?.('[Todolist] Failed to write todolist-data.json: ' + e);
      }
      return this._cachedData;
    },

    registerDataListener(listener) {
      this._dataListeners.add(listener);
    },

    unregisterDataListener(listener) {
      this._dataListeners.delete(listener);
    },

    notifyDataChanged() {
      for (const listener of this._dataListeners) {
        try {
          listener(this._cachedData);
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

    async syncTasksToChildNote(item, tasks = null) {
      const target = getLiteratureItem(item);
      if (!target) return null;

      try {
        const data = await this.loadData();
        const allTasks = tasks || (data.tasks || []).filter((t) => t.zoteroItemKey === target.key);
        const meta = serializeLiteratureItem(target);

        const total = allTasks.length;
        const completed = allTasks.filter((t) => t.completed).length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        // Construct formatted HTML note
        let noteHtml = `<h1>📝 [Todolist] 研读清单与进度</h1>`;
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
            const dueInfo = t.dueDate ? ` <span style="font-size:11px;color:#d97706;">(截止: ${t.dueDate})</span>` : '';
            noteHtml += `<li>${checkMark} <span style="${statusStyle}">${escapeHtml(t.title)}</span>${dueInfo}`;
            if (t.subtasks && t.subtasks.length > 0) {
              noteHtml += `<ul>`;
              for (const sub of t.subtasks) {
                noteHtml += `<li>${sub.completed ? '☑' : '☐'} ${escapeHtml(sub.title)}</li>`;
              }
              noteHtml += `</ul>`;
            }
            if (t.description && t.description.trim()) {
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

        this.showNotice('文献笔记同步成功', `已更新《${meta.title.slice(0, 20)}...》的研读进度笔记，支持多端云同步！`);
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
        const tasks = (data.tasks || []).filter((t) => t.zoteroItemKey === target.key);
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
        const existingKeys = new Set((data.tasks || []).map((t) => t.zoteroItemKey).filter(Boolean));
        let addedCount = 0;

        for (const item of regularItems) {
          if (existingKeys.has(item.key)) continue;
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
          existingKeys.add(item.key);
          addedCount++;

          if (this.getPref('autoTagOnCreate', true)) {
            const pendingTag = this.getPref('tagForPending', '待研读');
            if (pendingTag && !item.hasTag(pendingTag)) {
              item.addTag(pendingTag);
              await item.saveTx();
            }
          }
        }

        if (addedCount > 0) {
          await this.saveData({ tasks: data.tasks });
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

        data.tasks.push(newTask);
        await this.saveData({ tasks: data.tasks });

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

          const importedTasks = Array.isArray(importedJson.tasks)
            ? importedJson.tasks
            : (Array.isArray(importedJson) ? importedJson : []);

          if (importedTasks.length === 0 && !importedJson.customTags) {
            throw new Error('未在备份文件中找到有效的任务或标签数据');
          }

          const currentData = await this.loadData();
          let finalTasks = [];
          if (mode === 'merge') {
            const taskMap = new Map();
            for (const t of (currentData.tasks || [])) {
              if (t && t.id) taskMap.set(t.id, t);
            }
            for (const t of importedTasks) {
              if (!t) continue;
              const id = t.id || ('imported_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
              taskMap.set(id, { ...t, id });
            }
            finalTasks = Array.from(taskMap.values());
          } else {
            // Overwrite
            finalTasks = importedTasks;
          }

          // Merge custom tags
          let finalTags = currentData.customTags || [];
          if (Array.isArray(importedJson.customTags)) {
            const tagMap = new Map();
            if (mode === 'merge') {
              for (const tag of finalTags) tagMap.set(tag.id || tag.name, tag);
            }
            for (const tag of importedJson.customTags) {
              if (tag && (tag.id || tag.name)) tagMap.set(tag.id || tag.name, tag);
            }
            finalTags = Array.from(tagMap.values());
          }

          await this.saveData({
            tasks: finalTasks,
            customTags: finalTags,
            settings: { ...(currentData.settings || {}), ...(importedJson.settings || {}) }
          });

          this.showNotice('导入成功', `已成功导入 ${importedTasks.length} 个任务与标签数据！`);
          return { success: true, count: importedTasks.length };
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
        await this.saveData({ tasks: [], history: [], customTags: [] });
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
            <span class="title">${t.title}</span>
            ${t.zoteroItemTitle ? `<span class="lit">📖 ${t.zoteroItemTitle}</span>` : ''}
            ${t.dueDate ? `<span class="date">📅 ${t.dueDate}</span>` : ''}
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
      const win = window || (Zotero.getMainWindow ? Zotero.getMainWindow() : null);
      if (mode === 'subwindow') {
        this.openStandaloneWindow({}, win, 'subwindow');
      } else if (mode === 'window') {
        this.openStandaloneWindow({}, win, 'window');
      } else if (mode === 'tab') {
        this.openTodolist({ targetMode: 'tab' }, win);
      }
    },

    init() {
      this.initWindowListener();

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
          sidenav: { l10nID: 'todolist-item-pane-header', icon },
          onInit: ({ doc, body, item, refresh }) => {
            this.ensureLocalization(doc);
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
            body.replaceChildren();
            const target = getLiteratureItem(item);
            if (!target) return;

            const html = 'http://www.w3.org/1999/xhtml';
            const data = await this.loadData();
            const targetKey = target.key;
            const tasks = (data.tasks || []).filter((t) => t.zoteroItemKey === targetKey);
            const uncompletedTasks = tasks.filter((t) => !t.completed);
            const total = tasks.length;
            const done = total - uncompletedTasks.length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            setSectionSummary?.(total ? `${done}/${total} (${pct}%)` : '');

            const wrapper = doc.createElementNS(html, 'div');
            wrapper.setAttribute('style', 'display:flex;flex-direction:column;gap:8px;padding:8px 4px;font-size:12px;');

            // Progress header
            const summaryRow = doc.createElementNS(html, 'div');
            summaryRow.setAttribute('style', 'display:flex;align-items:center;justify-content:space-between;color:var(--text-secondary,#64748b);font-size:11px;');
            summaryRow.innerHTML = total
              ? `<span>研读待办：<strong>${done}/${total}</strong> 已完成</span><span style="font-weight:700;color:var(--accent-color,#059669);">${pct}%</span>`
              : '<span>此文献暂无研读待办事项</span>';
            wrapper.appendChild(summaryRow);

            // Graphical Progress Bar
            const showProgressBar = this.getPref('itemPaneShowProgressBar', true);
            if (total > 0 && showProgressBar) {
              const progressBar = doc.createElementNS(html, 'div');
              progressBar.setAttribute('style', 'background:var(--fill-quinary,#e2e8f0);border-radius:4px;height:6px;width:100%;overflow:hidden;');
              const progressFill = doc.createElementNS(html, 'div');
              progressFill.setAttribute('style', `background:var(--accent-color,#059669);height:6px;width:${pct}%;border-radius:4px;transition:width 0.3s ease;`);
              progressBar.appendChild(progressFill);
              wrapper.appendChild(progressBar);
            }

            // Empty state card
            if (total === 0) {
              const emptyCard = doc.createElementNS(html, 'div');
              emptyCard.setAttribute('style', 'display:flex;flex-direction:column;align-items:center;text-align:center;padding:12px 8px;gap:8px;background:var(--fill-quinary,#f8fafc);border-radius:6px;border:1px dashed var(--border-color,#cbd5e1);margin:2px 0;');

              const emptyText = doc.createElementNS(html, 'div');
              emptyText.setAttribute('style', 'font-size:12px;color:var(--text-secondary,#64748b);font-weight:500;');
              emptyText.textContent = '📖 此文献尚未建立研读计划与待办';

              const btnCreateMilestones = doc.createElementNS(html, 'button');
              btnCreateMilestones.type = 'button';
              btnCreateMilestones.textContent = '⚡ 一键生成 5 步精读清单';
              btnCreateMilestones.setAttribute('style', 'padding:5px 12px;font-size:11px;font-weight:600;background:var(--accent-color,#059669);color:#ffffff;border:none;border-radius:4px;cursor:pointer;');
              btnCreateMilestones.addEventListener('click', () => {
                this.createReadingMilestones(target, Zotero.getMainWindow?.());
              });

              emptyCard.appendChild(emptyText);
              emptyCard.appendChild(btnCreateMilestones);
              wrapper.appendChild(emptyCard);
            }

            // Task list inside pane
            if (total > 0) {
              const taskList = doc.createElementNS(html, 'div');
              taskList.setAttribute('style', 'display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;');

              const showSubtasks = this.getPref('itemPaneShowSubtasks', true);

              for (const t of tasks) {
                const taskContainer = doc.createElementNS(html, 'div');
                taskContainer.setAttribute('style', 'display:flex;flex-direction:column;gap:3px;padding:6px 8px;border-radius:6px;background:var(--fill-quinary,#f1f5f9);border:1px solid rgba(0,0,0,0.04);');

                const row = doc.createElementNS(html, 'div');
                row.setAttribute('style', 'display:flex;align-items:center;gap:6px;cursor:pointer;');

                // Priority dot
                const prioDot = doc.createElementNS(html, 'span');
                const pColor = t.priority === 'high' ? '#ef4444' : (t.priority === 'low' ? '#10b981' : '#f59e0b');
                prioDot.setAttribute('style', `width:7px;height:7px;border-radius:50%;background:${pColor};flex-shrink:0;`);
                prioDot.title = `优先级: ${t.priority || '中'}`;
                row.appendChild(prioDot);

                const checkbox = doc.createElementNS(html, 'input');
                checkbox.type = 'checkbox';
                checkbox.checked = Boolean(t.completed);
                checkbox.setAttribute('style', 'cursor:pointer;');
                checkbox.addEventListener('change', async (e) => {
                  e.stopPropagation();
                  t.completed = checkbox.checked;
                  t.completedAt = checkbox.checked ? new Date().toISOString() : null;
                  await this.saveData({ tasks: data.tasks });
                  await this.tagItemOnTaskEvent(target.key, 'complete_check', target.libraryID);
                  if (this.getPref('autoSyncChildNote', true)) {
                    await this.syncTasksToChildNote(target);
                  }
                });
                row.appendChild(checkbox);

                const titleSpan = doc.createElementNS(html, 'span');
                titleSpan.setAttribute('style', `flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;${t.completed ? 'text-decoration:line-through;opacity:0.6;' : ''}`);
                titleSpan.textContent = t.title;
                titleSpan.title = t.title;
                row.appendChild(titleSpan);

                // Due date chip
                if (t.dueDate) {
                  const dueBadge = doc.createElementNS(html, 'span');
                  dueBadge.setAttribute('style', 'font-size:10px;padding:1px 4px;border-radius:3px;background:rgba(217,119,6,0.12);color:#d97706;flex-shrink:0;');
                  dueBadge.textContent = t.dueDate.length > 5 ? t.dueDate.slice(5) : t.dueDate;
                  dueBadge.title = `截止日期: ${t.dueDate}`;
                  row.appendChild(dueBadge);
                }

                // Subtask count indicator
                if (Array.isArray(t.subtasks) && t.subtasks.length > 0) {
                  const doneSubs = t.subtasks.filter((s) => s.completed).length;
                  const subBadge = doc.createElementNS(html, 'span');
                  subBadge.setAttribute('style', 'font-size:10px;padding:1px 4px;border-radius:3px;background:var(--fill-quaternary,#e2e8f0);color:var(--text-secondary,#475569);flex-shrink:0;');
                  subBadge.textContent = `${doneSubs}/${t.subtasks.length}`;
                  row.appendChild(subBadge);
                }

                // Delete task button
                const delBtn = doc.createElementNS(html, 'button');
                delBtn.type = 'button';
                delBtn.textContent = '×';
                delBtn.setAttribute('style', 'background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;line-height:1;padding:0 3px;opacity:0.6;');
                delBtn.title = '删除此待办';
                delBtn.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  data.tasks = data.tasks.filter((tk) => tk.id !== t.id);
                  await this.saveData({ tasks: data.tasks });
                  await this.tagItemOnTaskEvent(target.key, 'complete_check', target.libraryID);
                  if (this.getPref('autoSyncChildNote', true)) {
                    await this.syncTasksToChildNote(target);
                  }
                });
                row.appendChild(delBtn);

                // Clicking row opens full workspace focused on this task
                row.addEventListener('click', () => {
                  this.openTodolist({ mode: 'view_task', taskId: t.id }, Zotero.getMainWindow?.());
                });

                taskContainer.appendChild(row);

                // Subtask interactive list
                if (showSubtasks && Array.isArray(t.subtasks) && t.subtasks.length > 0) {
                  const subList = doc.createElementNS(html, 'div');
                  subList.setAttribute('style', 'display:flex;flex-direction:column;gap:3px;margin-left:22px;margin-top:2px;font-size:11px;color:var(--text-secondary,#64748b);');

                  for (const sub of t.subtasks) {
                    const subRow = doc.createElementNS(html, 'div');
                    subRow.setAttribute('style', 'display:flex;align-items:center;gap:5px;cursor:pointer;');

                    const subCheck = doc.createElementNS(html, 'input');
                    subCheck.type = 'checkbox';
                    subCheck.checked = Boolean(sub.completed);
                    subCheck.setAttribute('style', 'cursor:pointer;transform:scale(0.85);');
                    subCheck.addEventListener('change', async (e) => {
                      e.stopPropagation();
                      sub.completed = subCheck.checked;
                      const allDone = t.subtasks.every((st) => st.completed);
                      if (allDone && !t.completed) {
                        t.completed = true;
                        t.completedAt = new Date().toISOString();
                      } else if (!allDone && t.completed) {
                        t.completed = false;
                        t.completedAt = null;
                      }
                      await this.saveData({ tasks: data.tasks });
                      await this.tagItemOnTaskEvent(target.key, 'complete_check', target.libraryID);
                      if (this.getPref('autoSyncChildNote', true) && this.getPref('childNoteAutoUpdateOnSubtask', true)) {
                        await this.syncTasksToChildNote(target);
                      }
                    });

                    const subSpan = doc.createElementNS(html, 'span');
                    subSpan.setAttribute('style', `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${sub.completed ? 'text-decoration:line-through;opacity:0.5;' : ''}`);
                    subSpan.textContent = sub.title;

                    subRow.appendChild(subCheck);
                    subRow.appendChild(subSpan);
                    subList.appendChild(subRow);
                  }
                  taskContainer.appendChild(subList);
                }

                taskList.appendChild(taskContainer);
              }
              wrapper.appendChild(taskList);
            }

            // Quick task addition input row
            const quickRow = doc.createElementNS(html, 'div');
            quickRow.setAttribute('style', 'display:flex;gap:6px;align-items:center;margin-top:4px;');

            const quickInput = doc.createElementNS(html, 'input');
            quickInput.type = 'text';
            quickInput.placeholder = '+ 添加研读待办 (按 Enter 保存)...';
            quickInput.setAttribute('style', 'flex:1;padding:5px 8px;border-radius:4px;border:1px solid var(--border-color,#cbd5e1);font-size:12px;');

            const handleQuickAdd = async () => {
              const text = quickInput.value.trim();
              if (!text) return;
              const meta = serializeLiteratureItem(target);
              const defaultPrio = this.getPref('defaultPriority', 'medium');
              const defaultType = this.getPref('defaultTaskType', 'literature_reading');
              const inheritTags = this.getPref('autoTagFromItem', true);
              const newTask = {
                id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                title: text,
                description: `文献研读待办：${meta.title} (${meta.authors} ${meta.year})`,
                dueDate: null,
                dueTime: null,
                priority: defaultPrio,
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
                zoteroYear: meta.year,
                zoteroUri: meta.zoteroUri,
                zoteroPdfUri: meta.pdfUri,
                academicType: defaultType
              };
              data.tasks.push(newTask);
              await this.saveData({ tasks: data.tasks });
              quickInput.value = '';
              await this.tagItemOnTaskEvent(target.key, 'create', target.libraryID);
              if (this.getPref('autoSyncChildNote', true)) {
                await this.syncTasksToChildNote(target);
              }
            };

            quickInput.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleQuickAdd();
              }
            });

            quickRow.appendChild(quickInput);
            wrapper.appendChild(quickRow);

            // Action buttons row
            const actionRow = doc.createElementNS(html, 'div');
            actionRow.setAttribute('style', 'display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;');

            const btnOpenBoard = doc.createElementNS(html, 'button');
            btnOpenBoard.type = 'button';
            btnOpenBoard.textContent = '📋 待办看板';
            btnOpenBoard.setAttribute('style', 'padding:3px 8px;font-size:11px;cursor:pointer;');
            btnOpenBoard.addEventListener('click', () => {
              this.openTodolist({ mode: 'filter_item', itemKey: target.key }, Zotero.getMainWindow?.());
            });
            actionRow.appendChild(btnOpenBoard);

            const btnSubwin = doc.createElementNS(html, 'button');
            btnSubwin.type = 'button';
            btnSubwin.textContent = '🗗 伴读子窗口';
            btnSubwin.setAttribute('style', 'padding:3px 8px;font-size:11px;cursor:pointer;');
            btnSubwin.addEventListener('click', () => {
              this.openStandaloneWindow({ mode: 'filter_item', itemKey: target.key }, Zotero.getMainWindow?.(), 'subwindow');
            });
            actionRow.appendChild(btnSubwin);

            const btnMilestones = doc.createElementNS(html, 'button');
            btnMilestones.type = 'button';
            btnMilestones.textContent = '⚡ 生成精读清单';
            btnMilestones.setAttribute('style', 'padding:3px 8px;font-size:11px;cursor:pointer;');
            btnMilestones.addEventListener('click', () => {
              this.createReadingMilestones(target, Zotero.getMainWindow?.());
            });
            actionRow.appendChild(btnMilestones);

            const btnSyncNote = doc.createElementNS(html, 'button');
            btnSyncNote.type = 'button';
            btnSyncNote.textContent = '📝 同步为文献笔记';
            btnSyncNote.setAttribute('style', 'padding:3px 8px;font-size:11px;cursor:pointer;');
            btnSyncNote.addEventListener('click', async () => {
              await this.syncTasksToChildNote(target);
            });
            actionRow.appendChild(btnSyncNote);

            const meta = serializeLiteratureItem(target);
            if (meta?.pdfUri) {
              const btnPdf = doc.createElementNS(html, 'button');
              btnPdf.type = 'button';
              btnPdf.textContent = '📖 打开伴读 PDF';
              btnPdf.setAttribute('style', 'padding:3px 8px;font-size:11px;cursor:pointer;');
              btnPdf.addEventListener('click', () => {
                this.openPdfAttachment(target);
              });
              actionRow.appendChild(btnPdf);
            }

            wrapper.appendChild(actionRow);
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

    addToWindow(window) {
      if (!window || !window.document) return;
      const doc = window.document;

      if (doc.getElementById('todolist-tools-menu')) return;

      const windowElements = [];
      this.ensureLocalization(doc);

      // 1. Add to "Tools" (工具) Menu
      const toolsPopup = doc.getElementById('menu_ToolsPopup');
      if (toolsPopup) {
        const toolsItem = doc.createXULElement
          ? doc.createXULElement('menuitem')
          : doc.createElement('menuitem');
        toolsItem.id = 'todolist-tools-menu';
        toolsItem.setAttribute('label', 'Todolist 学术待办看板');
        toolsItem.setAttribute('image', `${CHROME_ROOT}icons/todolist.svg`);
        toolsItem.setAttribute('class', 'menuitem-iconic');
        toolsItem.addEventListener('command', () => {
          this.triggerTodolistOpen(window);
        });
        toolsPopup.appendChild(toolsItem);
        windowElements.push(toolsItem);

        const prefItem = doc.createXULElement
          ? doc.createXULElement('menuitem')
          : doc.createElement('menuitem');
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

      // 2. Add to Item Context Menu (文献右键菜单)
      const itemMenu = doc.getElementById('zotero-itemmenu');
      if (itemMenu) {
        const separator = doc.createXULElement
          ? doc.createXULElement('menuseparator')
          : doc.createElement('menuseparator');
        separator.id = 'todolist-itemmenu-separator';
        itemMenu.appendChild(separator);
        windowElements.push(separator);

        // A. Add reading task for selected paper
        const createFromItem = doc.createXULElement
          ? doc.createXULElement('menuitem')
          : doc.createElement('menuitem');
        createFromItem.id = 'todolist-itemmenu-create';
        createFromItem.setAttribute('label', '为选中文献添加研读待办');
        createFromItem.setAttribute('image', `${CHROME_ROOT}icons/todolist.svg`);
        createFromItem.setAttribute('class', 'menuitem-iconic');
        createFromItem.addEventListener('command', () => {
          const selected = this.getSelectedRegularItems(window);
          if (selected.length > 0) {
            this.openTodolist({ mode: 'create_from_item', item: serializeLiteratureItem(selected[0]) }, window);
          }
        });
        itemMenu.appendChild(createFromItem);
        windowElements.push(createFromItem);

        // B. Generate structured reading milestones
        const milestonesItem = doc.createXULElement
          ? doc.createXULElement('menuitem')
          : doc.createElement('menuitem');
        milestonesItem.id = 'todolist-itemmenu-milestones';
        milestonesItem.setAttribute('label', '⚡ 为选中文献批量生成精读清单');
        milestonesItem.setAttribute('image', `${CHROME_ROOT}icons/todolist.svg`);
        milestonesItem.setAttribute('class', 'menuitem-iconic');
        milestonesItem.addEventListener('command', () => {
          const selected = this.getSelectedRegularItems(window);
          if (selected.length > 0) {
            this.createReadingMilestones(selected[0], window);
          }
        });
        itemMenu.appendChild(milestonesItem);
        windowElements.push(milestonesItem);

        // C. Open companion subwindow for this paper
        const subwinItem = doc.createXULElement
          ? doc.createXULElement('menuitem')
          : doc.createElement('menuitem');
        subwinItem.id = 'todolist-itemmenu-subwindow';
        subwinItem.setAttribute('label', '🗗 在伴读子窗口中打开此文献待办');
        subwinItem.setAttribute('image', `${CHROME_ROOT}icons/todolist.svg`);
        subwinItem.setAttribute('class', 'menuitem-iconic');
        subwinItem.addEventListener('command', () => {
          const selected = this.getSelectedRegularItems(window);
          if (selected.length > 0) {
            this.openStandaloneWindow({ mode: 'filter_item', itemKey: selected[0].key }, window, 'subwindow');
          }
        });
        itemMenu.appendChild(subwinItem);
        windowElements.push(subwinItem);

        // D. Sync tasks to child note
        const syncNoteItem = doc.createXULElement
          ? doc.createXULElement('menuitem')
          : doc.createElement('menuitem');
        syncNoteItem.id = 'todolist-itemmenu-sync-note';
        syncNoteItem.setAttribute('label', '📝 同步研读清单至文献子笔记 (云端)');
        syncNoteItem.setAttribute('image', `${CHROME_ROOT}icons/todolist.svg`);
        syncNoteItem.setAttribute('class', 'menuitem-iconic');
        syncNoteItem.addEventListener('command', () => {
          const selected = this.getSelectedRegularItems(window);
          if (selected.length > 0) {
            this.syncTasksToChildNote(selected[0]);
          }
        });
        itemMenu.appendChild(syncNoteItem);
        windowElements.push(syncNoteItem);

        // E. View associated tasks for this item
        const filterItem = doc.createXULElement
          ? doc.createXULElement('menuitem')
          : doc.createElement('menuitem');
        filterItem.id = 'todolist-itemmenu-filter';
        filterItem.setAttribute('label', '查看此文献的关联待办');
        filterItem.setAttribute('image', `${CHROME_ROOT}icons/todolist.svg`);
        filterItem.setAttribute('class', 'menuitem-iconic');
        filterItem.addEventListener('command', () => {
          const selected = this.getSelectedRegularItems(window);
          if (selected.length > 0) {
            this.openTodolist({ mode: 'filter_item', itemKey: selected[0].key }, window);
          }
        });
        itemMenu.appendChild(filterItem);
        windowElements.push(filterItem);
      }

      // 3. Add to Collection Context Menu (分类目录右键菜单)
      const collectionMenu = doc.getElementById('zotero-collectionmenu');
      if (collectionMenu) {
        const colItem = doc.createXULElement
          ? doc.createXULElement('menuitem')
          : doc.createElement('menuitem');
        colItem.id = 'todolist-collectionmenu-create';
        colItem.setAttribute('label', '为此分类创建专题研读规划');
        colItem.setAttribute('image', `${CHROME_ROOT}icons/todolist.svg`);
        colItem.setAttribute('class', 'menuitem-iconic');

        colItem.addEventListener('command', () => {
          const collection = window.ZoteroPane ? window.ZoteroPane.getSelectedCollection() : null;
          if (collection) {
            this.openTodolist({ mode: 'create_from_collection', collectionName: collection.name }, window);
          }
        });
        collectionMenu.appendChild(colItem);
        windowElements.push(colItem);

        // Batch reading plan for all papers in collection
        const colPlanItem = doc.createXULElement
          ? doc.createXULElement('menuitem')
          : doc.createElement('menuitem');
        colPlanItem.id = 'todolist-collectionmenu-plan';
        colPlanItem.setAttribute('label', '⚡ 为此分类所有文献批量生成研读清单');
        colPlanItem.setAttribute('image', `${CHROME_ROOT}icons/todolist.svg`);
        colPlanItem.setAttribute('class', 'menuitem-iconic');
        colPlanItem.addEventListener('command', () => {
          const collection = window.ZoteroPane ? window.ZoteroPane.getSelectedCollection() : null;
          if (collection) {
            this.createCollectionReadingPlan(collection, window);
          }
        });
        collectionMenu.appendChild(colPlanItem);
        windowElements.push(colPlanItem);
      }

      // 4. Inject Tab Icon Style
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

      // 4b. Add to Reader Context Menu (PDF 阅读器右键菜单)
      try {
        const readerContextMenu = doc.getElementById('reader-context-menu') || doc.getElementById('viewer-context-menu');
        if (readerContextMenu) {
          const readerItem = doc.createXULElement
            ? doc.createXULElement('menuitem')
            : doc.createElement('menuitem');
          readerItem.id = 'todolist-reader-context-create';
          readerItem.setAttribute('label', '添加到 Todolist 研读待办');
          readerItem.setAttribute('image', `${CHROME_ROOT}icons/todolist.svg`);
          readerItem.setAttribute('class', 'menuitem-iconic');
          readerItem.addEventListener('command', () => {
            this.createTaskFromReader(window);
          });
          readerContextMenu.appendChild(readerItem);
          windowElements.push(readerItem);
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

      // 6. Host-level listener for Todolist iframe postMessages
      const handleHostMessage = (event) => {
        try {
          const iframe = window.document.getElementById('todolist-tab-iframe');
          if (!iframe?.contentWindow || event.source !== iframe.contentWindow) return;
          const data = event.data;
          if (!data || typeof data !== 'object') return;

          // A. Handshake Ready
          if (data.type === 'TODOLIST_READY') {
            iframe._todolistReady = true;
            this.loadData().then((storedData) => {
              iframe.contentWindow.postMessage({
                type: 'TODOLIST_INIT_DATA',
                data: storedData,
                pending: iframe._todolistPending
              }, '*');
              iframe._todolistPending = null;
            });
            return;
          }

          // B. Storage Save Request
          if (data.type === 'TODOLIST_STORAGE_SET' && data.payload) {
            this.saveData(data.payload).then(() => {
              if (data.requestId) {
                iframe.contentWindow.postMessage({
                  type: 'TODOLIST_STORAGE_SET_RESULT',
                  requestId: data.requestId,
                  success: true
                }, '*');
              }
            });
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
            iframe.contentWindow.postMessage({
              type: 'TODOLIST_GET_ACTIVE_ITEM_RESULT',
              requestId: data.requestId,
              item: activeItem ? serializeLiteratureItem(activeItem) : null
            }, '*');
            return;
          }

          // G. Sync tasks to Zotero child note
          if (data.type === 'TODOLIST_SYNC_NOTE' && data.key) {
            const item = resolveItemReference(data.key, data.libraryID);
            if (item) {
              this.syncTasksToChildNote(item).then((note) => {
                if (data.requestId && iframe?.contentWindow) {
                  iframe.contentWindow.postMessage({
                    type: 'TODOLIST_SYNC_NOTE_RESULT',
                    requestId: data.requestId,
                    success: Boolean(note),
                    noteId: note?.id
                  }, '*');
                }
              });
            }
            return;
          }

          // H. Get Zotero Collections
          if (data.type === 'TODOLIST_GET_COLLECTIONS') {
            const collections = this.getZoteroCollections(data.libraryID);
            if (data.requestId && iframe?.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'TODOLIST_GET_COLLECTIONS_RESULT',
                requestId: data.requestId,
                collections
              }, '*');
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

      if (doc.getElementById('todolist-toolbar-button')) return;

      const anchor =
        doc.getElementById('zotero-tb-attachment') ||
        doc.getElementById('zotero-tb-note') ||
        doc.getElementById('zotero-tb-lookup') ||
        doc.getElementById('zotero-tb-add') ||
        doc.querySelector('#zotero-item-toolbar toolbarbutton:last-of-type') ||
        doc.querySelector('#zotero-items-toolbar toolbarbutton:last-of-type');

      const toolbar =
        (anchor && anchor.parentNode) ||
        doc.getElementById('zotero-item-toolbar') ||
        doc.getElementById('zotero-items-toolbar') ||
        doc.getElementById('zotero-tb') ||
        doc.getElementById('zotero-toolbar') ||
        doc.querySelector('toolbar');

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

      const btn = doc.createXULElement
        ? doc.createXULElement('toolbarbutton')
        : doc.createElement('toolbarbutton');

      btn.id = 'todolist-toolbar-button';
      btn.setAttribute('label', 'Todolist');
      btn.setAttribute('tooltiptext', '打开 Todolist 学术任务看板 (Ctrl+Alt+T)');
      btn.setAttribute('image', `${CHROME_ROOT}icons/todolist.svg`);
      btn.setAttribute('class', 'zotero-tb-button toolbarbutton-1 chromeclass-toolbar-additional');
      btn.setAttribute(
        'style',
        'cursor: pointer; margin: 0 3px; display: inline-flex; align-items: center; justify-content: center;'
      );

      btn.addEventListener('command', (e) => {
        if (e) {
          e.preventDefault?.();
          e.stopPropagation?.();
        }
        this.triggerTodolistOpen(window);
      });

      if (anchor && anchor.nextSibling) {
        toolbar.insertBefore(btn, anchor.nextSibling);
      } else {
        toolbar.appendChild(btn);
      }

      windowElements.push(btn);
    },

    removeFromWindow(window) {
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
    },

    getSelectedRegularItems(window) {
      const pane =
        window?.ZoteroPane ||
        (Zotero.getActiveZoteroPane ? Zotero.getActiveZoteroPane() : null) ||
        (Zotero.getMainWindow ? Zotero.getMainWindow().ZoteroPane : null);
      const rawSelection = pane && typeof pane.getSelectedItems === 'function' ? pane.getSelectedItems() : [];
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

    async createReadingMilestones(item, window = null) {
      const meta = serializeLiteratureItem(item);
      if (!meta) return;

      const data = await this.loadData();
      const parentTaskId = 'task_' + Date.now();
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

      data.tasks.push(mainTask);
      await this.saveData({ tasks: data.tasks });

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
        const win = targetWindow || (Zotero.getMainWindow ? Zotero.getMainWindow() : null);
        let preferredWindowMode = 'tab';
        try {
          if (Zotero.Prefs) {
            preferredWindowMode = Zotero.Prefs.get('extensions.todolist.windowMode', true) || 'tab';
          }
        } catch (_) {}

        const effectiveMode = options.targetMode || preferredWindowMode;
        if (effectiveMode === 'window') {
          this.openStandaloneWindow(options, win, 'window');
          return;
        } else if (effectiveMode === 'subwindow') {
          this.openStandaloneWindow(options, win, 'subwindow');
          return;
        }

        const tabs = win?.Zotero_Tabs || (Zotero.getMainWindow && Zotero.getMainWindow().Zotero_Tabs);
        if (tabs && typeof tabs.add === 'function') {
          // Check if Todolist tab is already open
          if (Array.isArray(tabs._tabs)) {
            const existingTab = tabs._tabs.find((t) => t && t.type === 'todolist');
            if (existingTab) {
              tabs.select(existingTab.id);
              if (win && win.focus) win.focus();

              const iframe = win.document.getElementById('todolist-tab-iframe') ||
                (existingTab.container && existingTab.container.querySelector('iframe'));
              if (iframe && iframe.contentWindow && iframe._todolistReady) {
                iframe.contentWindow.postMessage({ type: 'TODOLIST_NAVIGATE', options }, '*');
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
            const doc = container.ownerDocument || win.document;
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
                }
              } catch (_) {}
            });

            container.appendChild(iframe);
          }

          if (win && win.focus) win.focus();
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

        const win = ww.openWindow(
          targetWindow || (Zotero.getMainWindow ? Zotero.getMainWindow() : null),
          url,
          windowName,
          features,
          { Zotero, options: { ...options, currentWindowType: windowType } }
        );
        if (win && win.focus) win.focus();
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
      // Unregister data listeners
      this._dataListeners.clear();

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
