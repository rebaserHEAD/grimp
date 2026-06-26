import { describe, it, expect } from 'vitest';
import { CableDrawTool } from '../cableDrawTool';
import type { ToolContext } from '../toolTypes';
import { createInitialState } from '../../state/editorState';
import type { ImportedEntity } from '../../import/mapImporter';

function makeToolContext(entities: ImportedEntity[] = []): { ctx: ToolContext; dispatched: any[] } {
  const dispatched: any[] = [];
  const state = {
    ...createInitialState(),
    entities: [...entities],
    nextEntityId: entities.length > 0 ? Math.max(...entities.map(e => e.uid)) + 1 : 1,
  };
  const ctx: ToolContext = {
    state,
    dispatch: (action: any) => {
      dispatched.push(action);
      if (action.type === 'APPLY_COMMAND') {
        for (const ec of action.command.entityChanges) {
          if (ec.action === 'add') {
            state.entities.push(ec.entity);
            if (ec.entity.uid >= state.nextEntityId) state.nextEntityId = ec.entity.uid + 1;
          }
          if (ec.action === 'remove') {
            const idx = state.entities.findIndex(e => e.uid === ec.entity.uid);
            if (idx >= 0) state.entities.splice(idx, 1);
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

describe('CableDrawTool', () => {
  it('draws cable entities along drag path', () => {
    const tool = new CableDrawTool();
    tool.cableType = 'CableHV';
    const { ctx, dispatched } = makeToolContext();

    tool.onMouseDown(ctx, 5, 5, 0);
    tool.onMouseMove(ctx, 6, 5);
    tool.onMouseMove(ctx, 7, 5);
    tool.onMouseUp(ctx);

    expect(dispatched).toHaveLength(1);
    const cmd = dispatched[0].command;
    expect(cmd.entityChanges).toHaveLength(3);
    expect(cmd.entityChanges.every((ec: any) => ec.action === 'add')).toBe(true);
    expect(cmd.entityChanges.every((ec: any) => ec.entity.prototype === 'CableHV')).toBe(true);
  });

  it('does not duplicate cables on existing positions', () => {
    const existing: ImportedEntity = {
      uid: 1, prototype: 'CableHV',
      position: { x: 5.5, y: 5.5 }, rotation: 0, components: [],
    };
    const tool = new CableDrawTool();
    tool.cableType = 'CableHV';
    const { ctx, dispatched } = makeToolContext([existing]);

    tool.onMouseDown(ctx, 5, 5, 0);
    tool.onMouseMove(ctx, 6, 5);
    tool.onMouseUp(ctx);

    const cmd = dispatched[0].command;
    // Only tile (6,5) should be added, (5,5) already has a cable
    expect(cmd.entityChanges).toHaveLength(1);
    expect(cmd.entityChanges[0].entity.position.x).toBeCloseTo(6.5);
  });

  it('right-click erases cable at tile', () => {
    const existing: ImportedEntity = {
      uid: 1, prototype: 'CableHV',
      position: { x: 5.5, y: 5.5 }, rotation: 0, components: [],
    };
    const tool = new CableDrawTool();
    tool.cableType = 'CableHV';
    const { ctx, dispatched } = makeToolContext([existing]);

    tool.onMouseDown(ctx, 5, 5, 2);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].command.entityChanges[0].action).toBe('remove');
    expect(dispatched[0].command.entityChanges[0].entity.uid).toBe(1);
  });

  it('cables have no rotation', () => {
    const tool = new CableDrawTool();
    tool.cableType = 'CableMV';
    const { ctx, dispatched } = makeToolContext();

    tool.onMouseDown(ctx, 5, 5, 0);
    tool.onMouseUp(ctx);

    const entity = dispatched[0].command.entityChanges[0].entity;
    expect(entity.rotation).toBe(0);
    expect(entity.prototype).toBe('CableMV');
  });
});
