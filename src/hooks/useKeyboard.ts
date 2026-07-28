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
  onRotateEntityCW?: (() => void) | undefined;
  onRotateEntityCCW?: (() => void) | undefined;
  onCycleEntityRotationCW?: (() => void) | undefined;
  onCycleEntityRotationCCW?: (() => void) | undefined;
  onEscape?: () => void;
  onShowShortcuts?: () => void;
  onFocusSearch?: () => void;
  onOpenSettings?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
}

const TOOL_SHORTCUTS: Record<string, ToolType> = {
  b: 'paint',
  e: 'erase',
  i: 'eyedropper',
  h: 'pan',
  g: 'fill',
  r: 'rectangle',
  l: 'line',
  c: 'circle',
  s: 'select',
  v: 'entitySelect',
  p: 'entityPlace',
  k: 'cableDraw',
  j: 'pipeDraw',
  d: 'deviceLink',
};

export interface KeyboardOptions {
  /**
   * True while any modal owns the keyboard. Every modal handles its own keys
   * (Escape to close, Enter to confirm), but this hook listens on window and
   * used to keep firing behind them: Delete removed entities behind a confirm
   * dialog, Ctrl+Z undid map edits behind Settings, tool shortcuts switched
   * tools invisibly, and Escape closed the modal AND cancelled the tool
   * interaction (paste ghost, marquee) underneath it in the same keystroke.
   * While suppressed, only the `?` shortcuts-card toggle stays live, since
   * that binding owns its modal.
   */
  suppressed?: boolean;
}

export function useKeyboard(
  actions: KeyboardActions,
  options: KeyboardOptions = {},
): { isSpaceHeld: boolean; isRHeld: boolean } {
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [isRHeld, setIsRHeld] = useState(false);
  const { suppressed = false } = options;

  // A modal opening mid-hold must release held keys: the matching keyup will
  // land while we are suppressed (or go to the modal), and Space/R must not
  // come back stuck when the modal closes.
  useEffect(() => {
    if (suppressed) {
      setIsSpaceHeld(false);
      setIsRHeld(false);
    }
  }, [suppressed]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (suppressed) {
        // The shortcuts card is toggled by `?` and should close by it too.
        if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          actions.onShowShortcuts?.();
        }
        return;
      }

      // Focus search, must be before the input guard so it prevents
      // the browser find dialog even when an input is focused
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        actions.onFocusSearch?.();
        return;
      }

      // Save / Save As, also before the input guard so they always fire and
      // suppress the browser's save-page dialog. The native menu shows the
      // accelerators for discoverability but doesn't register them
      // (menu.cjs registerAccelerator:false); these are the live bindings.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) actions.onSaveAs?.();
        else actions.onSave?.();
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

      // Settings (Ctrl+,). The native menu shows the accelerator but doesn't
      // register it (menu.cjs registerAccelerator:false), so this is the one
      // live binding in both builds.
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        actions.onOpenSettings?.();
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
          if (actions.onRotateEntityCCW) {
            actions.onRotateEntityCCW();
            return;
          }
          if (actions.onCycleEntityRotationCCW) {
            actions.onCycleEntityRotationCCW();
            return;
          }
        } else {
          if (actions.onRotateEntityCW) {
            actions.onRotateEntityCW();
            return;
          }
          if (actions.onCycleEntityRotationCW) {
            actions.onCycleEntityRotationCW();
            return;
          }
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

    // Held-key liveness: keyup is not guaranteed to arrive. Native menus, native
    // dialogs, and alt-tab all steal focus between keydown and keyup, and the
    // release then goes to whoever has focus. Stuck Space turns every click into
    // a pan; stuck R turns the scroll wheel into silent entity rotation. Clear
    // held state whenever the window stops being the one receiving input.
    const releaseHeldKeys = () => {
      setIsSpaceHeld(false);
      setIsRHeld(false);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') releaseHeldKeys();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseHeldKeys);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseHeldKeys);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [actions, suppressed]);

  return { isSpaceHeld, isRHeld };
}
