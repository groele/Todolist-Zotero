// Desktop/widescreen index page behavior.
(function() {
  function updateHeaderTitle(view) {
    const titleEl = document.getElementById('current-view-title');
    if (!titleEl || typeof UI === 'undefined') return;

    if (view === 'calendar') {
      titleEl.textContent = '日历视图';
    } else if (view === 'kanban') {
      titleEl.textContent = '看板分栏';
    } else if (view === 'stats') {
      titleEl.textContent = '统计分析';
    } else {
      const filterNames = {
        all: '全部任务',
        literature: '文献研读',
        today: '今天任务',
        upcoming: '即将到来',
        overdue: '逾期任务',
        completed: '已完成'
      };
      titleEl.textContent = filterNames[UI.currentFilter] || '任务列表';
    }
  }

  function bindIndexLayout() {

    if (typeof UI !== 'undefined' && !UI._indexLayoutWrapped) {
      const originalSwitchView = UI.switchView.bind(UI);
      UI.switchView = async function(view) {
        const result = await originalSwitchView(view);

        document.querySelectorAll('.sidebar-view-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.view === view);
        });

        updateHeaderTitle(view);
        return result;
      };
      UI._indexLayoutWrapped = true;
    }

    document.querySelectorAll('.sidebar-view-btn').forEach(btn => {
      if (btn.dataset.indexLayoutBound) return;
      btn.addEventListener('click', async () => {
        const view = btn.dataset.view;
        if (typeof UI !== 'undefined') {
          await UI.switchView(view);
        }
      });
      btn.dataset.indexLayoutBound = 'true';
    });

    document.querySelectorAll('.filter-tabs .tab').forEach(tab => {
      if (tab.dataset.indexLayoutBound) return;
      tab.addEventListener('click', async () => {
        if (typeof UI !== 'undefined' && UI.currentView !== 'list') {
          await UI.switchView('list');
        }
        updateHeaderTitle('list');
      });
      tab.dataset.indexLayoutBound = 'true';
    });

    const sidebar = document.getElementById('sidebar');
    const appLayout = document.querySelector('.app-layout');
    const sidebarToggle = document.getElementById('btn-sidebar-toggle');
    const menuToggle = document.getElementById('btn-menu-toggle');
    const closeSidebar = document.getElementById('btn-close-sidebar');

    if (sidebarToggle && sidebar && appLayout && !sidebarToggle.dataset.indexLayoutBound) {
      let expanded = false;
      const applyExpanded = value => {
        expanded = Boolean(value);
        appLayout.classList.toggle('sidebar-expanded', expanded);
        sidebarToggle.setAttribute('aria-expanded', String(expanded));
        const label = expanded ? '收起侧边工具栏' : '展开侧边工具栏';
        sidebarToggle.setAttribute('aria-label', label);
        sidebarToggle.title = label;
        sidebarToggle.querySelector('path')?.setAttribute('d', expanded
          ? 'M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z'
          : 'M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z');
      };

      sidebarToggle.disabled = true;
      sidebarToggle.addEventListener('click', async () => {
        const previous = expanded;
        const next = !expanded;
        applyExpanded(next);
        sidebarToggle.disabled = true;
        try {
          await Storage.saveSettings({ sidebarExpanded: next });
        } catch (error) {
          console.error('Failed to save sidebar layout preference:', error);
          applyExpanded(previous);
          if (typeof UI !== 'undefined') UI.showToast('侧边栏设置保存失败，已恢复原状态');
        } finally {
          sidebarToggle.disabled = false;
        }
      });

      Storage.subscribe(data => {
        if (typeof data.settings?.sidebarExpanded === 'boolean') {
          applyExpanded(data.settings.sidebarExpanded);
        }
      });
      Storage.getSettings()
        .then(settings => applyExpanded(settings.sidebarExpanded))
        .catch(error => console.error('Failed to load sidebar layout preference:', error))
        .finally(() => { sidebarToggle.disabled = false; });
      sidebarToggle.dataset.indexLayoutBound = 'true';
    }

    const setMobileSidebarOpen = open => {
      sidebar?.classList.toggle('open', open);
      menuToggle?.setAttribute('aria-expanded', String(open));
      menuToggle?.setAttribute('aria-label', open ? '关闭侧边栏' : '展开侧边栏');
      if (menuToggle) menuToggle.title = open ? '关闭侧边栏' : '展开侧边栏';
    };

    if (menuToggle && sidebar && !menuToggle.dataset.indexLayoutBound) {
      menuToggle.addEventListener('click', e => {
        e.stopPropagation();
        setMobileSidebarOpen(true);
      });
      menuToggle.dataset.indexLayoutBound = 'true';
    }

    if (closeSidebar && sidebar && !closeSidebar.dataset.indexLayoutBound) {
      closeSidebar.addEventListener('click', () => {
        setMobileSidebarOpen(false);
      });
      closeSidebar.dataset.indexLayoutBound = 'true';
    }

    if (!document.documentElement.dataset.indexLayoutOutsideBound) {
      document.addEventListener('click', e => {
        if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open')) {
          if (!sidebar.contains(e.target) && (!menuToggle || !menuToggle.contains(e.target))) {
            setMobileSidebarOpen(false);
          }
        }
      });
      document.documentElement.dataset.indexLayoutOutsideBound = 'true';
    }

    if (!document.documentElement.dataset.indexLayoutEscapeBound) {
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && window.innerWidth <= 768 && sidebar?.classList.contains('open')) {
          setMobileSidebarOpen(false);
          menuToggle?.focus();
        }
      });
      document.documentElement.dataset.indexLayoutEscapeBound = 'true';
    }

    const mobileAdd = document.getElementById('btn-mobile-add');
    if (mobileAdd && !mobileAdd.dataset.indexLayoutBound) {
      mobileAdd.addEventListener('click', () => {
        if (typeof Modal !== 'undefined') {
          Modal.openAdd();
        }
      });
      mobileAdd.dataset.indexLayoutBound = 'true';
    }

    setTimeout(() => {
      if (typeof UI !== 'undefined') {
        updateHeaderTitle(UI.currentView);
      }
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindIndexLayout);
  } else {
    bindIndexLayout();
  }
})();
