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
