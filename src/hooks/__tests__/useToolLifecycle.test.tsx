import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useToolLifecycle } from '../useToolLifecycle';
import type { ITool } from '../../tools/toolTypes';

/**
 * The wiring half of the tool-cancel lifecycle: every tool implemented
 * deactivate(), and the per-tool tests asserted what it does, but nothing in
 * the app ever called it. This hook is the caller; these tests pin that the
 * outgoing tool is cancelled exactly once per switch and never spuriously.
 */
function fakeTool(name: string): ITool {
  return {
    name,
    cursor: 'default',
    onMouseDown: vi.fn(),
    onMouseMove: vi.fn(),
    onMouseUp: vi.fn(),
    deactivate: vi.fn(),
  };
}

describe('useToolLifecycle', () => {
  it('deactivates the outgoing tool on switch, not the incoming one', () => {
    const paint = fakeTool('paint');
    const select = fakeTool('entitySelect');

    const { rerender } = renderHook(({ tool }) => useToolLifecycle(tool), {
      initialProps: { tool: paint },
    });
    expect(paint.deactivate).not.toHaveBeenCalled();

    rerender({ tool: select });
    expect(paint.deactivate).toHaveBeenCalledTimes(1);
    expect(select.deactivate).not.toHaveBeenCalled();
  });

  it('does not deactivate when re-rendered with the same tool', () => {
    const paint = fakeTool('paint');
    const { rerender } = renderHook(({ tool }) => useToolLifecycle(tool), {
      initialProps: { tool: paint },
    });
    rerender({ tool: paint });
    rerender({ tool: paint });
    expect(paint.deactivate).not.toHaveBeenCalled();
  });

  it('handles null transitions and tools without deactivate', () => {
    const bare = { name: 'bare', cursor: 'default', onMouseDown: vi.fn(), onMouseMove: vi.fn(), onMouseUp: vi.fn() };
    const paint = fakeTool('paint');

    const { rerender } = renderHook(({ tool }) => useToolLifecycle(tool), {
      initialProps: { tool: null as ITool | null },
    });
    rerender({ tool: bare as unknown as ITool });
    rerender({ tool: paint }); // bare has no deactivate: must not throw
    rerender({ tool: null });
    expect(paint.deactivate).toHaveBeenCalledTimes(1);
  });

  it('deactivates once per switch across a chain of tools', () => {
    const a = fakeTool('a');
    const b = fakeTool('b');
    const c = fakeTool('c');
    const { rerender } = renderHook(({ tool }) => useToolLifecycle(tool), {
      initialProps: { tool: a },
    });
    rerender({ tool: b }); // a -> b deactivates a
    rerender({ tool: c }); // b -> c deactivates b
    rerender({ tool: a }); // c -> a deactivates c
    expect(a.deactivate).toHaveBeenCalledTimes(1);
    expect(b.deactivate).toHaveBeenCalledTimes(1);
    expect(c.deactivate).toHaveBeenCalledTimes(1);
  });
});
