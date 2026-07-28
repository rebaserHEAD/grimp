import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { useKeyboard } from '../useKeyboard';

/**
 * Held-key liveness: Space (temporary pan) and R (rotate modifier) are armed on
 * keydown and were cleared only by keyup. A desktop window loses keyups to
 * native menus, native dialogs, and alt-tab, after which the stuck state is
 * user-visible: stuck Space turns every click into a pan, stuck R turns the
 * scroll wheel into silent rotation of whatever is selected, even off-screen.
 * The hook must drop held keys whenever the window stops receiving input.
 */

const ACTIONS = { onSetTool: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn() };

function pressWithoutRelease(code: string, key: string) {
  fireEvent.keyDown(window, { code, key });
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  fireEvent(document, new Event('visibilitychange'));
}

afterEach(() => {
  // Restore the real visibilityState getter so tests stay independent.
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

describe('useKeyboard held-key liveness', () => {
  it('tracks Space and R while genuinely held and releases them on keyup', () => {
    const { result } = renderHook(() => useKeyboard(ACTIONS));

    act(() => pressWithoutRelease('Space', ' '));
    expect(result.current.isSpaceHeld).toBe(true);
    act(() => {
      fireEvent.keyUp(window, { code: 'Space', key: ' ' });
    });
    expect(result.current.isSpaceHeld).toBe(false);

    act(() => pressWithoutRelease('KeyR', 'r'));
    expect(result.current.isRHeld).toBe(true);
    act(() => {
      fireEvent.keyUp(window, { code: 'KeyR', key: 'r' });
    });
    expect(result.current.isRHeld).toBe(false);
  });

  it('drops held keys when the window blurs, so a stolen keyup cannot strand them', () => {
    const { result } = renderHook(() => useKeyboard(ACTIONS));

    act(() => {
      pressWithoutRelease('Space', ' ');
      pressWithoutRelease('KeyR', 'r');
    });
    expect(result.current.isSpaceHeld).toBe(true);
    expect(result.current.isRHeld).toBe(true);

    // Native dialog / menu / alt-tab: the window blurs, the keyup goes elsewhere.
    act(() => {
      fireEvent.blur(window);
    });
    expect(result.current.isSpaceHeld).toBe(false);
    expect(result.current.isRHeld).toBe(false);
  });

  it('drops held keys when the document becomes hidden', () => {
    const { result } = renderHook(() => useKeyboard(ACTIONS));

    act(() => pressWithoutRelease('Space', ' '));
    expect(result.current.isSpaceHeld).toBe(true);

    act(() => setVisibility('hidden'));
    expect(result.current.isSpaceHeld).toBe(false);
  });

  it('does not drop held keys on a visibility event while still visible', () => {
    const { result } = renderHook(() => useKeyboard(ACTIONS));

    act(() => pressWithoutRelease('Space', ' '));
    act(() => setVisibility('visible'));
    expect(result.current.isSpaceHeld).toBe(true);
  });
});
