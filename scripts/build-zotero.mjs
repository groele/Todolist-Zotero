/**
 * Todolist for Zotero - Packaging Pipeline
 * Staging Zotero addon structure, copying web assets, validating syntax,
 * and packaging into .xpi for Zotero 7+
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const zoteroSrc = path.join(projectRoot, 'zotero');
const zoteroStaging = path.join(projectRoot, 'dist-zotero');
const contentDir = path.join(zoteroStaging, 'chrome', 'content');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(zoteroSrc, 'manifest.json'), 'utf-8'));
  const addonVersion = manifest.version;

  console.log('🧹 [1/4] Preparing Todolist Zotero staging directory (dist-zotero)...');
  if (fs.existsSync(zoteroStaging)) {
    fs.rmSync(zoteroStaging, { recursive: true, force: true });
  }
  fs.mkdirSync(zoteroStaging, { recursive: true });

  // 1. Copy core Zotero root files
  fs.copyFileSync(path.join(zoteroSrc, 'manifest.json'), path.join(zoteroStaging, 'manifest.json'));
  fs.copyFileSync(path.join(zoteroSrc, 'update.json'), path.join(zoteroStaging, 'update.json'));
  fs.copyFileSync(path.join(zoteroSrc, 'bootstrap.js'), path.join(zoteroStaging, 'bootstrap.js'));
  fs.copyFileSync(path.join(zoteroSrc, 'prefs.js'), path.join(zoteroStaging, 'prefs.js'));
  fs.copyFileSync(path.join(zoteroSrc, 'chrome.manifest'), path.join(zoteroStaging, 'chrome.manifest'));

  // 2. Copy locales & chrome files from zotero/
  copyDirRecursive(path.join(zoteroSrc, 'locale'), path.join(zoteroStaging, 'locale'));
  copyDirRecursive(path.join(zoteroSrc, 'chrome'), path.join(zoteroStaging, 'chrome'));

  console.log('📂 [2/4] Integrating web app assets (HTML, CSS, JS, Images)...');
  // Copy css, js, images to chrome/content/
  copyDirRecursive(path.join(projectRoot, 'css'), path.join(contentDir, 'css'));
  copyDirRecursive(path.join(projectRoot, 'js'), path.join(contentDir, 'js'));
  copyDirRecursive(path.join(projectRoot, 'images'), path.join(contentDir, 'images'));

  // Copy HTML templates
  fs.copyFileSync(path.join(projectRoot, 'index.html'), path.join(contentDir, 'index.html'));
  fs.copyFileSync(path.join(projectRoot, 'sidepanel.html'), path.join(contentDir, 'sidepanel.html'));

  // Patch index.html with Zotero argument binding & safety polyfills
  const indexPath = path.join(contentDir, 'index.html');
  let indexHtml = fs.readFileSync(indexPath, 'utf-8');
  const zoteroPolyfill = `
  <script>
    // Zotero / Gecko Runtime Bridge Polyfills
    window.process = window.process || { env: { NODE_ENV: 'production' } };
    window.global = window.global || window;
    try {
      if (window.arguments && window.arguments[0]) {
        if (window.arguments[0].Zotero) {
          window.Zotero = window.arguments[0].Zotero;
        }
        if (window.arguments[0].options) {
          window._todolistPending = window.arguments[0].options;
        }
      }
    } catch (_) {}
  </script>
  `;
  indexHtml = indexHtml.replace('<head>', '<head>' + zoteroPolyfill);
  fs.writeFileSync(indexPath, indexHtml, 'utf-8');

  console.log('🔍 [3/4] Validating JavaScript syntax...');
  execSync(`node --check "${path.join(zoteroStaging, 'bootstrap.js')}"`, { stdio: 'inherit' });
  execSync(`node --check "${path.join(zoteroStaging, 'chrome', 'content', 'scripts', 'index.js')}"`, { stdio: 'inherit' });
  execSync(`node --check "${path.join(zoteroStaging, 'chrome', 'content', 'scripts', 'preferences.js')}"`, { stdio: 'inherit' });
  execSync(`node --check "${path.join(contentDir, 'js', 'zoteroBridge.js')}"`, { stdio: 'inherit' });
  execSync(`node --check "${path.join(contentDir, 'js', 'storage.js')}"`, { stdio: 'inherit' });
  execSync(`node --check "${path.join(contentDir, 'js', 'taskManager.js')}"`, { stdio: 'inherit' });
  execSync(`node --check "${path.join(contentDir, 'js', 'templates.js')}"`, { stdio: 'inherit' });
  execSync(`node --check "${path.join(contentDir, 'js', 'modal.js')}"`, { stdio: 'inherit' });
  execSync(`node --check "${path.join(contentDir, 'js', 'ui.js')}"`, { stdio: 'inherit' });

  console.log('📦 [4/4] Packaging into Zotero .xpi archive...');
  const psScriptPath = path.join(projectRoot, 'scripts', 'build-zotero.ps1');
  execSync(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${psScriptPath}"`, { stdio: 'inherit' });

  console.log(`\n✨ Build completed successfully!`);
  console.log(`📦 Zotero Addon XPI ready at: dist-zip/todolist-zotero-${addonVersion}.xpi`);
  console.log(`📂 Unpacked staging ready at: dist-zotero/`);
}

main().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
