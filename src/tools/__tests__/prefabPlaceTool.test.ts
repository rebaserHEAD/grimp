import { describe, it, expect } from 'vitest';
import { PrefabPlaceTool } from '../prefabPlaceTool';
import type { ToolContext } from '../toolTypes';
import type { PrefabData } from '../../prefab/prefabTypes';
import { createInitialState } from '../../state/editorState';

const testPrefab: PrefabData = {
  name: 'Test Room',
  width: 3,
  height: 2,
  tiles: [
    { dx: 0, dy: 0, tileId: 'Plating' },
    { dx: 1, dy: 0, tileId: 'FloorSteel' },
    { dx: 2, dy: 1, tileId: 'Plating' },
  ],
  entities: [
    { dx: 0, dy: 0, prototype: 'Wall', rotation: 0, components: [] },
    { dx: 1, dy: 1, prototype: 'APCBasic', rotation: 0, components: [] },
  ],
  deviceLinks: [],
};

function makeToolContext(): { ctx: ToolContext; dispatched: any[] } {
  const dispatched: any[] = [];
  const state = {
    ...createInitialState(),
    nextEntityId: 10,
    entityRawComponents: {} as Record<number, string[]>,
  };
  const ctx: ToolContext = {
    state,
    dispatch: (action: any) => {
      dispatched.push(action);
      if (action.type === 'APPLY_COMMAND') {
        for (const ec of action.command.entityChanges) {
          if (ec.action === 'add') {
            state.nextEntityId = Math.max(state.nextEntityId, ec.entity.uid + 1);
          }
        }
      }
    },
    camera: { tileScreenSize: 32 } as any,
    canvasW: 800,
    canvasH: 600,
    paletteItem: null,
    shiftHeld: false,
    ctrlHeld: false,
  };
  return { ctx, dispatched };
}

describe('PrefabPlaceTool', () => {
  it('does nothing on click when no prefab loaded', () => {
    const tool = new PrefabPlaceTool();
    const { ctx, dispatched } = makeToolContext();

    tool.onMouseDown(ctx, 5, 10, 0);

    expect(dispatched.length).toBe(0);
  });

  it('dispatches APPLY_COMMAND on click when prefab loaded', () => {
    const tool = new PrefabPlaceTool();
    const { ctx, dispatched } = makeToolContext();

    tool.setPrefab(testPrefab);
    tool.onMouseDown(ctx, 5, 10, 0);

    expect(dispatched.length).toBe(1);
    const cmd = dispatched[0];
    expect(cmd.type).toBe('APPLY_COMMAND');
    expect(cmd.command.label).toBe('Place prefab "Test Room"');

    // Should have tile changes
    expect(cmd.command.tileChanges.length).toBe(3);

    // Should have entity additions (2 entities)
    const additions = cmd.command.entityChanges.filter((ec: any) => ec.action === 'add');
    expect(additions.length).toBe(2);
    expect(additions[0].entity.prototype).toBe('Wall');
    expect(additions[0].entity.position.x).toBeCloseTo(5.5);
    expect(additions[0].entity.position.y).toBeCloseTo(10.5);
    expect(additions[1].entity.prototype).toBe('APCBasic');
  });

  it('stays in placement mode after stamping', () => {
    const tool = new PrefabPlaceTool();
    const { ctx, dispatched } = makeToolContext();

    tool.setPrefab(testPrefab);
    tool.onMouseDown(ctx, 5, 10, 0);
    expect(dispatched.length).toBe(1);

    // Prefab should still be set, can stamp again
    expect(tool.getPrefab()).toBe(testPrefab);
    tool.onMouseDown(ctx, 8, 10, 0);
    expect(dispatched.length).toBe(2);
  });

  it('clears prefab on deactivate', () => {
    const tool = new PrefabPlaceTool();
    tool.setPrefab(testPrefab);
    expect(tool.getPrefab()).toBe(testPrefab);

    tool.deactivate();
    expect(tool.getPrefab()).toBeNull();
  });

  it('provides dimensions via getPreviewWidth/Height', () => {
    const tool = new PrefabPlaceTool();
    expect(tool.getPreviewWidth()).toBe(0);
    expect(tool.getPreviewHeight()).toBe(0);

    tool.setPrefab(testPrefab);
    expect(tool.getPreviewWidth()).toBe(3);
    expect(tool.getPreviewHeight()).toBe(2);
  });

  it('does nothing on right click', () => {
    const tool = new PrefabPlaceTool();
    const { ctx, dispatched } = makeToolContext();

    tool.setPrefab(testPrefab);
    tool.onMouseDown(ctx, 5, 10, 2);

    expect(dispatched.length).toBe(0);
  });
});
