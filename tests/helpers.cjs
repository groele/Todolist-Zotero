const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
async function waitFor(predicate, message = 'condition', timeout = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('Timed out: ' + message);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
async function page(file = 'index.html', data = null, host = null) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(String(error)));
  virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const html = read('chrome/content/' + file);
  const dom = new JSDOM(html, { url: 'https://todolist.test/' + file, runScripts: 'outside-only',
    pretendToBeVisual: true, virtualConsole });
  const win = dom.window;
  win.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  win.HTMLDialogElement.prototype.close = function() { this.open = false; };
  if (data) for (const [key, value] of Object.entries(data)) win.localStorage.setItem('todolist_' + key, JSON.stringify(value));
  if (host) win.Zotero = { Todolist: host, getMainWindow: () => null };
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => read('chrome/content/' + match[1]));
  win.eval(scripts.join('\n;\n') + '\nwindow.__test = {Storage, TaskManager, Modal, UI, Utils, Recurring, Tags, Templates, TimeTracking, DataManager, Advanced, ZoteroBridge, TaskRules};');
  try {
    await waitFor(() => win.__test.UI._storageReady && (!win.document.getElementById('loading-state') ||
      win.document.getElementById('loading-state').classList.contains('hidden')), errors.join('\n') || 'app initialization');
  } catch (error) { dom.window.close(); throw error; }
  return { dom, win, doc: win.document, ...win.__test, errors, close: () => dom.window.close() };
}
function makeHost(seed = { tasks: [], settings: {}, customTags: [] }) {
  let disk = copy(seed);
  let writes = 0;
  let failWrite = false;
  let readError = null;
  let pane;
  const logs = [];
  const context = vm.createContext({ console, setTimeout, clearTimeout, Promise,
    PathUtils: { join: (...parts) => parts.join('/'), profileDir: '/test' },
    IOUtils: { exists: async () => true,
      readUTF8: async () => { if (readError) throw readError; return JSON.stringify(disk); },
      writeUTF8: async (file, text, options) => {
        if (!options?.tmpPath) throw new Error('atomic write required');
        await new Promise(resolve => setTimeout(resolve, 2));
        if (failWrite) throw new Error('simulated disk full');
        writes++; disk = JSON.parse(text);
      } },
    Zotero: { DataDirectory: { dir: '/test' }, logError: message => logs.push(String(message)),
      log: () => {}, Prefs: { get: key => key.includes('autoSync') ? false : undefined },
      Libraries: { userLibraryID: 1 }, Items: { get: () => null, getByLibraryAndKey: () => null },
      ItemPaneManager: { registerSection: options => { pane = options; return 'test-section'; } } } });
  vm.runInContext(read('chrome/content/js/taskRules.js'), context);
  const runtime = read('chrome/content/scripts/index.js').replace('  Zotero.Todolist.init();', '  // init is supplied by the fixture');
  vm.runInContext(runtime, context);
  const host = context.Zotero.Todolist;
  host.showNotice = () => {};
  return { host, context, disk: () => copy(disk), logs, writes: () => writes,
    failWrites: value => { failWrite = value; }, failReads: value => { readError = value; },
    pane: () => pane };
}
module.exports = { page, makeHost, waitFor, read, root, copy, JSDOM };
