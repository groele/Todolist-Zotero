// Tags Management module

const Tags = {
  // Predefined tag colors
  colors: [
    { name: '红色', value: '#ef4444', bg: '#fef2f2' },
    { name: '橙色', value: '#f97316', bg: '#fff7ed' },
    { name: '黄色', value: '#eab308', bg: '#fefce8' },
    { name: '绿色', value: '#22c55e', bg: '#f0fdf4' },
    { name: '蓝色', value: '#3b82f6', bg: '#eff6ff' },
    { name: '紫色', value: '#a855f7', bg: '#faf5ff' },
    { name: '粉色', value: '#ec4899', bg: '#fdf2f8' },
    { name: '灰色', value: '#6b7280', bg: '#f9fafb' }
  ],

  // Predefined tags
  predefinedTags: [
    { id: 'important', name: '重要', color: '#ef4444', icon: '🔴' },
    { id: 'urgent', name: '紧急', color: '#f97316', icon: '🟠' },
    { id: 'work', name: '工作', color: '#3b82f6', icon: '💼' },
    { id: 'personal', name: '个人', color: '#22c55e', icon: '👤' },
    { id: 'study', name: '学习', color: '#a855f7', icon: '📚' },
    { id: 'health', name: '健康', color: '#ec4899', icon: '💪' },
    { id: 'finance', name: '财务', color: '#eab308', icon: '💰' },
    { id: 'home', name: '家庭', color: '#6b7280', icon: '🏠' }
  ],

  // Custom tags
  customTags: [],

  // Initialize
  async init() {
    await this.loadCustomTags();
  },

  // Load custom tags
  async loadCustomTags() {
    const result = await new Promise(resolve => {
      chrome.storage.local.get('customTags', resolve);
    });
    this.customTags = result.customTags || [];
  },

  // Save custom tags
  async saveCustomTags() {
    await new Promise(resolve => {
      chrome.storage.local.set({ customTags: this.customTags }, resolve);
    });
  },

  // Get all tags
  getAllTags() {
    return [...this.predefinedTags, ...this.customTags];
  },

  // Add custom tag
  async addCustomTag(name, color) {
    const tag = {
      id: 'tag_' + Date.now(),
      name: name,
      color: color || '#6b7280',
      icon: '🏷️'
    };
    this.customTags.push(tag);
    await this.saveCustomTags();
    return tag;
  },

  // Delete custom tag
  async deleteCustomTag(tagId) {
    this.customTags = this.customTags.filter(t => t.id !== tagId);
    await this.saveCustomTags();
  },

  // Get tag by ID
  getTagById(tagId) {
    return this.getAllTags().find(t => t.id === tagId);
  },

  // Render custom tags management list
  renderCustomTagsManager() {
    if (!this.customTags || this.customTags.length === 0) {
      return '<div style="font-size: var(--font-size-xs); color: var(--text-muted);">暂无自定义标签</div>';
    }

    return `
      <div class="custom-tags-manager" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
        ${this.customTags.map(tag => `
          <span class="custom-tag-manage-item" style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--radius-full); font-size: 12px; background-color: ${tag.color}20; color: ${tag.color}; border: 1px solid ${tag.color}40;">
            <span>${tag.icon} ${Utils.escapeHtml(tag.name)}</span>
            <button type="button" class="btn-delete-custom-tag" data-tag-id="${tag.id}" style="border:none; background:none; cursor:pointer; color:inherit; font-weight:bold; padding:0 2px;">×</button>
          </span>
        `).join('')}
      </div>
    `;
  },

  // Render tag selector
  renderTagSelector(selectedTags = []) {
    const allTags = this.getAllTags();

    return `
      <div class="tag-selector">
        <div class="tag-selector-header">
          <span>选择标签</span>
          <button type="button" id="btn-add-custom-tag" class="btn-text">+ 自定义</button>
        </div>
        <div class="tag-options">
          ${allTags.map(tag => `
            <label class="tag-option" data-tag-id="${tag.id}">
              <input type="checkbox" value="${tag.id}" ${selectedTags.includes(tag.id) ? 'checked' : ''}>
              <span class="tag-badge" style="background-color: ${tag.color}20; color: ${tag.color}; border: 1px solid ${tag.color}40;">
                ${tag.icon} ${tag.name}
              </span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  },

  // Render tag badges for display
  renderTagBadges(tagIds = []) {
    if (!tagIds || tagIds.length === 0) return '';

    return tagIds.map(tagId => {
      const tag = this.getTagById(tagId);
      if (!tag) return '';
      return `<span class="tag-badge-small" style="background-color: ${tag.color}20; color: ${tag.color};">${tag.icon} ${tag.name}</span>`;
    }).join('');
  },

  // Get tags from task
  getTaskTags(task) {
    return task.tags || [];
  },

  // Filter tasks by tag
  filterTasksByTag(tasks, tagId) {
    return tasks.filter(t => t.tags && t.tags.includes(tagId));
  },

  // Get tag statistics
  getTagStats(tasks) {
    const stats = {};
    this.getAllTags().forEach(tag => {
      stats[tag.id] = {
        ...tag,
        count: tasks.filter(t => t.tags && t.tags.includes(tag.id)).length
      };
    });
    return stats;
  }
};
