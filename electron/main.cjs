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
const { app, BrowserWindow, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const startUrl = process.env.ELECTRON_START_URL;
const distDir = path.join(__dirname, '..', 'dist');

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

function serveFromDist(request) {
  let pathname = decodeURIComponent(new URL(request.url).pathname);
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
}

app.whenReady().then(() => {
  if (!startUrl) {
    protocol.handle('app', serveFromDist);
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
