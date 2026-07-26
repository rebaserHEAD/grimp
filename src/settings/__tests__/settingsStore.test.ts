import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mergeSettings,
  loadSettings,
  persistSettings,
  flushSettings,
  withRecentFork,
  withoutRecentFork,
  withRecentFile,
  withoutRecentFile,
  DEFAULT_SETTINGS,
  RECENT_FORKS_CAP,
  RECENT_FILES_CAP,
} from '../settingsStore';
import type { AppSettings } from '../settingsStore';

describe('mergeSettings', () => {
  it('returns defaults for null/garbage input', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(42)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });

  it('never returns the DEFAULT_SETTINGS object itself', () => {
    const merged = mergeSettings(null);
    expect(merged).not.toBe(DEFAULT_SETTINGS);
    expect(merged.view).not.toBe(DEFAULT_SETTINGS.view);
  });

  it('overlays stored values on defaults', () => {
    const merged = mergeSettings({ view: { showGrid: false } });
    expect(merged.view.showGrid).toBe(false);
    // Missing fields fall back to defaults
    expect(merged.view.showEntities).toBe(DEFAULT_SETTINGS.view.showEntities);
  });

  it('preserves unknown sections written by newer versions', () => {
    const merged = mergeSettings({ recentForks: [{ dir: 'C:/src/Triad_Sector' }] });
    expect(merged.recentForks).toEqual([{ dir: 'C:/src/Triad_Sector' }]);
    expect(merged.view).toEqual(DEFAULT_SETTINGS.view);
  });

  it('ignores explicit undefined values', () => {
    const merged = mergeSettings({ view: { showGrid: undefined } });
    expect(merged.view.showGrid).toBe(DEFAULT_SETTINGS.view.showGrid);
  });
});

describe('recent-forks helpers', () => {
  const NOW = '2026-07-26T00:00:00.000Z';
  const base = (): AppSettings => mergeSettings(null);

  it('adds a new fork at the front', () => {
    const s = withRecentFork(base(), { dir: 'C:/src/Triad_Sector', name: 'Triad_Sector' }, NOW);
    expect(s.fork.recentForks).toEqual([{ dir: 'C:/src/Triad_Sector', name: 'Triad_Sector', lastOpened: NOW }]);
  });

  it('moves a re-opened fork to the front and updates its timestamp', () => {
    let s = withRecentFork(base(), { dir: 'C:/a', name: 'a' }, '2026-01-01T00:00:00.000Z');
    s = withRecentFork(s, { dir: 'C:/b', name: 'b' }, '2026-01-02T00:00:00.000Z');
    s = withRecentFork(s, { dir: 'C:/a', name: 'a' }, NOW);
    expect(s.fork.recentForks.map((r) => r.dir)).toEqual(['C:/a', 'C:/b']);
    expect(s.fork.recentForks[0].lastOpened).toBe(NOW);
    expect(s.fork.recentForks).toHaveLength(2);
  });

  it('caps the list, evicting the oldest', () => {
    let s = base();
    for (let i = 0; i < RECENT_FORKS_CAP + 3; i++) {
      s = withRecentFork(s, { dir: `C:/fork${i}`, name: `fork${i}` }, NOW);
    }
    expect(s.fork.recentForks).toHaveLength(RECENT_FORKS_CAP);
    expect(s.fork.recentForks[0].dir).toBe(`C:/fork${RECENT_FORKS_CAP + 2}`);
    expect(s.fork.recentForks.some((r) => r.dir === 'C:/fork0')).toBe(false);
  });

  it('removes dead entries without touching the rest', () => {
    let s = withRecentFork(base(), { dir: 'C:/a', name: 'a' }, NOW);
    s = withRecentFork(s, { dir: 'C:/b', name: 'b' }, NOW);
    s = withoutRecentFork(s, 'C:/a');
    expect(s.fork.recentForks.map((r) => r.dir)).toEqual(['C:/b']);
    s = withoutRecentFork(s, 'C:/never-there');
    expect(s.fork.recentForks.map((r) => r.dir)).toEqual(['C:/b']);
  });

  it('does not mutate the input settings', () => {
    const before = base();
    withRecentFork(before, { dir: 'C:/a', name: 'a' }, NOW);
    expect(before.fork.recentForks).toEqual([]);
  });
});

