// Native application menu, mirroring the in-app MenuBar and driven by state
// the renderer pushes over IPC. Menu clicks are forwarded to the renderer as
// 'menu:command' messages; the renderer routes them to the same handlers the
// in-app menu uses. See src/App.tsx (menu command router) and electron/preload.cjs.
const { app, Menu, dialog, shell } = require('electron');

let currentWin = null;

// Latest menu-relevant state, pushed from the renderer via updateMenuState.
const menuState = {
  canUndo: false,
  canRedo: false,
  hasFork: false,
  toggles: {
    showGrid: true,
    showEntities: true,
    showSpaceBackground: true,
    showLighting: false,
    showPerfHUD: false,
    showBenchmark: false,
  },
};

function send(command) {
  if (currentWin && !currentWin.isDestroyed()) {
    currentWin.webContents.send('menu:command', command);
  }
}

// App-owned shortcut: the accelerator is shown for discoverability but NOT
// registered, so the renderer's existing keydown handler stays the single
// source of truth and we avoid double-firing.
function appItem(label, accelerator, command, extra) {
  return {
    label,
    accelerator,
    registerAccelerator: false,
    click: () => send(command),
    ...(extra || {}),
  };
}

function showAbout() {
  dialog.showMessageBox(currentWin ?? undefined, {
    type: 'info',
    title: 'About SS14 Map Editor',
    message: 'SS14 Map Editor',
    detail: `Version ${app.getVersion()}\nA desktop build of the Space Station 14 map editor.`,
    buttons: ['OK'],
  });
}

function buildTemplate() {
  const isMac = process.platform === 'darwin';
  const t = menuState.toggles;
  const toggle = (label, key) => ({
    label,
    type: 'checkbox',
    checked: !!t[key],
    click: () => send(`view:${key}`),
  });

  const template = [];

  if (isMac) {
    template.push({ role: 'appMenu' });
  }

  template.push({
    label: 'File',
    submenu: [
      appItem('New Map', 'CmdOrCtrl+N', 'file:new'),
      appItem('New Grid', 'CmdOrCtrl+Shift+N', 'file:newGrid'),
      { type: 'separator' },
      appItem('Import .yml…', 'CmdOrCtrl+O', 'file:import'),
      appItem('Export .yml', 'CmdOrCtrl+S', 'file:export'),
      { type: 'separator' },
      { label: 'Switch Fork…', enabled: menuState.hasFork, click: () => send('fork:switch') },
      ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
    ],
  });

  template.push({
    label: 'Edit',
    submenu: [
      appItem('Undo', 'CmdOrCtrl+Z', 'edit:undo', { enabled: menuState.canUndo }),
      appItem('Redo', 'CmdOrCtrl+Y', 'edit:redo', { enabled: menuState.canRedo }),
    ],
  });

  template.push({
    label: 'View',
    submenu: [
      toggle('Show Grid', 'showGrid'),
      toggle('Show Entities', 'showEntities'),
      toggle('Space Background', 'showSpaceBackground'),
      toggle('Lighting Preview', 'showLighting'),
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  });

  template.push({
    role: 'help',
    submenu: [
      appItem('Controls', '?', 'help:controls'),
      { type: 'separator' },
      {
        label: 'Troubleshooting',
        submenu: [
          { role: 'toggleDevTools' },
          { label: 'Reload App', click: () => send('app:reload') },
          { type: 'separator' },
          toggle('Performance HUD', 'showPerfHUD'),
          toggle('Benchmark Tool', 'showBenchmark'),
          { type: 'separator' },
          {
            label: 'Interface Zoom',
            submenu: [
              { label: 'Zoom In', role: 'zoomIn' },
              { label: 'Zoom Out', role: 'zoomOut' },
              { label: 'Reset', role: 'resetZoom' },
            ],
          },
          { type: 'separator' },
          { label: 'Open Logs Folder', click: () => shell.openPath(app.getPath('logs')) },
        ],
      },
      ...(isMac ? [] : [{ type: 'separator' }, { label: 'About SS14 Map Editor', click: showAbout }]),
    ],
  });

  return template;
}

function refreshMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate()));
}

/** Install the native menu and bind it to a window for command delivery. */
function installMenu(win) {
  currentWin = win;
  refreshMenu();
}

/** Merge pushed state and rebuild the menu (checkbox + enabled flags). */
function updateMenuState(partial) {
  if (!partial) return;
  if ('canUndo' in partial) menuState.canUndo = !!partial.canUndo;
  if ('canRedo' in partial) menuState.canRedo = !!partial.canRedo;
  if ('hasFork' in partial) menuState.hasFork = !!partial.hasFork;
  if (partial.toggles) Object.assign(menuState.toggles, partial.toggles);
  refreshMenu();
}

module.exports = { installMenu, updateMenuState };
