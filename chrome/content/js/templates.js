// Task Templates module

const Templates = {
  // Built-in templates
  builtinTemplates: [
    {
      id: 'paper-reading-milestones',
      name: '📖 论文精读与复现清单',
      icon: '📖',
      task: {
        title: '[精读] 论文研读与复现',
        description: '深度剖析文献创新点、关键推导、对比实验与开源代码复现',
        priority: 'high',
        category: '论文研读',
        academicType: 'literature_reading',
        subtasks: [
          { title: '1. 快速通读 Abstract、Intro 与 Conclusion' },
          { title: '2. 深入理解核心方法论与数学模型推导' },
          { title: '3. 仔细评估 Baseline 对比与 Ablation 消融结果' },
          { title: '4. 查阅开源代码并跑通最小测试 Demo' },
          { title: '5. 提炼创新亮点与局限性，整理研读笔记' }
        ]
      }
    },
    {
      id: 'paper-writing-pipeline',
      name: '✍️ 论文写作与修改规划',
      icon: '✍️',
      task: {
        title: '[写作] 论文撰写推进',
        description: '学术论文标准章节结构撰写与逻辑梳理',
        priority: 'high',
        category: '论文写作',
        academicType: 'writing',
        subtasks: [
          { title: '1. 拟定标题、摘要与 Contribution 创新点' },
          { title: '2. 撰写 Introduction 与 Related Work 文献综述' },
          { title: '3. 详述 Method 算法架构与公式图表' },
          { title: '4. 整理 Experiments 实验图表与对比分析' },
          { title: '5. 完善 Conclusion 与 Future Work' }
        ]
      }
    },
    {
      id: 'experiment-ablation',
      name: '🔬 实验设计与消融分析',
      icon: '🔬',
      task: {
        title: '[实验] 模型消融与数据验证',
        description: '代码实验运行、消融对比与图表生成',
        priority: 'medium',
        category: '代码实验',
        academicType: 'experiment',
        subtasks: [
          { title: '1. 数据集清洗与预处理流水线' },
          { title: '2. 搭建 Baseline 模型并记录收敛指标' },
          { title: '3. 核心创新模块消融对比实验 (Ablation Study)' },
          { title: '4. 超参数敏感性分析与显存调优' },
          { title: '5. 绘制高质量实验折线图与柱状图' }
        ]
      }
    },
    {
      id: 'conference-ddl-sprint',
      name: '⏰ 学术会议投稿 DDL 冲刺',
      icon: '⏰',
      task: {
        title: '[DDL] 会议投稿截稿冲刺',
        description: '严格按照会议格式要求与时间节点推进排版检查与提交',
        priority: 'high',
        category: '会议投稿',
        academicType: 'submission',
        subtasks: [
          { title: '1. 论文全文正文初稿定稿 (严格遵守页数限制)' },
          { title: '2. 导师/合作者第一轮审阅意见修改' },
          { title: '3. 语法、拼写与公式符号一致性润色 (Overleaf)' },
          { title: '4. 检查所有参考文献格式与 DOI/BibTeX 完整性' },
          { title: '5. 提交系统 CMT/OpenReview 账号与预注册信息核对' },
          { title: '6. 生成无溢出 PDF 并最终提交确认' }
        ]
      }
    },
    {
      id: 'rebuttal-point-by-point',
      name: '📑 审稿意见逐条回复 (Rebuttal)',
      icon: '📑',
      task: {
        title: '[Rebuttal] 审稿意见修改与回复',
        description: '针对审稿人意见逐条回应，补充实验与论文正文修订',
        priority: 'high',
        category: '审稿评阅',
        academicType: 'peer_review',
        subtasks: [
          { title: '1. 逐条拆解 Reviewers 审稿意见并分类整理' },
          { title: '2. 补充 Reviewer 要求的对比实验与消融验证' },
          { title: '3. 撰写 Point-by-Point 回复信草稿' },
          { title: '4. 在正文中使用高亮颜色标出修订之处' },
          { title: '5. 最终核对语气客观诚恳、论据充分并提交' }
        ]
      }
    },
    {
      id: 'daily-review',
      name: '📋 每日回顾',
      icon: '📋',
      task: {
        title: '每日工作回顾',
        description: '回顾今天的工作，记录完成事项和明日计划',
        priority: 'medium',
        category: '工作',
        subtasks: [
          { title: '回顾今日完成的任务' },
          { title: '记录遇到的问题' },
          { title: '规划明日工作重点' }
        ]
      }
    },
    {
      id: 'meeting-prep',
      name: '🤝 会议准备',
      icon: '🤝',
      task: {
        title: '会议准备',
        description: '准备会议议程和相关材料',
        priority: 'high',
        category: '工作',
        subtasks: [
          { title: '确认会议时间和地点' },
          { title: '准备会议议程' },
          { title: '整理相关资料' },
          { title: '发送会议邀请' }
        ]
      }
    },
    {
      id: 'weekly-report',
      name: '📊 周报',
        icon: '📊',
      task: {
        title: '撰写周报',
        description: '总结本周工作成果，规划下周计划',
        priority: 'medium',
        category: '工作',
        subtasks: [
          { title: '汇总本周完成的任务' },
          { title: '记录本周数据指标' },
          { title: '分析遇到的问题' },
          { title: '制定下周工作计划' }
        ]
      }
    },
    {
      id: 'exercise',
      name: '🏃 运动健身',
      icon: '🏃',
      task: {
        title: '运动健身',
        description: '完成今日运动计划',
        priority: 'medium',
        category: '健康',
        subtasks: [
          { title: '热身运动 10 分钟' },
          { title: '主要训练 30 分钟' },
          { title: '拉伸放松 10 分钟' }
        ]
      }
    },
    {
      id: 'reading',
      name: '📚 阅读计划',
      icon: '📚',
      task: {
        title: '阅读计划',
        description: '完成今日阅读目标',
        priority: 'low',
        category: '学习',
        subtasks: [
          { title: '阅读 30 分钟' },
          { title: '记录读书笔记' },
          { title: '总结今日收获' }
        ]
      }
    },
    {
      id: 'shopping',
      name: '🛒 购物清单',
      icon: '🛒',
      task: {
        title: '购物清单',
        description: '购买生活所需物品',
        priority: 'low',
        category: '生活',
        subtasks: []
      }
    },
    {
      id: 'project-kickoff',
      name: '🚀 项目启动',
      icon: '🚀',
      task: {
        title: '项目启动',
        description: '新项目启动准备工作',
        priority: 'high',
        category: '工作',
        subtasks: [
          { title: '明确项目目标和范围' },
          { title: '确定项目成员和分工' },
          { title: '制定项目时间计划' },
          { title: '准备项目启动会议' },
          { title: '建立项目文档' }
        ]
      }
    },
    {
      id: 'code-review',
      name: '🔍 代码审查',
      icon: '🔍',
      task: {
        title: '代码审查',
        description: '审查团队提交的代码',
        priority: 'medium',
        category: '工作',
        subtasks: [
          { title: '检查代码规范' },
          { title: '验证功能实现' },
          { title: '评估性能影响' },
          { title: '提供反馈意见' }
        ]
      }
    }
  ],

  // Custom templates (stored in local storage)
  customTemplates: [],

  // Load custom templates
  async loadCustomTemplates() {
    const result = await new Promise(resolve => {
      chrome.storage.local.get('customTemplates', resolve);
    });
    this.customTemplates = result.customTemplates || [];
  },

  // Save custom templates
  async saveCustomTemplates() {
    await new Promise(resolve => {
      chrome.storage.local.set({ customTemplates: this.customTemplates }, resolve);
    });
  },

  // Get all templates (builtin + custom)
  getAllTemplates() {
    return [...this.builtinTemplates, ...this.customTemplates];
  },

  // Add custom template from current task
  async addCustomTemplate(name, task) {
    const template = {
      id: 'custom_' + Date.now(),
      name: name,
      icon: '⭐',
      task: {
        title: task.title,
        description: task.description || '',
        priority: task.priority || 'medium',
        category: task.category || '',
        subtasks: (task.subtasks || []).map(st => ({ title: st.title }))
      }
    };

    this.customTemplates.push(template);
    await this.saveCustomTemplates();
    return template;
  },

  // Delete custom template
  async deleteCustomTemplate(templateId) {
    this.customTemplates = this.customTemplates.filter(t => t.id !== templateId);
    await this.saveCustomTemplates();
  },

  // Apply template (create task from template)
  async applyTemplate(templateId) {
    const template = this.getAllTemplates().find(t => t.id === templateId);
    if (!template) return null;

    // Open modal with prefilled data
    Modal.openAdd({
      title: template.task.title,
      description: template.task.description,
      priority: template.task.priority,
      category: template.task.category,
      subtasks: template.task.subtasks.map(st => ({
        id: Utils.generateId(),
        title: st.title,
        completed: false
      }))
    });
  },

  // Render templates panel
  renderTemplatesPanel() {
    const templates = this.getAllTemplates();

    return `
      <div class="templates-panel">
        <div class="templates-header">
          <h3>📝 任务模板</h3>
          <button id="btn-close-templates" class="btn-icon" title="关闭">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="templates-grid">
          ${templates.map(t => `
            <div class="template-card" data-template-id="${t.id}">
              <div class="template-icon">${t.icon}</div>
              <div class="template-name">${t.name}</div>
              <div class="template-desc">${t.task.subtasks.length} 个子任务</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
};
