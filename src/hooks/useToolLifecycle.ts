import { useEffect, useRef } from 'react';
import type { ITool } from '../tools/toolTypes';

/**
 * Calls `deactivate()` on the outgoing tool whenever the active tool changes.
 *
 * Every tool implements deactivate() as "cancel whatever is in progress": drop
 * drag anchors and ghost previews, close pickers, cancel a pending device link,
 * revert an uncommitted paint/erase stroke. Until this hook, nothing in the app
 * ever called it, so switching tools mid-interaction (a tool shortcut pressed
 * during a drag being the easy trigger) stranded that state inside the old tool
 * singleton, where it resurfaced as ghost previews and hover-painting the next
 * time the tool was selected.
 */
export function useToolLifecycle(activeTool: ITool | null): void {
  const prevTool = useRef<ITool | null>(null);

  useEffect(() => {
    const prev = prevTool.current;
    if (prev && prev !== activeTool) {
      prev.deactivate?.();
    }
    prevTool.current = activeTool;
  }, [activeTool]);
}
