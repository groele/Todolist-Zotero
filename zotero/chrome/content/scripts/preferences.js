/* Todolist settings pane script for Zotero 7+ */
window.Todolist_Preferences = (() => {
  const PREFIX = 'extensions.todolist.';
  const HTML = 'http://www.w3.org/1999/xhtml';

  const DEFAULTS = {
    // Window Modes
    windowMode: 'tab',
    subwindowAlwaysOnTop: false,
    subwindowCompactMode: true,

    // Display & Views
    defaultView: 'list',
    theme: 'light',
    showCompleted: true,
    sortOrder: 'dueDate',
    showWelcomeOnStartup: true,

    // ItemPane Sidebar
    enableItemPane: true,
    itemPaneShowProgressBar: true,
    itemPaneShowSubtasks: true,
    locateOnTaskClick: true,
    dragDropFromLibrary: true,

    // Child Note Sync
    autoSyncChildNote: true,
    childNoteTitle: '📝 [Todolist] 研读清单与进度',
    childNoteIncludeSubtasks: true,
    childNoteIncludeQuotes: true,
    childNoteAutoUpdateOnSubtask: true,

    // Automated Tags
    autoTagOnCreate: true,
    tagForPending: '待研读',
    autoTagOnComplete: true,
    tagForCompleted: '精读已完成',
    autoTagFromItem: true,

    // Academic & Reader
    academicPresets: true,
    defaultTaskType: 'literature_reading',
    defaultPriority: 'medium',
    readerShortcutAction: 'create_instant',
    pdfReaderJumpPage: true,

    // Focus & Sound Alerts
    enableSound: true,
    pomodoroFocus: 25,
    pomodoroShortBreak: 5,
    pomodoroLongBreak: 15,
    dailySummary: false,
    summaryTime: '09:00',

    // Maintenance
    autoArchiveDays: 0
  };

  const FIELDS = {
    window: [
      ['windowMode', '工作区默认打开模式', 'select', [
        ['tab', '📑 Zotero 内部选项卡 (无缝融入主界面标签栏)'],
        ['subwindow', '🗗 伴读紧凑子窗口 (460×760，轻量浮动，边看文献边做任务)'],
        ['window', '⬚ 独立桌面大窗口 (1120×760，大屏全景规划)']
      ]],
      ['subwindowAlwaysOnTop', '伴读子窗口始终置顶 (Always on Top，悬浮于 PDF 阅读器之上)', 'check'],
      ['subwindowCompactMode', '伴读子窗口启用专属紧凑伴读布局 (自动折叠侧边栏与紧凑流式列表)', 'check'],
    ],
    view: [
      ['defaultView', '默认主视图', 'select', [
        ['list', '📋 任务清单列表'],
        ['kanban', '🔄 状态看板分栏'],
        ['calendar', '📅 学术日历视图'],
        ['stats', '📊 进度统计分析']
      ]],
      ['theme', '默认视觉主题', 'select', [
        ['light', '☀️ 清爽明亮'],
        ['dark', '🌙 专注暗黑'],
        ['auto', '🔄 跟随操作系统']
      ]],
      ['sortOrder', '任务列表默认排序', 'select', [
        ['dueDate', '按截止日期先后'],
        ['priority', '按重要紧急优先级'],
        ['created', '按创建时间倒序'],
        ['alpha', '按标题名称字母']
      ]],
      ['showCompleted', '默认在列表中显示已完成项', 'check'],
      ['showWelcomeOnStartup', '首次启动时显示使用技巧提示', 'check'],
    ],
    literature: [
      ['enableItemPane', '在文献右侧详情栏中展示“学术待办”区域', 'check'],
      ['itemPaneShowProgressBar', '在侧边详情栏中展示研读完成度彩色进度条', 'check'],
      ['itemPaneShowSubtasks', '在侧边详情栏中直接展开子任务里程碑与互动勾选框', 'check'],
      ['locateOnTaskClick', '点击待办卡片或文献徽标时，在 Zotero 文献库中高亮定位对应条目', 'check'],
      ['dragDropFromLibrary', '支持将文献条目直接从文献列表拖拽至待办看板创建研读任务', 'check'],
    ],
    sync: [
      ['autoSyncChildNote', '自动将研读任务与进度同步为文献子笔记 (原生支持 Zotero 云端全平台多端同步)', 'check'],
      ['childNoteTitle', '同步子笔记标题格式', 'text'],
      ['childNoteIncludeSubtasks', '同步子笔记中包含完整的子任务里程碑清单', 'check'],
      ['childNoteIncludeQuotes', '同步子笔记中包含 PDF 摘录内容与定位链接', 'check'],
      ['childNoteAutoUpdateOnSubtask', '在侧边栏或看板中勾选子任务时，即时触发子笔记云端同步', 'check'],
    ],
    tags: [
      ['autoTagOnCreate', '为文献添加待办时，自动在 Zotero 中为文献打上“待研读”标签', 'check'],
      ['tagForPending', '待研读状态标签名', 'text'],
      ['autoTagOnComplete', '文献所有研读待办均勾选完成时，自动打上“精读已完成”标签', 'check'],
      ['tagForCompleted', '已完成状态标签名', 'text'],
      ['autoTagFromItem', '从文献新建待办时自动继承文献在 Zotero 的标签', 'check'],
    ],
    academic: [
      ['academicPresets', '启用学术研读 5 大场景预设与快捷分类', 'check'],
      ['defaultTaskType', '默认待办学术类型', 'select', [
        ['literature_reading', '📖 论文研读与精读'],
        ['writing', '✍️ 论文写作与修改'],
        ['experiment', '🔬 实验设计与代码复现'],
        ['submission', '⏰ 会议期刊截稿 DDL'],
        ['peer_review', '📑 审稿与评阅']
      ]],
      ['defaultPriority', '新建任务默认优先级', 'select', [
        ['high', '高优先级 (P1)'],
        ['medium', '中优先级 (P2)'],
        ['low', '低优先级 (P3)']
      ]],
      ['readerShortcutAction', 'PDF 阅读器快捷键 (Ctrl+Shift+T) 行为', 'select', [
        ['create_instant', '⚡ 提取选中文字与页码立即生成待办'],
        ['open_modal', '✏️ 弹出待办编辑框供微调']
      ]],
      ['pdfReaderJumpPage', '点击待办的 PDF 伴读按钮时自动精准跳转至对应页码', 'check'],
    ],
    focus: [
      ['enableSound', '启用倒计时结束与重要提醒提示音效 (Web Audio 合成)', 'check'],
      ['pomodoroFocus', '番茄钟专注研读时长 (分钟)', 'select', [
        ['15', '15 分钟 (短平快任务)'],
        ['25', '25 分钟 (经典番茄钟，推荐)'],
        ['30', '30 分钟 (深度文献精读)'],
        ['45', '45 分钟 (长篇论文研读)'],
        ['60', '60 分钟 (代码复现冲刺)']
      ]],
      ['pomodoroShortBreak', '短休息时长 (分钟)', 'select', [
        ['3', '3 分钟'],
        ['5', '5 分钟 (经典推荐)'],
        ['10', '10 分钟']
      ]],
      ['pomodoroLongBreak', '长休息时长 (分钟)', 'select', [
        ['10', '10 分钟'],
        ['15', '15 分钟 (经典推荐)'],
        ['20', '20 分钟'],
        ['30', '30 分钟']
      ]],
      ['dailySummary', '启用每日学术待办晨报提醒', 'check'],
      ['summaryTime', '每日晨报提醒时间 (HH:MM)', 'text'],
    ],
    maintenance: [
      ['autoArchiveDays', '自动归档已完成任务', 'select', [
        ['0', '从不自动归档'],
        ['7', '7 天后自动归档'],
        ['14', '14 天后自动归档'],
        ['30', '30 天后自动归档']
      ]],
    ]
  };

  function getPref(key) {
    if (typeof Zotero === 'undefined' || !Zotero.Prefs) return DEFAULTS[key];
    try {
      const fullKey = PREFIX + key;
      const type = typeof DEFAULTS[key];
      if (type === 'boolean') {
        const val = Zotero.Prefs.get(fullKey, true);
        return typeof val === 'boolean' ? val : DEFAULTS[key];
      }
      if (type === 'number') {
        const val = Zotero.Prefs.get(fullKey, true);
        return Number.isFinite(Number(val)) ? Number(val) : DEFAULTS[key];
      }
      return Zotero.Prefs.get(fullKey, true) ?? DEFAULTS[key];
    } catch (_) {
      return DEFAULTS[key];
    }
  }

  function setPref(key, val) {
    if (typeof Zotero === 'undefined' || !Zotero.Prefs) return;
    try {
      Zotero.Prefs.set(PREFIX + key, val, true);
      // Synchronize with Todolist runtime if available
      if (Zotero.Todolist) {
        Zotero.Todolist.loadData().then((data) => {
          if (!data.settings) data.settings = {};
          data.settings[key] = val;
          Zotero.Todolist.saveData({ settings: data.settings });
        });
      }
    } catch (e) {
      Zotero.logError?.('[Todolist] Failed to set preference ' + key + ': ' + e);
    }
  }

  function renderGroup(doc, containerId, items) {
    const container = doc.getElementById(containerId);
    if (!container) return;
    container.replaceChildren();

    for (const [key, labelText, type, options] of items) {
      const currentVal = getPref(key);

      if (type === 'check') {
        const row = doc.createElementNS(HTML, 'label');
        row.className = 'todolist-check-row';

        const input = doc.createElementNS(HTML, 'input');
        input.type = 'checkbox';
        input.className = 'todolist-control';
        input.checked = Boolean(currentVal);
        input.addEventListener('change', () => {
          setPref(key, input.checked);
        });

        const span = doc.createElementNS(HTML, 'span');
        span.className = 'todolist-control-label';
        span.textContent = labelText;

        row.appendChild(input);
        row.appendChild(span);
        container.appendChild(row);
      } else if (type === 'select') {
        const row = doc.createElementNS(HTML, 'div');
        row.className = 'todolist-control-row';

        const label = doc.createElementNS(HTML, 'label');
        label.className = 'todolist-control-label';
        label.textContent = labelText;

        const select = doc.createElementNS(HTML, 'select');
        select.className = 'todolist-control';

        for (const [optVal, optLabel] of (options || [])) {
          const option = doc.createElementNS(HTML, 'option');
          option.value = optVal;
          option.textContent = optLabel;
          if (String(currentVal) === String(optVal)) {
            option.selected = true;
          }
          select.appendChild(option);
        }

        select.addEventListener('change', () => {
          const typedVal = typeof DEFAULTS[key] === 'number' ? Number(select.value) : select.value;
          setPref(key, typedVal);
        });

        row.appendChild(label);
        row.appendChild(select);
        container.appendChild(row);
      } else if (type === 'text') {
        const row = doc.createElementNS(HTML, 'div');
        row.className = 'todolist-control-row';

        const label = doc.createElementNS(HTML, 'label');
        label.className = 'todolist-control-label';
        label.textContent = labelText;

        const input = doc.createElementNS(HTML, 'input');
        input.type = 'text';
        input.className = 'todolist-control';
        input.value = String(currentVal ?? '');

        input.addEventListener('change', () => {
          setPref(key, input.value.trim());
        });

        row.appendChild(label);
        row.appendChild(input);
        container.appendChild(row);
      }
    }
  }

  async function renderCustomTagsManager(doc, win) {
    const listEl = doc.getElementById('todolist-pref-tags-list');
    if (!listEl) return;
    listEl.replaceChildren();

    const zot = win?.Zotero || window.Zotero || (typeof Zotero !== 'undefined' ? Zotero : null);
    if (!zot?.Todolist?.loadData) {
      const emptySpan = doc.createElementNS(HTML, 'span');
      emptySpan.textContent = '暂无自定义标签 (Zotero 就绪后即可管理)';
      emptySpan.style.color = '#94a3b8';
      emptySpan.style.fontSize = '12px';
      listEl.appendChild(emptySpan);
      return;
    }

    try {
      const data = await zot.Todolist.loadData();
      const tags = data.customTags || [];

      if (tags.length === 0) {
        const emptySpan = doc.createElementNS(HTML, 'span');
        emptySpan.textContent = '暂无自定义标签，可在下方输入名称并选择颜色创建。';
        emptySpan.style.color = '#94a3b8';
        emptySpan.style.fontSize = '12px';
        listEl.appendChild(emptySpan);
        return;
      }

      for (const tag of tags) {
        const badge = doc.createElementNS(HTML, 'span');
        badge.className = 'todolist-pref-tag-badge';
        badge.style.backgroundColor = (tag.color || '#3b82f6') + '20';
        badge.style.color = tag.color || '#3b82f6';
        badge.style.borderColor = (tag.color || '#3b82f6') + '40';

        const label = doc.createElementNS(HTML, 'span');
        label.textContent = `${tag.icon || '🏷️'} ${tag.name}`;
        badge.appendChild(label);

        const delBtn = doc.createElementNS(HTML, 'button');
        delBtn.type = 'button';
        delBtn.className = 'todolist-pref-tag-delete';
        delBtn.textContent = '×';
        delBtn.title = `删除标签 "${tag.name}"`;
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const current = await zot.Todolist.loadData();
          const updatedTags = (current.customTags || []).filter((t) => t.id !== tag.id);
          await zot.Todolist.saveData({ customTags: updatedTags });
          renderCustomTagsManager(doc, win);
        });
        badge.appendChild(delBtn);

        listEl.appendChild(badge);
      }
    } catch (err) {
      zot?.logError?.('[Todolist] renderCustomTagsManager error: ' + err);
    }
  }

  return {
    init(win) {
      const doc = win.document;
      const statusEl = doc.getElementById('todolist-pref-status');

      try {
        renderGroup(doc, 'todolist-pref-window', FIELDS.window);
        renderGroup(doc, 'todolist-pref-view', FIELDS.view);
        renderGroup(doc, 'todolist-pref-literature', FIELDS.literature);
        renderGroup(doc, 'todolist-pref-sync', FIELDS.sync);
        renderGroup(doc, 'todolist-pref-tags', FIELDS.tags);
        renderGroup(doc, 'todolist-pref-academic', FIELDS.academic);
        renderGroup(doc, 'todolist-pref-focus', FIELDS.focus);
        renderGroup(doc, 'todolist-pref-maintenance', FIELDS.maintenance);

        // Render Custom Tags Manager
        renderCustomTagsManager(doc, win);

        // Tag Color Palette Selection
        let activeTagColor = '#ef4444';
        const palette = doc.getElementById('todolist-tag-color-palette');
        if (palette) {
          const dots = palette.querySelectorAll('.todolist-pref-color-dot');
          dots.forEach((dot) => {
            dot.addEventListener('click', () => {
              dots.forEach((d) => d.classList.remove('active'));
              dot.classList.add('active');
              activeTagColor = dot.getAttribute('data-color') || '#ef4444';
            });
          });
        }

        // Add Tag Action
        const addTagBtn = doc.getElementById('todolist-btn-add-tag');
        const tagInput = doc.getElementById('todolist-new-tag-name');
        const handleAddTag = async () => {
          const name = tagInput?.value?.trim();
          if (!name) return;
          const zot = win?.Zotero || window.Zotero || (typeof Zotero !== 'undefined' ? Zotero : null);
          if (!zot?.Todolist) return;

          const current = await zot.Todolist.loadData();
          const tags = current.customTags || [];
          tags.push({
            id: 'tag_' + Date.now(),
            name: name,
            color: activeTagColor || '#3b82f6',
            icon: '🏷️'
          });
          await zot.Todolist.saveData({ customTags: tags });
          if (tagInput) tagInput.value = '';
          renderCustomTagsManager(doc, win);
        };

        addTagBtn?.addEventListener('click', handleAddTag);
        tagInput?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleAddTag();
          }
        });

        // Open Internal Tab
        const openTabBtn = doc.getElementById('todolist-btn-open-workspace');
        if (openTabBtn) {
          openTabBtn.addEventListener('click', () => {
            Zotero?.Todolist?.openTodolist?.({ targetMode: 'tab' }, win);
          });
        }

        // Open Subwindow
        const openSubBtn = doc.getElementById('todolist-btn-open-subwindow');
        if (openSubBtn) {
          openSubBtn.addEventListener('click', () => {
            Zotero?.Todolist?.openTodolist?.({ targetMode: 'subwindow' }, win);
          });
        }

        // Open Window
        const openWinBtn = doc.getElementById('todolist-btn-open-window');
        if (openWinBtn) {
          openWinBtn.addEventListener('click', () => {
            Zotero?.Todolist?.openTodolist?.({ targetMode: 'window' }, win);
          });
        }

        // Export JSON
        doc.getElementById('todolist-btn-export-json')?.addEventListener('click', () => {
          Zotero?.Todolist?.exportData?.('json');
        });

        // Export CSV
        doc.getElementById('todolist-btn-export-csv')?.addEventListener('click', () => {
          Zotero?.Todolist?.exportData?.('csv');
        });

        // Export Markdown
        doc.getElementById('todolist-btn-export-markdown')?.addEventListener('click', () => {
          Zotero?.Todolist?.exportData?.('markdown');
        });

        // Export TXT
        doc.getElementById('todolist-btn-export-txt')?.addEventListener('click', () => {
          Zotero?.Todolist?.exportData?.('txt');
        });

        // Import JSON
        doc.getElementById('todolist-btn-import-file')?.addEventListener('click', async () => {
          const mode = doc.getElementById('todolist-import-mode')?.value || 'merge';
          const status = doc.getElementById('todolist-import-status');
          if (status) {
            status.textContent = '正在准备导入…';
            status.style.color = '#059669';
          }
          const res = await Zotero?.Todolist?.importDataFile?.(mode, win);
          if (res?.success) {
            if (status) status.textContent = `✅ 成功导入 ${res.count} 个任务与标签数据！`;
            renderCustomTagsManager(doc, win);
          } else if (res?.error) {
            if (status) {
              status.textContent = `❌ 导入失败：${res.error}`;
              status.style.color = '#ef4444';
            }
          } else {
            if (status) status.textContent = '';
          }
        });

        // Print Tasks
        doc.getElementById('todolist-btn-print')?.addEventListener('click', () => {
          Zotero?.Todolist?.printTasks?.(win);
        });

        // Copy Tasks Summary
        doc.getElementById('todolist-btn-copy-summary')?.addEventListener('click', () => {
          Zotero?.Todolist?.copyTasksSummary?.(win);
        });

        // Clear All Data
        doc.getElementById('todolist-btn-clear-all')?.addEventListener('click', async () => {
          if (win.confirm('⚠️ 警告：确定要清空所有待办任务、历史记录与自定义标签吗？此操作无法撤销！')) {
            await Zotero?.Todolist?.clearAllData?.(win);
            renderCustomTagsManager(doc, win);
            if (statusEl) statusEl.textContent = '所有数据已清空。';
          }
        });

        // Reset button
        const resetBtn = doc.getElementById('todolist-btn-reset-defaults');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            if (win.confirm('确定要恢复 Todolist 默认设置吗？')) {
              for (const [key, val] of Object.entries(DEFAULTS)) {
                setPref(key, val);
              }
              this.init(win);
            }
          });
        }

        if (statusEl) {
          statusEl.textContent = '所有设置项均已加载并与 Zotero 配置中心实时同步。';
        }
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = '加载设置时发生异常: ' + err.message;
          statusEl.className = 'todolist-pref-status todolist-pref-error';
        }
      }
    }
  };
})();
