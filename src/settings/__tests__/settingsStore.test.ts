import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mergeSettings, loadSettings, persistSettings, flushSettings, DEFAULT_SETTINGS } from '../settingsStore';
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
