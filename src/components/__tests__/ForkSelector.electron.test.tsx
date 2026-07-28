import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Regression cover for the desktop copy bug that #66 would have shipped.
 *
 * `supportsDirectoryPicker` has to exclude Electron, because Chromium exposes
 * showDirectoryPicker there too and the desktop build must never take the browser File
 * System Access path. But the flag is read in more than one place, and one of them picks
 * the scanning-screen copy. Flipping the flag without guarding that site makes the DESKTOP
 * app say "Your browser is reading all files in the folder", which is both wrong and
 * user-visible.
 *
 * Nothing but a rendered test catches that, which is exactly why it went unnoticed in
 * review: `+1/-1` looks obviously correct in a diff.
 *
 * `isElectron` is resolved at module scope from `window.electronFork`, so the bridge has to
 * be installed BEFORE the module is imported. Hence resetModules plus a dynamic import
 * rather than a top-level one.
 */

/** A pickFork that never settles, parking the component in the scanning phase. */
function hangingPickFork() {
  return vi.fn(() => new Promise<never>(() => {}));
}

async function renderUnderElectron(pickFork = hangingPickFork()) {
  (window as unknown as { electronFork: unknown }).electronFork = {
    available: true,
    pickFork,
    pickDirectory: vi.fn(),
    readFile: vi.fn(),
  };
  vi.resetModules();
  const { ForkSelector } = await import('../ForkSelector');
  render(<ForkSelector onReady={vi.fn()} />);
  return { pickFork, user: userEvent.setup() };
}

/**
 * jsdom implements neither showDirectoryPicker nor the webkitdirectory input attribute, so
 * out of the box ForkSelector correctly decides no folder picking is possible at all and
 * renders its unsupported-browser notice. To exercise the Firefox/Safari fallback path we
 * have to hand it the capability jsdom is missing.
 */
function stubWebkitDirectorySupport() {
  Object.defineProperty(HTMLInputElement.prototype, 'webkitdirectory', {
    configurable: true,
    writable: true,
    value: false,
  });
  return () => {
    delete (HTMLInputElement.prototype as unknown as Record<string, unknown>).webkitdirectory;
  };
}

async function renderUnderBrowser() {
  delete (window as unknown as { electronFork?: unknown }).electronFork;
  const restore = stubWebkitDirectorySupport();
  vi.resetModules();
  const { ForkSelector } = await import('../ForkSelector');
  render(<ForkSelector onReady={vi.fn()} />);
  return { user: userEvent.setup(), restore };
}

const BROWSER_SCAN_COPY = /your browser is reading all files/i;
const GENERIC_SCAN_COPY = /may take a few seconds/i;

describe('ForkSelector under Electron', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    delete (window as unknown as { electronFork?: unknown }).electronFork;
    vi.resetModules();
  });

  it('does not tell the desktop app that a browser is reading the folder', async () => {
    // Chromium under Electron DOES expose showDirectoryPicker, so a naive capability check
    // reads true here. Assert the precondition so this test cannot silently pass because
    // jsdom happens to lack the API.
    (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = () => {};

    const { user } = await renderUnderElectron();
    await user.click(await screen.findByRole('button', { name: /open fork folder/i }));

    await waitFor(() => expect(screen.getByText(GENERIC_SCAN_COPY)).toBeTruthy());
    expect(screen.queryByText(BROWSER_SCAN_COPY)).toBeNull();

    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });

  it('routes folder opening through the native bridge, not the browser picker', async () => {
    const showDirectoryPicker = vi.fn();
    (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = showDirectoryPicker;

    const { pickFork, user } = await renderUnderElectron();
    await user.click(await screen.findByRole('button', { name: /open fork folder/i }));

    await waitFor(() => expect(pickFork).toHaveBeenCalled());
    expect(showDirectoryPicker).not.toHaveBeenCalled();

    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
});

describe('ForkSelector in a browser without the File System Access API', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });

  it('still warns that the page may hang while the folder is enumerated', async () => {
    // The Firefox/Safari fallback enumerates every file up front and can block for a long
    // time. That warning is correct THERE, and must survive the Electron guard.
    const { user, restore } = await renderUnderBrowser();
    await user.click(await screen.findByRole('button', { name: /open fork folder/i }));

    await waitFor(() => expect(screen.getByText(BROWSER_SCAN_COPY)).toBeTruthy());
    restore();
  });
});
