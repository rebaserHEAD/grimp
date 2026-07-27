// Ambient types for the Electron preload bridges (see electron/preload.cjs).
// All are optional: they are undefined in the browser build.
export {};

declare global {
  interface Window {
    electronFork?: {
      available: boolean;
      /** Dev/automation: launch straight into this fork dir (SS14_FORK_DIR). */
      autoForkDir: string | null;
      /**
       * pickFork() shows a native directory dialog (seeded at dialogDefaultDir);
       * pickFork(dir) loads dir directly. dir in the result is the originally
       * picked path (replayable); root may be dir/Resources.
       */
      pickFork: (
        dir?: string | null,
        dialogDefaultDir?: string | null,
      ) => Promise<{ root: string; dir: string; name: string; keys: string[] } | { error: string } | null>;
      /** Scan a forks folder one level deep for fork candidates. */
      discoverForks: (forksDir: string) => Promise<{ dir: string; name: string }[]>;
      /** Generic native directory picker; null when cancelled. */
      pickDirectory: (defaultPath?: string | null) => Promise<string | null>;
    };
    electronMenu?: {
      available: boolean;
      /** Subscribe to native menu clicks; returns an unsubscribe function. */
      onCommand: (cb: (command: string) => void) => () => void;
      /** Push enabled/checked state so the native menu stays live. */
      setState: (state: {
        canUndo: boolean;
        canRedo: boolean;
        hasFork: boolean;
        dirty: boolean;
        toggles: Record<string, boolean>;
      }) => void;
    };
    electronSettings?: {
      available: boolean;
      /** Raw stored settings blob, or null when missing/corrupt. */
      get: () => Promise<unknown>;
      /** Overwrite the stored settings; resolves false on write failure. */
      set: (settings: unknown) => Promise<boolean>;
    };
    electronPrefabs?: {
      available: boolean;
      /** All .json files in the userData prefab library. */
      list: () => Promise<{ fileName: string; content: string }[]>;
      /** Write a prefab into the library; resolves the stored file name or null. */
      save: (fileName: string, content: string) => Promise<string | null>;
      /** Native picker; copies picks into the library and returns them. */
      importFiles: () => Promise<{ fileName: string; content: string }[]>;
      /** Open the library folder in the OS file manager. */
      openFolder: () => Promise<void>;
    };
    electronDialogs?: {
      available: boolean;
      /** Native open dialog; resolves file content + name + path, or null if cancelled. */
      openYaml: () => Promise<{ content: string; fileName: string; path: string } | null>;
      /** Native save dialog; resolves the saved path, or null if cancelled. */
      saveYaml: (content: string, defaultName: string) => Promise<string | null>;
      /** Dialog-less read for replaying recent files; null when gone/unreadable. */
      readYaml: (filePath: string) => Promise<{ content: string; fileName: string; path: string } | null>;
      /** Dialog-less write for Save-in-place; resolves false when the write fails. */
      writeYaml: (filePath: string, content: string) => Promise<boolean>;
    };
  }
}
