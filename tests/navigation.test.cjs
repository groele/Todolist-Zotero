const test = require('node:test');
const assert = require('node:assert/strict');
const { page, waitFor } = require('./helpers.cjs');

test('desktop sidebar expands, persists the preference, and rolls back failed writes', async t => {
  const p = await page('index.html', { settings: { sidebarExpanded: true } });
  t.after(p.close);
  const layout = p.doc.querySelector('.app-layout');
  const toggle = p.doc.getElementById('btn-sidebar-toggle');
  assert(toggle);
  await waitFor(() => !toggle.disabled, 'sidebar preference loaded');

  assert(layout.classList.contains('sidebar-expanded'));
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle.getAttribute('aria-label'), '收起侧边工具栏');

  toggle.click();
  await waitFor(() => !toggle.disabled && !layout.classList.contains('sidebar-expanded'), 'sidebar collapsed');
  assert.equal((await p.Storage.getSettings()).sidebarExpanded, false);

  p.Storage.acceptData({ tasks: p.TaskManager.getTasks(), settings: { sidebarExpanded: true } });
  await waitFor(() => layout.classList.contains('sidebar-expanded'), 'remote sidebar preference applied');
  p.Storage.saveSettings = async () => { throw new Error('simulated preference write failure'); };
  toggle.click();
  await waitFor(() => !toggle.disabled, 'failed preference write recovered');
  assert.equal(layout.classList.contains('sidebar-expanded'), true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(p.doc.getElementById('toast-message').textContent, '侧边栏设置保存失败，已恢复原状态');
});

test('mobile navigation drawer exposes state and closes with Escape', async t => {
  const p = await page('index.html');
  t.after(p.close);
  Object.defineProperty(p.win, 'innerWidth', { configurable: true, value: 600 });
  const sidebar = p.doc.getElementById('sidebar');
  const open = p.doc.getElementById('btn-menu-toggle');
  open.click();

  assert(sidebar.classList.contains('open'));
  assert.equal(open.getAttribute('aria-expanded'), 'true');
  p.doc.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  assert.equal(sidebar.classList.contains('open'), false);
  assert.equal(open.getAttribute('aria-expanded'), 'false');
  assert.equal(p.doc.activeElement, open);
});
