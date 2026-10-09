// Error diagnostics are separate from task data and bounded to the last 50 errors.
const Diagnostics = {
  records: [],
  report(action, error) {
    if (!window.document) return null;
    const record = {
      time: new Date().toISOString(), action: String(action).slice(0, 160),
      message: String(error?.message || error || '未知错误').slice(0, 2000),
      cause: String(error?.cause?.message || error?.cause || '').slice(0, 2000),
      stack: String(error?.stack || '').slice(0, 8000),
      page: window.location.pathname
    };
    this.records.push(record);
    this.records = this.records.slice(-50);
    console.error('[Todolist] ' + record.action, record.message, record.stack);
    try {
      const host = window.Zotero?.Todolist || window.parent?.Zotero?.Todolist;
      if (host?.recordDiagnostic) Promise.resolve(host.recordDiagnostic(record)).catch(() => {});
      else if (typeof ZoteroBridge !== 'undefined' && ZoteroBridge.isZotero) {
        ZoteroBridge.sendToHost({ type: 'TODOLIST_DIAGNOSTIC', record });
      }
    } catch (_) {}
    return record;
  },
  showFailure(action, error) {
    const record = this.report(action, error);
    if (!record) return null;
    if (typeof UI !== 'undefined') UI.showToast(`${action}失败：${record.message.slice(0, 100)}`);
    return record;
  },
  async run(action, callback) {
    try { return await callback(); }
    catch (error) { this.showFailure(action, error); }
  }
};
window.TodolistDiagnostics = Diagnostics;
