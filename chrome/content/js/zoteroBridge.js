// Zotero Bridge - Facilitates communication between Todolist UI and Zotero host

const ZoteroBridge = {
  isZotero: false,
  _activeItem: null,
  _pendingRequestId: 0,
  _requestCallbacks: new Map(),

  init() {
    this.detectEnvironment();
    this.setupMessageListener();

    if (this.isZotero) {
      this._readyPromise = new Promise((resolve, reject) => {
        this._resolveReady = resolve;
        this._rejectReady = reject;
        this._readyTimer = setTimeout(() => reject(new Error('无法连接 Zotero 数据，请重新打开待办窗口')), 5000);
      });
      this._readyPromise.catch(() => {});
      const host = Storage.getZoteroInstance()?.Todolist;
      if (host?.registerDataListener) {
        this._dataListener = data => Storage.acceptData(data);
        host.registerDataListener(this._dataListener);
        window.addEventListener('unload', () => host.unregisterDataListener(this._dataListener), { once: true });
      }
      document.documentElement.classList.add('zotero-env');
      this.sendToHost({ type: 'TODOLIST_READY' });
      console.log('[Todolist] Running in Zotero environment');
    }

    // Process initial options from window.arguments or window._todolistPending
    const initialOptions = window.arguments?.[0]?.options || window._todolistPending;
    if (initialOptions && initialOptions.mode && initialOptions.mode !== 'open') {
      this.handleHostNavigation(initialOptions);
    }
  },

  detectEnvironment() {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search || '');
        const mode = params.get('mode');
        if (mode === 'subwindow' || window.arguments?.[0]?.options?.currentWindowType === 'subwindow') {
          document.documentElement.classList.add('subwindow-mode');
          document.body?.classList?.add('subwindow-mode');
        }

        if (window.arguments && window.arguments[0] && window.arguments[0].Zotero) {
          window.Zotero = window.arguments[0].Zotero;
          this.isZotero = true;
          return;
        }
        if (window.Zotero) {
          this.isZotero = true;
          return;
        }
        if (window.parent && window.parent !== window && window.parent.Zotero) {
          window.Zotero = window.parent.Zotero;
          this.isZotero = true;
          return;
        }
        // In iframe under chrome://todolist/
        if (window.location && (window.location.protocol === 'chrome:' || window.parent !== window)) {
          this.isZotero = true;
          return;
        }
      }
    } catch (_) {}
    this.isZotero = false;
  },

  setupMessageListener() {
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      // Handle async request callbacks
      if (data.requestId && this._requestCallbacks.has(data.requestId)) {
        const cb = this._requestCallbacks.get(data.requestId);
        this._requestCallbacks.delete(data.requestId);
        cb(data);
        return;
      }

      // Handle initial data handshake
      if (data.type === 'TODOLIST_INIT_ERROR') {
        clearTimeout(this._readyTimer);
        this._rejectReady?.(new Error(data.error || 'Zotero 数据初始化失败'));
      }
      if (data.type === 'TODOLIST_INIT_DATA') {
        if (data.data && typeof Storage !== 'undefined') {
          Storage.acceptData(data.data);
          clearTimeout(this._readyTimer);
          this._resolveReady?.();
        }
        if (data.pending) {
          this.handleHostNavigation(data.pending);
        }
      }

      if (data.type === 'TODOLIST_DATA_CHANGED' && data.data) Storage.acceptData(data.data);

      // Handle direct navigation request from host
      if (data.type === 'TODOLIST_NAVIGATE') {
        this.handleHostNavigation(data.options);
      }
    });
  },

  sendToHost(msg) {
    if (!this.isZotero) return;
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, '*');
        return;
      }
      if (window.opener) {
        window.opener.postMessage(msg, '*');
        return;
      }
      if (window.Zotero && window.Zotero.Todolist) {
        const todolist = window.Zotero.Todolist;
        const mainWin = window.Zotero.getMainWindow ? window.Zotero.getMainWindow() : null;
        switch (msg.type) {
          case 'TODOLIST_READY': {
            this.runHostAction(msg, async () => {
              const storedData = await todolist.loadData();
              window.postMessage({
                type: 'TODOLIST_INIT_DATA',
                data: storedData,
                pending: window.arguments?.[0]?.options || window._todolistPending || null
              }, '*');
            });
            break;
          }
          case 'TODOLIST_SWITCH_WINDOW_MODE':
            this.runHostAction(msg, () => todolist.switchWindowMode?.(msg.mode, window));
            break;
          case 'TODOLIST_OPEN_PREFERENCES':
            this.runHostAction(msg, () => todolist.openPreferencesPane?.(mainWin || window));
            break;
          case 'TODOLIST_LOCATE_ITEM': {
            const item = todolist.resolveItemReference?.(msg.key, msg.libraryID);
            if (item) {
              const pane = mainWin?.ZoteroPane || window.Zotero.getActiveZoteroPane?.();
              this.runHostAction(msg, () => pane?.selectItem?.(item.id));
            }
            break;
          }
          case 'TODOLIST_OPEN_PDF': {
            const item = todolist.resolveItemReference?.(msg.key, msg.libraryID);
            if (item) this.runHostAction(msg, () => todolist.openPdfAttachment?.(item, msg.page));
            break;
          }
          case 'TODOLIST_EXPORT_DATA':
            this.runHostAction(msg, () => todolist.exportData?.(msg.format || 'json'));
            break;
          case 'TODOLIST_IMPORT_DATA':
            this.runHostAction(msg, () => todolist.importDataFile?.(msg.mode || 'merge', mainWin || window));
            break;
          case 'TODOLIST_CLEAR_DATA':
            this.runHostAction(msg, () => todolist.clearAllData?.(mainWin || window));
            break;
          case 'TODOLIST_COPY_SUMMARY':
            this.runHostAction(msg, () => todolist.copyTasksSummary?.(mainWin || window));
            break;
          case 'TODOLIST_PRINT':
            this.runHostAction(msg, () => todolist.printTasks?.(mainWin || window));
            break;
          case 'TODOLIST_SYNC_NOTE': {
            const item = todolist.resolveItemReference?.(msg.key, msg.libraryID);
            if (item) {
              this.runHostAction(msg, async () => {
                const note = await todolist.syncTasksToChildNote(item);
                if (msg.requestId && this._requestCallbacks.has(msg.requestId)) {
                  const cb = this._requestCallbacks.get(msg.requestId);
                  this._requestCallbacks.delete(msg.requestId);
                  cb({ success: Boolean(note), noteKey: note?.key });
                }
              });
            }
            break;
          }
          case 'TODOLIST_GET_COLLECTIONS': {
            const collections = todolist.getZoteroCollections?.(msg.libraryID) || [];
            if (msg.requestId && this._requestCallbacks.has(msg.requestId)) {
              const cb = this._requestCallbacks.get(msg.requestId);
              this._requestCallbacks.delete(msg.requestId);
              cb({ collections });
            }
            break;
          }
          case 'TODOLIST_GET_ACTIVE_ITEM': {
            const activeItem = todolist.getCurrentActiveItem?.(mainWin || window);
            if (msg.requestId && this._requestCallbacks.has(msg.requestId)) {
              const cb = this._requestCallbacks.get(msg.requestId);
              this._requestCallbacks.delete(msg.requestId);
              cb({ item: activeItem ? todolist.serializeLiteratureItem(activeItem) : null });
            }
            break;
          }
        }
      }
    } catch (e) {
      this.failHostAction(msg, e);
    }
  },

  runHostAction(msg, callback) {
    return Promise.resolve().then(callback).catch(error => this.failHostAction(msg, error));
  },

  failHostAction(msg, error) {
    if (msg.type === 'TODOLIST_READY') {
      clearTimeout(this._readyTimer);
      this._rejectReady?.(error);
    }
    const callback = this._requestCallbacks.get(msg.requestId);
    if (callback) {
      this._requestCallbacks.delete(msg.requestId);
      callback({ success: false, error: String(error?.message || error) });
    }
    if (typeof Diagnostics !== 'undefined') Diagnostics.report('Zotero 桥接 ' + msg.type, error);
    else console.error('[Todolist] Zotero bridge ' + msg.type, error);
  },

  whenReady() { return this._readyPromise || Promise.resolve(); },

  saveStorage(payload) {
    return new Promise((resolve, reject) => {
      const requestId = 'save_' + (++this._pendingRequestId) + '_' + Date.now();
      const timer = setTimeout(() => {
        this._requestCallbacks.delete(requestId);
        reject(new Error('Zotero 保存确认超时，请重新打开窗口检查数据'));
      }, 5000);
      this._requestCallbacks.set(requestId, data => {
        clearTimeout(timer);
        if (data.success && data.data) resolve(data.data);
        else reject(new Error(data.error || 'Zotero 保存失败'));
      });
      this.sendToHost({ type: 'TODOLIST_STORAGE_SET', requestId, payload });
    });
  },

  executeWhenReady(fn) {
    const tryRun = (attempt = 0) => {
      const hasModal = typeof Modal !== 'undefined';
      const hasDialog = hasModal && (Modal.dialog || document.getElementById('task-modal'));
      if (document.readyState !== 'loading' && hasModal && hasDialog) {
        try {
          if (!Modal.dialog) {
            Modal.ensureInitialized?.();
          }
          fn();
        } catch (err) {
          console.error('[ZoteroBridge] Navigation action execution error:', err);
        }
      } else if (attempt < 40) {
        setTimeout(() => tryRun(attempt + 1), 80);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => tryRun(0), { once: true });
    } else {
      tryRun(0);
    }
  },

  handleHostNavigation(options) {
    if (!options) return;

    if (options.mode === 'create_from_item' && options.item) {
      const item = options.item;
      this.executeWhenReady(() => {
        Modal.openAdd({
          title: `研读：${item.title}`,
          category: '论文研读',
          tags: item.tags || [],
          zoteroItemKey: item.key,
          zoteroItemTitle: item.title,
          zoteroAuthors: item.authors,
          zoteroYear: item.year,
          zoteroPublication: item.publication || '',
          zoteroUri: item.zoteroUri,
          zoteroPdfUri: item.pdfUri,
          academicType: 'literature_reading'
        });
      });
    } else if (options.mode === 'create_from_collection' && options.collectionName) {
      this.executeWhenReady(() => {
        Modal.openAdd({
          title: `专题研读：${options.collectionName}`,
          category: '论文研读',
          tags: [options.collectionName]
        });
      });
    } else if (options.mode === 'filter_item' && options.itemKey) {
      this.executeWhenReady(() => {
        if (typeof TaskManager !== 'undefined') {
          TaskManager.setLiteratureFilter(options.itemKey);
          if (typeof UI !== 'undefined' && UI.render) {
            UI.render();
          }
        }
      });
    } else if (options.mode === 'open_modal_prefill' && options.prefill) {
      this.executeWhenReady(() => {
        Modal.openAdd(options.prefill);
      });
    } else if (options.mode === 'view_task' && options.taskId) {
      this.executeWhenReady(() => {
        const card = document.querySelector(`.task-card[data-task-id="${options.taskId}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.outline = '2px solid var(--primary, #059669)';
          setTimeout(() => { card.style.outline = ''; }, 2500);
        }
      });
    }
  },

  locateItem(key, libraryID) {
    this.sendToHost({ type: 'TODOLIST_LOCATE_ITEM', key, libraryID });
  },

  openPdf(key, libraryID, page = null) {
    this.sendToHost({ type: 'TODOLIST_OPEN_PDF', key, libraryID, page });
  },

  openPreferences() {
    this.sendToHost({ type: 'TODOLIST_OPEN_PREFERENCES' });
  },

  switchWindowMode(mode) {
    this.sendToHost({ type: 'TODOLIST_SWITCH_WINDOW_MODE', mode });
  },

  exportData(format = 'json') {
    this.sendToHost({ type: 'TODOLIST_EXPORT_DATA', format });
  },

  async syncChildNote(key, libraryID) {
    if (!this.isZotero) return { success: false };
    return new Promise((resolve) => {
      const requestId = 'sync_' + (++this._pendingRequestId) + '_' + Date.now();
      const timer = setTimeout(() => {
        this._requestCallbacks.delete(requestId);
        resolve({ success: false });
      }, 3000);
      this._requestCallbacks.set(requestId, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      this.sendToHost({ type: 'TODOLIST_SYNC_NOTE', key, libraryID, requestId });
    });
  },

  async getCollections(libraryID) {
    if (!this.isZotero) return [];
    return new Promise((resolve) => {
      const requestId = 'col_' + (++this._pendingRequestId) + '_' + Date.now();
      const timer = setTimeout(() => {
        this._requestCallbacks.delete(requestId);
        resolve([]);
      }, 3000);
      this._requestCallbacks.set(requestId, (data) => {
        clearTimeout(timer);
        resolve(data.collections || []);
      });
      this.sendToHost({ type: 'TODOLIST_GET_COLLECTIONS', libraryID, requestId });
    });
  },

  createCollectionPlan(collectionID) {
    this.sendToHost({ type: 'TODOLIST_CREATE_COLLECTION_PLAN', collectionID });
  },

  async getActiveItem() {
    if (!this.isZotero) return null;
    return new Promise((resolve) => {
      const requestId = 'req_' + (++this._pendingRequestId) + '_' + Date.now();
      const timer = setTimeout(() => {
        this._requestCallbacks.delete(requestId);
        resolve(null);
      }, 2000);

      this._requestCallbacks.set(requestId, (data) => {
        clearTimeout(timer);
        resolve(data.item || null);
      });

      this.sendToHost({ type: 'TODOLIST_GET_ACTIVE_ITEM', requestId });
    });
  }
};

// Make accessible on window
window.ZoteroBridge = ZoteroBridge;

// Initialize ZoteroBridge immediately
ZoteroBridge.init();
