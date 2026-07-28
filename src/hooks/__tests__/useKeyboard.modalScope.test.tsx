import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { useKeyboard } from '../useKeyboard';

/**
 * Modal keyboard scope: while any modal is open, the global bindings must go
 * inert. Before this, they kept firing behind modals: Delete removed entities
 * behind a confirm dialog, Ctrl+Z undid edits behind Settings, and Escape
 * closed the modal AND cancelled the tool interaction underneath it in the
 * same keystroke. Modals own their keys; the hook stands down.
 */
function makeActions() {
  return {
    onSetTool: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onDelete: vi.fn(),
    onEscape: vi.fn(),
    onSave: vi.fn(),
    onShowShortcuts: vi.fn(),
  };
}

describe('useKeyboard modal scope', () => {
  it('suppresses tool shortcuts, delete, undo, save, and escape while a modal is open', () => {
    const actions = makeActions();
    renderHook(() => useKeyboard(actions, { suppressed: true }));

    fireEvent.keyDown(window, { key: 'b', code: 'KeyB' });
    fireEvent.keyDown(window, { key: 'Delete', code: 'Delete' });
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    fireEvent.keyDown(window, { key: 's', code: 'KeyS', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    expect(actions.onSetTool).not.toHaveBeenCalled();
    expect(actions.onDelete).not.toHaveBeenCalled();
    expect(actions.onUndo).not.toHaveBeenCalled();
    expect(actions.onSave).not.toHaveBeenCalled();
    expect(actions.onEscape).not.toHaveBeenCalled();
  });

  it('keeps the ? shortcuts-card toggle live, since that binding owns its modal', () => {
    const actions = makeActions();
    renderHook(() => useKeyboard(actions, { suppressed: true }));

    fireEvent.keyDown(window, { key: '?', code: 'Slash', shiftKey: true });
    expect(actions.onShowShortcuts).toHaveBeenCalledTimes(1);
  });

  it('does not arm Space or R while suppressed', () => {
    const actions = makeActions();
    const { result } = renderHook(() => useKeyboard(actions, { suppressed: true }));

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });

    expect(result.current.isSpaceHeld).toBe(false);
    expect(result.current.isRHeld).toBe(false);
  });

  it('releases keys held at the moment a modal opens, so they cannot come back stuck', () => {
    const actions = makeActions();
    const { result, rerender } = renderHook(({ suppressed }) => useKeyboard(actions, { suppressed }), {
      initialProps: { suppressed: false },
    });

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(result.current.isSpaceHeld).toBe(true);

    // Modal opens mid-hold; the keyup will go to the modal or arrive suppressed.
    rerender({ suppressed: true });
    expect(result.current.isSpaceHeld).toBe(false);

    // Modal closes: no stuck pan modifier.
    rerender({ suppressed: false });
    expect(result.current.isSpaceHeld).toBe(false);
  });

  it('behaves normally again once the modal closes', () => {
    const actions = makeActions();
    const { rerender } = renderHook(({ suppressed }) => useKeyboard(actions, { suppressed }), {
      initialProps: { suppressed: true },
    });

    fireEvent.keyDown(window, { key: 'b', code: 'KeyB' });
    expect(actions.onSetTool).not.toHaveBeenCalled();

    rerender({ suppressed: false });
    fireEvent.keyDown(window, { key: 'b', code: 'KeyB' });
    expect(actions.onSetTool).toHaveBeenCalledWith('paint');
  });
});
