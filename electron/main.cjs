// Electron main process. Additive shell over the existing Vite SPA.
//
// Dev: loads the running Vite dev server (ELECTRON_START_URL) so the resource
// middleware and folder picker work unchanged.
//
// Prod: serves the static dist/ build through a custom app:// scheme whose
// root is dist/. The SPA was written for a web server mounted at origin root,
// so it uses absolute asset paths (e.g. /images/space-bg.png). Loading dist/
// over file:// breaks those (a leading slash points at the filesystem root),
// which is why the landing-screen background vanished. Serving dist/ as the
// scheme root restores the origin-at-root assumption without editing any
// upstream source.
const { app, BrowserWindow, protocol, shell, ipcMain, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { installMenu, updateMenuState } = require('./menu.cjs');

const startUrl = process.env.ELECTRON_START_URL;
const distDir = path.join(__dirname, '..', 'dist');

// Resources/ directory of the currently loaded fork. The forkres:// handler
// reads from here; set when the renderer picks a fork via fork:pick.
let currentForkRoot = null;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.map': 'application/json',
};

// Standard + secure so fetch() and secure-context APIs (clipboard,
// showDirectoryPicker) behave as they do on https.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Fork resources are served under this reserved prefix on the SAME app://
// origin as the page. Same-origin matters: sprite thumbnails draw resource
// images onto a canvas and call toDataURL(), which throws on a cross-origin
// (tainted) canvas. Keeping fork files same-origin avoids the taint.
const FORK_PREFIX = '/@fork';

function serveFromDist(request) {
  let pathname = decodeURIComponent(new URL(request.url).pathname);

  if (pathname === FORK_PREFIX || pathname.startsWith(FORK_PREFIX + '/')) {
    return serveForkFile(pathname.slice(FORK_PREFIX.length) || '/');
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const filePath = path.normalize(path.join(distDir, pathname));
  // Contain traversal: never serve outside dist/.
  if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new Response(data, {
      headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

// Serve a file (relPath, leading slash) from the loaded fork's Resources/ dir.
function serveForkFile(relPath) {
  if (!currentForkRoot) return new Response('No fork loaded', { status: 404 });

  const filePath = path.normalize(path.join(currentForkRoot, relPath));
  if (filePath !== currentForkRoot && !filePath.startsWith(currentForkRoot + path.sep)) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new Response(data, {
      headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

// Recursively collect file paths under absDir, keyed relative to Resources/
// (e.g. "Prototypes/Tiles/floors.yml"). Matches the browser scanner's scope.
function walkKeys(absDir, relPrefix, out) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(absDir, entry.name);
    const rel = `${relPrefix}/${entry.name}`;
    if (entry.isDirectory()) walkKeys(abs, rel, out);
    else if (entry.isFile()) out.push(rel);
  }
}

// Resolve a picked directory to its Resources/ root and enumerate resource
// keys. Returns { root, name, keys } or { error }.
function loadForkFromDir(dir) {
  let resourcesDir = path.join(dir, 'Resources');
  if (!fs.existsSync(resourcesDir)) resourcesDir = dir; // maybe Resources/ was picked directly
  if (!fs.existsSync(path.join(resourcesDir, 'Prototypes'))) {
    return { error: 'No Prototypes/ directory found. Pick a fork root or its Resources/ folder.' };
  }

  const keys = [];
  for (const top of ['Prototypes', 'Textures']) {
    walkKeys(path.join(resourcesDir, top), top, keys);
  }

  currentForkRoot = resourcesDir;
  return { root: resourcesDir, name: path.basename(dir), keys };
}

async function handlePickFork(_event, presetDir) {
  let dir = presetDir || process.env.SS14_FORK_DIR || null;
  if (!dir) {
    const result = await dialog.showOpenDialog({
      title: 'Select an SS14 fork folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    dir = result.filePaths[0];
  }
  return loadForkFromDir(dir);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    title: 'SS14 Map Editor',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (startUrl) {
    win.loadURL(startUrl);
  } else {
    win.loadURL('app://local/index.html');
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  installMenu(win);
}

app.whenReady().then(() => {
  if (!startUrl) {
    protocol.handle('app', serveFromDist);
  } else {
    // Dev: the page is served by Vite over http, so the app:// handler that
    // normally answers /@fork requests never runs: fork resources 404 and
    // every sprite falls back to placeholder rendering. Intercept http for
    // the dev origin's fork prefix only; everything else (Vite modules, HMR)
    // passes through untouched.
    const devOrigin = new URL(startUrl).origin;
    protocol.handle('http', (request) => {
      const url = new URL(request.url);
      const pathname = decodeURIComponent(url.pathname);
      if (url.origin === devOrigin &&
          (pathname === FORK_PREFIX || pathname.startsWith(FORK_PREFIX + '/'))) {
        return serveForkFile(pathname.slice(FORK_PREFIX.length) || '/');
      }
      return net.fetch(request, { bypassCustomProtocolHandlers: true });
    });
  }
  ipcMain.handle('fork:pick', handlePickFork);

  // Native menu keeps its enabled/checked flags in sync with renderer state.
  ipcMain.on('menu:state', (_event, state) => updateMenuState(state));

  // Native import/export dialogs.
  ipcMain.handle('dialog:open-yaml', async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? undefined, {
      title: 'Import map',
      filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    try {
      return fs.readFileSync(result.filePaths[0], 'utf8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('dialog:save-yaml', async (_event, { content, defaultName }) => {
    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() ?? undefined, {
      title: 'Export map',
      defaultPath: defaultName || 'station.yml',
      filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, content, 'utf8');
    return result.filePath;
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
