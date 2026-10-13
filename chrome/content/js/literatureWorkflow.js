// Shared reading presets and calendar rules for Zotero host and task dialogs.
var LiteratureWorkflow = {
  profiles: {
    general: { label: '通用研读', steps: ['通读摘要、引言与结论，明确研究问题', '梳理核心方法、主要结果与证据链', '检查关键图表、适用条件与局限性', '对照相关工作，记录可复用的方法或思路', '整理研读笔记、疑问与后续行动'] },
    theory: { label: '理论论文', steps: ['明确研究问题、模型与物理假设', '逐步核查关键推导、符号与量纲', '检验极限情况、守恒关系与适用范围', '比较已有理论，提炼可检验预测', '整理推导笔记、局限与可复用计算'] },
    experiment: { label: '实验论文', steps: ['明确实验问题、样品与测量条件', '梳理实验流程、仪器参数与对照组', '核查原始证据、误差来源与统计报告', '评估机制解释、可重复性与替代解释', '记录设备需求、实验启发与验证计划'] },
    review: { label: '综述论文', steps: ['明确综述范围、分类框架与核心问题', '梳理代表工作、时间线与关键证据', '比较不同路线的共识、分歧与局限', '追踪关键原始文献并识别研究空白', '形成主题脉络图与后续阅读清单'] },
    algorithm: { label: '算法与复现', steps: ['明确任务定义、输入输出与核心贡献', '梳理算法结构、目标函数与复杂度', '核查基线、消融、数据划分与评价指标', '检查代码、环境与最小复现实验', '记录复现结果、局限与迁移条件'] }
  },
  profile(id) { return this.profiles[id] || this.profiles.general; },
  days(value = 7) { return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 365 ? Number(value) : 7; },
  dateAfter(days = 7, from = new Date()) {
    const date = new Date(from); date.setDate(date.getDate() + Number(days));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },
  steps(profileID, generateId) {
    return this.profile(profileID).steps.map((title, index) => ({ id: generateId(), title: `${index + 1}. ${title}`, completed: false }));
  },
  templates() {
    return Object.entries(this.profiles).map(([id, profile]) => ({
      id: id === 'general' ? 'paper-reading-milestones' : `paper-reading-${id}`,
      name: `📖 ${profile.label}清单`, icon: '📖',
      task: { title: `[精读] ${profile.label}`, description: `按${profile.label}流程梳理问题、方法、证据与局限`,
        priority: 'medium', category: '论文研读', academicType: 'literature_reading', readingProfile: id,
        subtasks: profile.steps.map((title, index) => ({ title: `${index + 1}. ${title}` })) }
    }));
  },
  samePending(task, candidate, userLibraryID, wholeItem = false) {
    if (task.completed || task.zoteroItemKey !== candidate.zoteroItemKey ||
      (task.zoteroLibraryID || userLibraryID) !== candidate.zoteroLibraryID) return false;
    if (wholeItem) return !task.academicType || task.academicType === 'literature_reading';
    if (candidate.literatureWorkflowId && task.literatureWorkflowId === candidate.literatureWorkflowId) return true;
    return candidate.literatureWorkflowId === 'reading' && task.title === candidate.title &&
      (!task.academicType || task.academicType === 'literature_reading');
  }
};
