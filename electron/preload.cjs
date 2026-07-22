// Preload: exposes a minimal, typed bridge for the native fork-loading path.
// Renderer never gets raw Node/fs; it can only ask the main process to open a
// folder picker and enumerate a fork's resource paths. File contents are read
// lazily over the forkres:// protocol (see electron/main.cjs), not through here.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronFork', {
  available: true,
  // Optional dev/automation convenience: launch straight into a fork.
  autoForkDir: process.env.SS14_FORK_DIR || null,
  // pickFork() shows a native directory dialog; pickFork(dir) uses dir directly.
  // Resolves to { root, name, keys } | { error } | null (cancelled).
  pickFork: (dir) => ipcRenderer.invoke('fork:pick', dir ?? null),
});

// Native application menu bridge. onCommand delivers menu clicks to the
// renderer; setState pushes enabled/checked state back so the menu stays live.
contextBridge.exposeInMainWorld('electronMenu', {
  available: true,
  onCommand: (cb) => {
    const listener = (_e, command) => cb(command);
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  },
  setState: (state) => ipcRenderer.send('menu:state', state),
});

// Native file dialogs for import/export. Resolves to file content / saved
// path, or null when the user cancels.
contextBridge.exposeInMainWorld('electronDialogs', {
  available: true,
  openYaml: () => ipcRenderer.invoke('dialog:open-yaml'),
  saveYaml: (content, defaultName) => ipcRenderer.invoke('dialog:save-yaml', { content, defaultName }),
});
