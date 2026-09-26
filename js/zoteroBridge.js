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
      document.documentElement.classList.add('zotero-env');
      this.sendToHost({ type: 'TODOLIST_READY' });
      console.log('[Todolist] Running in Zotero environment');
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
      if (data.type === 'TODOLIST_INIT_DATA') {
        if (data.data && typeof Storage !== 'undefined' && Storage._zoteroCache) {
          Storage._zoteroCache = data.data;
        }
        if (data.pending) {
          this.handleHostNavigation(data.pending);
        }
      }

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
          case 'TODOLIST_SWITCH_WINDOW_MODE':
            todolist.switchWindowMode?.(msg.mode, window);
            break;
          case 'TODOLIST_OPEN_PREFERENCES':
            todolist.openPreferencesPane?.(mainWin || window);
            break;
          case 'TODOLIST_LOCATE_ITEM': {
            const item = todolist.resolveItemReference?.(msg.key, msg.libraryID);
            if (item) {
              const pane = mainWin?.ZoteroPane || window.Zotero.getActiveZoteroPane?.();
              pane?.selectItem?.(item.id);
            }
            break;
          }
          case 'TODOLIST_OPEN_PDF': {
            const item = todolist.resolveItemReference?.(msg.key, msg.libraryID);
            if (item) todolist.openPdfAttachment?.(item, msg.page);
            break;
          }
          case 'TODOLIST_EXPORT_DATA':
            todolist.exportData?.(msg.format || 'json');
            break;
          case 'TODOLIST_IMPORT_DATA':
            todolist.importDataFile?.(msg.mode || 'merge', mainWin || window);
            break;
          case 'TODOLIST_CLEAR_DATA':
            todolist.clearAllData?.(mainWin || window);
            break;
          case 'TODOLIST_COPY_SUMMARY':
            todolist.copyTasksSummary?.(mainWin || window);
            break;
          case 'TODOLIST_PRINT':
            todolist.printTasks?.(mainWin || window);
            break;
          case 'TODOLIST_SYNC_NOTE': {
            const item = todolist.resolveItemReference?.(msg.key, msg.libraryID);
            if (item) {
              todolist.syncTasksToChildNote?.(item).then((note) => {
                if (msg.requestId && this._requestCallbacks.has(msg.requestId)) {
                  const cb = this._requestCallbacks.get(msg.requestId);
                  this._requestCallbacks.delete(msg.requestId);
                  cb({ success: Boolean(note), noteKey: note?.key });
                }
              });
            }
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[ZoteroBridge] sendToHost failed:', e);
    }
  },

  handleHostNavigation(options) {
    if (!options) return;

    if (options.mode === 'create_from_item' && options.item) {
      const item = options.item;
      setTimeout(() => {
        if (typeof Modal !== 'undefined' && Modal.openAdd) {
          Modal.openAdd({
            title: `研读：${item.title}`,
            category: '论文研读',
            tags: item.tags || [],
            zoteroItemKey: item.key,
            zoteroItemTitle: item.title,
            zoteroAuthors: item.authors,
            zoteroYear: item.year,
            zoteroUri: item.zoteroUri,
            zoteroPdfUri: item.pdfUri,
            academicType: 'literature_reading'
          });
        }
      }, 300);
    } else if (options.mode === 'create_from_collection' && options.collectionName) {
      setTimeout(() => {
        if (typeof Modal !== 'undefined' && Modal.openAdd) {
          Modal.openAdd({
            title: `专题研读：${options.collectionName}`,
            category: '论文研读',
            tags: [options.collectionName]
          });
        }
      }, 300);
    } else if (options.mode === 'filter_item' && options.itemKey) {
      setTimeout(() => {
        if (typeof TaskManager !== 'undefined') {
          TaskManager.setLiteratureFilter(options.itemKey);
          if (typeof UI !== 'undefined' && UI.render) {
            UI.render();
          }
        }
      }, 300);
    } else if (options.mode === 'open_modal_prefill' && options.prefill) {
      setTimeout(() => {
        if (typeof Modal !== 'undefined' && Modal.openAdd) {
          Modal.openAdd(options.prefill);
        }
      }, 300);
    } else if (options.mode === 'view_task' && options.taskId) {
      setTimeout(() => {
        const card = document.querySelector(`.task-card[data-task-id="${options.taskId}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.outline = '2px solid var(--primary, #059669)';
          setTimeout(() => { card.style.outline = ''; }, 2500);
        }
      }, 400);
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

