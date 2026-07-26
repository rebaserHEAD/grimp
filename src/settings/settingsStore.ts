/**
 * Persisted application settings (issue #19).
 *
 * Desktop: round-trips JSON through the `electronSettings` IPC bridge to
 * `<userData>/settings.json`. Browser (dev): falls back to localStorage.
 * The renderer owns the schema; stored values merge over DEFAULT_SETTINGS so
 * missing fields default cleanly and unknown fields survive round-trips
 * (forward compat with newer app versions writing extra keys).
 *
 * Consumers planned on top of this store: keybinds (#20), radial palette
 * slots (#31), Tippy (#32), forks directory (#34), recent forks (#11).
 */

export interface ViewSettings {
  showGrid: boolean;
  showEntities: boolean;
  showSpaceBackground: boolean;
  showSubFloor: boolean;
  showConnections: boolean;
  showPerfHUD: boolean;
}

export interface AppSettings {
  view: ViewSettings;
  /** Unknown top-level sections written by newer versions are preserved. */
  [section: string]: unknown;
}

export const DEFAULT_SETTINGS: AppSettings = {
  view: {
    showGrid: true,
    showEntities: true,
    showSpaceBackground: false,
    showSubFloor: true,
    showConnections: false,
    showPerfHUD: false,
  },
};

const STORAGE_KEY = 'grimp-settings';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(defaults: Record<string, unknown>, stored: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(stored)) {
    const base = result[key];
    if (isRecord(base) && isRecord(value)) {
      result[key] = deepMerge(base, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/** Merge a stored (possibly partial/stale/garbage) blob over the defaults. */
export function mergeSettings(stored: unknown): AppSettings {
  const defaults = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as AppSettings;
  if (!isRecord(stored)) return defaults;
  return deepMerge(defaults, stored) as AppSettings;
}

function electronBridge(): Window['electronSettings'] | undefined {
  return typeof window !== 'undefined' ? window.electronSettings : undefined;
}

/** Load settings from the active backend, merged over defaults. Never throws. */
export async function loadSettings(): Promise<AppSettings> {
  try {
    const bridge = electronBridge();
    if (bridge?.available) {
      return mergeSettings(await bridge.get());
    }
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return mergeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return mergeSettings(null);
  }
}

let pendingWrite: AppSettings | null = null;
let writeTimer: ReturnType<typeof setTimeout> | undefined;

function writeNow(settings: AppSettings): void {
  const bridge = electronBridge();
  if (bridge?.available) {
    void bridge.set(settings);
    return;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    // Quota/private-mode failures are non-fatal; settings just don't persist.
  }
}

/**
 * Persist settings, debounced: toggles fire per click, so writes coalesce.
 * The latest snapshot wins.
 */
export function persistSettings(settings: AppSettings, delayMs = 400): void {
  pendingWrite = settings;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    if (pendingWrite) writeNow(pendingWrite);
    pendingWrite = null;
  }, delayMs);
}

/** Flush any pending debounced write immediately (e.g. on window close). */
export function flushSettings(): void {
  clearTimeout(writeTimer);
  if (pendingWrite) writeNow(pendingWrite);
  pendingWrite = null;
}
