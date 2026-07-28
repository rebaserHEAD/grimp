import { useEffect } from 'react';

/**
 * Desktop apps don't leave keyboard focus on a control after a mouse click:
 * clicking a toolbar button or a panel checkbox acts once, and the keyboard
 * still belongs to the document. The browser instead moves focus to the
 * clicked control and leaves it there, so after toggling a layer checkbox,
 * Space re-toggles it (instead of panning), Tab walks the panel, and every
 * editor shortcut dies on the useKeyboard input guard.
 *
 * This guard restores the desktop rule app-wide: after a click lands on
 * click-activated chrome (buttons, links, checkboxes, radios), focus is
 * released back to the document. Controls where post-click keyboard input is
 * the point (text fields, selects, sliders, color wells) keep focus, and
 * keyboard-driven focus (tabbing to a control deliberately) is untouched
 * because the guard only reacts to clicks.
 */

/** Input types that act on click and have no post-click keyboard role. */
const CLICK_ACTIVATED_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file']);

/** Exported for testing. */
export function isClickActivatedChrome(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'BUTTON' || tag === 'A') return true;
  if (tag === 'INPUT') return CLICK_ACTIVATED_INPUT_TYPES.has((el as HTMLInputElement).type);
  return false;
}

export function useChromeFocusGuard(): void {
  useEffect(() => {
    // Document-level bubble listener: React's root-container handlers run
    // first (the click does its job), then focus is released. A handler that
    // deliberately focuses something else during the click (e.g. the search
    // bar's clear button refocusing its text input) wins, because the guard
    // checks what is focused NOW, not what was clicked.
    const onClick = () => {
      const el = document.activeElement;
      if (isClickActivatedChrome(el)) el.blur();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
}