describe('recent-files helpers', () => {
  const NOW = '2026-07-26T00:00:00.000Z';
  const base = (): AppSettings => mergeSettings(null);
  const triad = { path: 'C:/maps/adjutant.yml', name: 'adjutant.yml', forkDir: 'C:/src/Triad_Sector' };

  it('adds a new file at the front with its owning fork', () => {
    const s = withRecentFile(base(), triad, NOW);
    expect(s.files.recentFiles).toEqual([{ ...triad, lastOpened: NOW }]);
  });

  it('moves a re-opened file to the front and can re-home it to a new fork', () => {
    let s = withRecentFile(base(), triad, '2026-01-01T00:00:00.000Z');
    s = withRecentFile(s, { path: 'C:/maps/other.yml', name: 'other.yml', forkDir: null }, '2026-01-02T00:00:00.000Z');
    s = withRecentFile(s, { ...triad, forkDir: 'C:/src/Hyperion' }, NOW);
    expect(s.files.recentFiles.map((f) => f.path)).toEqual(['C:/maps/adjutant.yml', 'C:/maps/other.yml']);
    expect(s.files.recentFiles[0].forkDir).toBe('C:/src/Hyperion');
    expect(s.files.recentFiles[0].lastOpened).toBe(NOW);
  });

  it('caps the list, evicting the oldest', () => {
    let s = base();
    for (let i = 0; i < RECENT_FILES_CAP + 2; i++) {
      s = withRecentFile(s, { path: `C:/maps/m${i}.yml`, name: `m${i}.yml`, forkDir: null }, NOW);
    }
    expect(s.files.recentFiles).toHaveLength(RECENT_FILES_CAP);
    expect(s.files.recentFiles[0].path).toBe(`C:/maps/m${RECENT_FILES_CAP + 1}.yml`);
  });

  it('removes dead entries and leaves fork lists untouched', () => {
    let s = withRecentFork(base(), { dir: 'C:/src/Triad_Sector', name: 'Triad_Sector' }, NOW);
    s = withRecentFile(s, triad, NOW);
    s = withoutRecentFile(s, triad.path);
    expect(s.files.recentFiles).toEqual([]);
    expect(s.fork.recentForks).toHaveLength(1);
  });
});

describe('backend selection and persistence', () => {
  const get = vi.fn();
  const set = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    get.mockReset().mockResolvedValue(null);
    set.mockReset().mockResolvedValue(true);
    vi.stubGlobal('window', { electronSettings: { available: true, get, set } });
  });

  afterEach(() => {
    flushSettings();
    set.mockClear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads through the electron bridge when available', async () => {
    get.mockResolvedValue({ view: { showGrid: false } });
    const s = await loadSettings();
    expect(get).toHaveBeenCalled();
    expect(s.view.showGrid).toBe(false);
  });

  it('falls back to defaults when the bridge rejects', async () => {
    get.mockRejectedValue(new Error('ipc dead'));
    const s = await loadSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('debounces writes: rapid persists coalesce into one, latest wins', () => {
    const a: AppSettings = mergeSettings({ view: { showGrid: false } });
    const b: AppSettings = mergeSettings({ view: { showGrid: true, showPerfHUD: true } });
    persistSettings(a);
    persistSettings(b);
    expect(set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(b);
  });

  it('flushSettings writes a pending debounced snapshot immediately', () => {
    const a: AppSettings = mergeSettings({ view: { showConnections: true } });
    persistSettings(a);
    expect(set).not.toHaveBeenCalled();
    flushSettings();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(a);
    // Nothing left pending; the timer firing later must not double-write.
    vi.advanceTimersByTime(1000);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('uses localStorage when the electron bridge is absent', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    });

    persistSettings(mergeSettings({ view: { showGrid: false } }));
    vi.advanceTimersByTime(500);
    expect(storage.size).toBe(1);

    const s = await loadSettings();
    expect(s.view.showGrid).toBe(false);
  });
});
