// Ambient types for the Electron preload bridges (see electron/preload.cjs).
// All are optional: they are undefined in the browser build.
export {};

declare global {
  interface Window {
    electronMenu?: {
      available: boolean;
      /** Subscribe to native menu clicks; returns an unsubscribe function. */
      onCommand: (cb: (command: string) => void) => () => void;
      /** Push enabled/checked state so the native menu stays live. */
      setState: (state: {
        canUndo: boolean;
        canRedo: boolean;
        hasFork: boolean;
        toggles: Record<string, boolean>;
      }) => void;
    };
    electronDialogs?: {
      available: boolean;
      /** Native open dialog; resolves file content, or null if cancelled. */
      openYaml: () => Promise<string | null>;
      /** Native save dialog; resolves the saved path, or null if cancelled. */
      saveYaml: (content: string, defaultName: string) => Promise<string | null>;
    };
  }
}
