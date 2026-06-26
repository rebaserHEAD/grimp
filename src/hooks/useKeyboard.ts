import { useEffect, useState } from 'react';
import type { ToolType } from '../types';

interface KeyboardActions {
  onSetTool: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onDelete?: () => void;
  onRotateEntityCW?: () => void;
  onRotateEntityCCW?: () => void;
  onCycleEntityRotationCW?: () => void;
  onCycleEntityRotationCCW?: () => void;
  onEscape?: () => void;
  onShowShortcuts?: () => void;
  onFocusSearch?: () => void;
}

const TOOL_SHORTCUTS: Record<string, ToolType> = {
  'b': 'paint',
  'e': 'erase',
  'i': 'eyedropper',
  'h': 'pan',
  'g': 'fill',
  'r': 'rectangle',
  'l': 'line',
  'c': 'circle',
  's': 'select',
  'v': 'entitySelect',
  'p': 'entityPlace',
  'k': 'cableDraw',
  'j': 'pipeDraw',
  'd': 'deviceLink',
};

export function useKeyboard(actions: KeyboardActions): { isSpaceHeld: boolean; isRHeld: boolean } {
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [isRHeld, setIsRHeld] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Focus search, must be before the input guard so it prevents
      // the browser find dialog even when an input is focused
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        actions.onFocusSearch?.();
        return;
      }

      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Space for temporary pan
      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpaceHeld(true);
        return;
      }

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        actions.onUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        actions.onRedo();
        return;
      }

      // Clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.shiftKey) {
        e.preventDefault();
        actions.onCopy?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'x' && !e.shiftKey) {
        e.preventDefault();
        actions.onCut?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey) {
        e.preventDefault();
        actions.onPaste?.();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        actions.onDelete?.();
        return;
      }
      if (e.key === 'Escape') {
        actions.onEscape?.();
        return;
      }

      // ? key: show shortcuts modal
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        actions.onShowShortcuts?.();
        return;
      }

      // Track R held for smooth rotation (R + scroll)
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
        setIsRHeld(true);
      }

      // R key: rotate entity/decal CW; Shift+R: rotate CCW (skip repeats to prevent rapid spinning)
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
        if (e.shiftKey) {
          if (actions.onRotateEntityCCW) { actions.onRotateEntityCCW(); return; }
          if (actions.onCycleEntityRotationCCW) { actions.onCycleEntityRotationCCW(); return; }
        } else {
          if (actions.onRotateEntityCW) { actions.onRotateEntityCW(); return; }
          if (actions.onCycleEntityRotationCW) { actions.onCycleEntityRotationCW(); return; }
        }
      }

      // Tool shortcuts (skip R when held as rotation modifier)
      const key = e.key.toLowerCase();
      if (key === 'r' && e.repeat) return;
      const tool = TOOL_SHORTCUTS[key];
      if (tool && !e.ctrlKey && !e.metaKey && !e.altKey) {
        actions.onSetTool(tool);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceHeld(false);
      }
      if (e.key.toLowerCase() === 'r') {
        setIsRHeld(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [actions]);

  return { isSpaceHeld, isRHeld };
}
