// App entry point - Initialize all modules

(async function() {
  'use strict';

  // Global error handler
  window.onerror = function(message, source, lineno, colno, error) {
    console.error('Global error:', { message, source, lineno, colno, error });
    showErrorUI('应用发生错误，请刷新页面重试');
    return false;
  };

  window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    if (typeof UI !== 'undefined') UI.showToast('部分操作未完成，错误详情已记录到控制台');
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    const loadingEl = document.getElementById('loading-state');
    const mainEl = document.querySelector('.page-container, .main-content');

    try {
      // Show loading state
      if (loadingEl) loadingEl.classList.remove('hidden');

      await Advanced.init();
      await Tags.init();
      await TimeTracking.init();
      await Modal.init();
      Calendar.init();
      await UI.init();

      await Notifications.requestPermission();

      Notifications.startScheduler();
      await Notifications.checkScheduled();

      // Hide loading state
      if (loadingEl) loadingEl.classList.add('hidden');
      if (mainEl) mainEl.style.opacity = '1';

      // Show first-time tips
      showFirstTimeTips();

      console.log('Todolist extension initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Todolist extension:', error);
      showErrorUI('初始化失败，请刷新页面重试');
    }
  }

  function showErrorUI(message) {
    const loadingEl = document.getElementById('loading-state');
    if (loadingEl) {
      loadingEl.innerHTML = `
        <div class="error-state">
          <svg viewBox="0 0 24 24" width="48" height="48">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <p>${message}</p>
          <button onclick="location.reload()" class="btn-primary">刷新页面</button>
        </div>
      `;
      loadingEl.classList.remove('hidden');
    }
  }

  async function showFirstTimeTips() {
    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get('firstTimeShown', resolve);
      });

      if (!result.firstTimeShown) {
        // Show welcome tip
        setTimeout(() => {
          UI.showToast('💡 按 ? 键查看快捷键帮助');
        }, 2000);

        await chrome.storage.local.set({ firstTimeShown: true });
      }
    } catch (e) {
      // Ignore errors
    }
  }

})();
