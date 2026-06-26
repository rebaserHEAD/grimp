import { describe, it, expect, vi } from 'vitest';
import type { ContextMenuItem } from '../ContextMenu';

describe('ContextMenuItem type', () => {
  it('represents a basic menu item', () => {
    const action = vi.fn();
    const item: ContextMenuItem = {
      label: 'Save as Prefab',
      action,
    };

    expect(item.label).toBe('Save as Prefab');
    expect(item.disabled).toBeUndefined();
    expect(item.shortcut).toBeUndefined();

    item.action();
    expect(action).toHaveBeenCalledOnce();
  });

  it('represents a disabled menu item with shortcut', () => {
    const action = vi.fn();
    const item: ContextMenuItem = {
      label: 'Paste',
      action,
      disabled: true,
      shortcut: 'Ctrl+V',
    };

    expect(item.label).toBe('Paste');
    expect(item.disabled).toBe(true);
    expect(item.shortcut).toBe('Ctrl+V');
  });

  it('builds a complete menu items list', () => {
    const actions = {
      copy: vi.fn(),
      paste: vi.fn(),
      savePrefab: vi.fn(),
      delete: vi.fn(),
    };

    const items: ContextMenuItem[] = [
      { label: 'Copy', action: actions.copy, shortcut: 'Ctrl+C' },
      { label: 'Paste', action: actions.paste, shortcut: 'Ctrl+V', disabled: true },
      { label: 'Save as Prefab...', action: actions.savePrefab },
      { label: 'Delete', action: actions.delete, shortcut: 'Del' },
    ];

    expect(items).toHaveLength(4);
    expect(items[0].label).toBe('Copy');
    expect(items[1].disabled).toBe(true);
    expect(items[2].shortcut).toBeUndefined();
    expect(items[3].shortcut).toBe('Del');

    // Verify each action is independently callable
    items[0].action();
    expect(actions.copy).toHaveBeenCalledOnce();
    expect(actions.paste).not.toHaveBeenCalled();
  });

  it('supports empty items list', () => {
    const items: ContextMenuItem[] = [];
    expect(items).toHaveLength(0);
  });
});
