import { describe, it, expect } from 'vitest';
import { EntityPlaceTool } from '../entityPlaceTool';
import type { ToolContext } from '../toolTypes';
import { createInitialState } from '../../state/editorState';

function makeToolContext(): { ctx: ToolContext; dispatched: any[] } {
  const dispatched: any[] = [];
  const state = {
    ...createInitialState(),
    selectedPaletteItem: { type: 'entity' as const, id: 'APCBasic' },
    nextEntityId: 10,
  };
  const ctx: ToolContext = {
    state,
    dispatch: (action: any) => {
      dispatched.push(action);
      if (action.type === 'APPLY_COMMAND') {
        for (const ec of action.command.entityChanges) {
          if (ec.action === 'add') {
            state.nextEntityId = ec.entity.uid + 1;
          }
        }
      }
    },
    camera: { tileScreenSize: 32, worldToScreenX: (x: number) => x * 32, worldToScreenY: (y: number) => y * 32 } as any,
    canvasW: 800,
    canvasH: 600,
    paletteItem: state.selectedPaletteItem,
    shiftHeld: false,
    ctrlHeld: false,
  };
  return { ctx, dispatched };
}

describe('EntityPlaceTool', () => {
  it('ToolContext includes shiftHeld property', () => {
    const { ctx } = makeToolContext();
    expect(ctx.shiftHeld).toBe(false);
  });

  it('places entity at clicked tile', () => {
    const tool = new EntityPlaceTool();
    const { ctx, dispatched } = makeToolContext();

    tool.onMouseDown(ctx, 5, 10, 0);

    const cmd = dispatched.find(a => a.type === 'APPLY_COMMAND');
    expect(cmd).toBeDefined();
    expect(cmd.command.label).toBe('Place APCBasic');
    const added = cmd.command.entityChanges[0];
    expect(added.action).toBe('add');
    expect(added.entity.prototype).toBe('APCBasic');
    expect(added.entity.position.x).toBeCloseTo(5.5);
    expect(added.entity.position.y).toBeCloseTo(10.5);
    expect(added.entity.rotation).toBe(0);
    expect(added.entity.uid).toBe(10);
  });

  it('cycles rotation CW (0 → 3π/2 → π → π/2)', () => {
    const tool = new EntityPlaceTool();
    const { ctx, dispatched } = makeToolContext();

    tool.cycleRotation('cw');
    tool.onMouseDown(ctx, 5, 10, 0);

    const cmd = dispatched.find(a => a.type === 'APPLY_COMMAND');
    const added = cmd.command.entityChanges[0];
    expect(added.entity.rotation).toBeCloseTo(3 * Math.PI / 2);
  });

  it('cycles rotation CCW (0 → π/2 → π → 3π/2)', () => {
    const tool = new EntityPlaceTool();
    const { ctx, dispatched } = makeToolContext();

    tool.cycleRotation('ccw');
    tool.onMouseDown(ctx, 5, 10, 0);

    const cmd = dispatched.find(a => a.type === 'APPLY_COMMAND');
    const added = cmd.command.entityChanges[0];
    expect(added.entity.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('does not place on right click', () => {
    const tool = new EntityPlaceTool();
    const { ctx, dispatched } = makeToolContext();

    tool.onMouseDown(ctx, 5, 10, 2);
    expect(dispatched.length).toBe(0);
  });

  it('does nothing when no entity palette item selected', () => {
    const tool = new EntityPlaceTool();
    const { ctx, dispatched } = makeToolContext();
    ctx.state.selectedPaletteItem = { type: 'tile', id: 'FloorSteel' };

    tool.onMouseDown(ctx, 5, 10, 0);
    expect(dispatched.length).toBe(0);
  });

  it('placed entities include a Transform component', () => {
    const tool = new EntityPlaceTool();
    const { ctx, dispatched } = makeToolContext();

    tool.onMouseDown(ctx, 5, 10, 0);

    const cmd = dispatched.find(a => a.type === 'APPLY_COMMAND');
    const entity = cmd.command.entityChanges[0].entity;
    const transform = entity.components.find((c: Record<string, unknown>) => c.type === 'Transform');
    expect(transform).toBeDefined();
    expect(transform.type).toBe('Transform');
    expect(transform.pos).toBe('5.5,10.5');
    expect(transform.parent).toBe(ctx.state.gridUid);
  });

  it('places multiple entities with incrementing UIDs', () => {
    const tool = new EntityPlaceTool();
    const { ctx, dispatched } = makeToolContext();

    tool.onMouseDown(ctx, 5, 10, 0);
    tool.onMouseDown(ctx, 6, 10, 0);

    expect(dispatched.length).toBe(2);
    const uid1 = dispatched[0].command.entityChanges[0].entity.uid;
    const uid2 = dispatched[1].command.entityChanges[0].entity.uid;
    expect(uid2).toBe(uid1 + 1);
  });

  describe('renderPreview sprite ghost', () => {
    it('draws sprite image when registry provides sprite', () => {
      const tool = new EntityPlaceTool();
      const { ctx } = makeToolContext();

      // We can't easily test canvas drawing, but we can verify the method
      // doesn't throw and accepts the correct parameters
      const mockCtx = {
        save: () => {},
        restore: () => {},
        drawImage: () => {},
        strokeStyle: '',
        lineWidth: 0,
        globalAlpha: 1,
        setLineDash: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        font: '',
        fillStyle: '',
        textAlign: '',
        textBaseline: '',
        fillText: () => {},
      } as unknown as CanvasRenderingContext2D;

      // Should not throw
      tool.renderPreview(mockCtx, ctx, 5, 10);
    });

    it('falls back to dashed rect when no registry', () => {
      const tool = new EntityPlaceTool();
      const { ctx } = makeToolContext();
      ctx.state.registry = null;

      const calls: string[] = [];
      const mockCtx = {
        save: () => {},
        restore: () => {},
        drawImage: () => calls.push('drawImage'),
        strokeStyle: '',
        lineWidth: 0,
        globalAlpha: 1,
        setLineDash: () => calls.push('setLineDash'),
        strokeRect: () => calls.push('strokeRect'),
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        font: '',
        fillStyle: '',
        textAlign: '',
        textBaseline: '',
        fillText: () => {},
      } as unknown as CanvasRenderingContext2D;

      tool.renderPreview(mockCtx, ctx, 5, 10);

      // Should use strokeRect fallback, not drawImage
      expect(calls).toContain('strokeRect');
      expect(calls).not.toContain('drawImage');
    });
  });

  describe('free placement mode (shiftHeld)', () => {
    it('places entity at exact fractional coordinates when shiftHeld is true', () => {
      const tool = new EntityPlaceTool();
      const { ctx, dispatched } = makeToolContext();
      ctx.shiftHeld = true;

      tool.onMouseDown(ctx, 5.3, 10.7, 0);

      const cmd = dispatched.find(a => a.type === 'APPLY_COMMAND');
      expect(cmd).toBeDefined();
      const added = cmd.command.entityChanges[0];
      expect(added.entity.position.x).toBeCloseTo(5.3);
      expect(added.entity.position.y).toBeCloseTo(10.7);
    });

    it('places entity at tile center when shiftHeld is false (default behavior)', () => {
      const tool = new EntityPlaceTool();
      const { ctx, dispatched } = makeToolContext();
      ctx.shiftHeld = false;

      tool.onMouseDown(ctx, 5, 10, 0);

      const cmd = dispatched.find(a => a.type === 'APPLY_COMMAND');
      const added = cmd.command.entityChanges[0];
      expect(added.entity.position.x).toBeCloseTo(5.5);
      expect(added.entity.position.y).toBeCloseTo(10.5);
    });

    it('Transform component has correct fractional position in free mode', () => {
      const tool = new EntityPlaceTool();
      const { ctx, dispatched } = makeToolContext();
      ctx.shiftHeld = true;

      tool.onMouseDown(ctx, 3.25, 7.8, 0);

      const cmd = dispatched.find(a => a.type === 'APPLY_COMMAND');
      const entity = cmd.command.entityChanges[0].entity;
      const transform = entity.components.find(
        (c: Record<string, unknown>) => c.type === 'Transform',
      );
      expect(transform).toBeDefined();
      expect(transform.pos).toBe('3.25,7.8');
    });

    it('rotation still works in free placement mode', () => {
      const tool = new EntityPlaceTool();
      const { ctx, dispatched } = makeToolContext();
      ctx.shiftHeld = true;

      tool.cycleRotation('cw');
      tool.onMouseDown(ctx, 5.3, 10.7, 0);

      const cmd = dispatched.find(a => a.type === 'APPLY_COMMAND');
      const added = cmd.command.entityChanges[0];
      expect(added.entity.rotation).toBeCloseTo(3 * Math.PI / 2);
      expect(added.entity.position.x).toBeCloseTo(5.3);
      expect(added.entity.position.y).toBeCloseTo(10.7);
    });
  });
});
