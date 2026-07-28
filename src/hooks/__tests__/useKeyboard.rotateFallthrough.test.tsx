import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { useKeyboard } from '../useKeyboard';

/**
 * R is overloaded: rotate (when a rotate handler is wired) and the rectangle
 * tool shortcut (when none is). The fallthrough is the contract App's wiring
 * leans on: App must keep a rotate handler defined for the select-mode tools
 * even with an empty selection, or a reflexive R tap silently switches the
 * user into the rectangle TILE tool and their next drag paints tiles.
 * These tests pin the hook-side contract both ways.
 */
const BASE = { onSetTool: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn() };

function tapR(shift = false) {
  fireEvent.keyDown(window, { key: shift ? 'R' : 'r', code: 'KeyR', shiftKey: shift });
  fireEvent.keyUp(window, { key: shift ? 'R' : 'r', code: 'KeyR' });
}

describe('useKeyboard R fallthrough contract', () => {
  it('R rotates and does NOT switch tools when a rotate handler is wired', () => {
    const onSetTool = vi.fn();
    const onRotateEntityCW = vi.fn();
    renderHook(() => useKeyboard({ ...BASE, onSetTool, onRotateEntityCW }));

    tapR();

    expect(onRotateEntityCW).toHaveBeenCalledTimes(1);
    expect(onSetTool).not.toHaveBeenCalled();
  });

  it('Shift+R rotates CCW and does NOT switch tools when wired', () => {
    const onSetTool = vi.fn();
    const onRotateEntityCCW = vi.fn();
    renderHook(() => useKeyboard({ ...BASE, onSetTool, onRotateEntityCCW }));

    tapR(true);

    expect(onRotateEntityCCW).toHaveBeenCalledTimes(1);
    expect(onSetTool).not.toHaveBeenCalled();
  });

  it('R falls through to the rectangle tool when no rotate handler is wired', () => {
    const onSetTool = vi.fn();
    renderHook(() => useKeyboard({ ...BASE, onSetTool }));

    tapR();

    expect(onSetTool).toHaveBeenCalledWith('rectangle');
  });

  it('the placement-cycle handler also consumes R', () => {
    const onSetTool = vi.fn();
    const onCycleEntityRotationCW = vi.fn();
    renderHook(() => useKeyboard({ ...BASE, onSetTool, onCycleEntityRotationCW }));

    tapR();

    expect(onCycleEntityRotationCW).toHaveBeenCalledTimes(1);
    expect(onSetTool).not.toHaveBeenCalled();
  });
});
