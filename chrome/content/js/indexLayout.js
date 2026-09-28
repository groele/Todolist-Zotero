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
    const menuToggle = document.getElementById('btn-menu-toggle');
    const closeSidebar = document.getElementById('btn-close-sidebar');

    if (menuToggle && sidebar && !menuToggle.dataset.indexLayoutBound) {
      menuToggle.addEventListener('click', e => {
        e.stopPropagation();
        sidebar.classList.add('open');
      });
      menuToggle.dataset.indexLayoutBound = 'true';
    }

    if (closeSidebar && sidebar && !closeSidebar.dataset.indexLayoutBound) {
      closeSidebar.addEventListener('click', () => {
        sidebar.classList.remove('open');
      });
      closeSidebar.dataset.indexLayoutBound = 'true';
    }

    if (!document.documentElement.dataset.indexLayoutOutsideBound) {
      document.addEventListener('click', e => {
        if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open')) {
          if (!sidebar.contains(e.target) && (!menuToggle || !menuToggle.contains(e.target))) {
            sidebar.classList.remove('open');
          }
        }
      });
      document.documentElement.dataset.indexLayoutOutsideBound = 'true';
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
