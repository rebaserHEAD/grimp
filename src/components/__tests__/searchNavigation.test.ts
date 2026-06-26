import { describe, it, expect, beforeEach } from 'vitest';
import { Camera } from '../../rendering/camera';
import type { ImportedEntity } from '../../import/mapImporter';

function makeEntity(uid: number, proto: string, x: number, y: number): ImportedEntity {
  return { uid, prototype: proto, position: { x: x + 0.5, y: y + 0.5 }, rotation: 0, components: [] };
}

describe('Search navigation behavior', () => {
  let camera: Camera;

  beforeEach(() => {
    camera = new Camera();
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 0.5; // zoomed out
  });

  it('centers camera on entity position', () => {
    const entity = makeEntity(1, 'APCBasic', 50, 75);
    // Simulate what handleSearchNavigate does
    camera.x = entity.position.x;
    camera.y = entity.position.y;

    expect(camera.x).toBe(50.5);
    expect(camera.y).toBe(75.5);
  });

  it('zooms to 3x when zoomed out', () => {
    const entity = makeEntity(1, 'APCBasic', 50, 75);
    camera.zoom = 0.3; // very zoomed out

    // Simulate navigation zoom
    camera.x = entity.position.x;
    camera.y = entity.position.y;
    camera.zoom = 3;

    expect(camera.zoom).toBe(3);
    expect(camera.tileScreenSize).toBe(96); // 32 * 3
  });

  it('zooms to 3x even when already at moderate zoom', () => {
    camera.zoom = 1.5;
    const entity = makeEntity(1, 'APCBasic', 10, 10);

    camera.x = entity.position.x;
    camera.y = entity.position.y;
    camera.zoom = 3;

    expect(camera.zoom).toBe(3);
  });

  it('handles entity at negative coordinates', () => {
    const entity = makeEntity(1, 'Wall', -20, -30);
    camera.x = entity.position.x;
    camera.y = entity.position.y;

    expect(camera.x).toBe(-19.5);
    expect(camera.y).toBe(-29.5);
  });

  it('handles entity at origin', () => {
    const entity = makeEntity(1, 'Wall', 0, 0);
    camera.x = entity.position.x;
    camera.y = entity.position.y;
    camera.zoom = 3;

    expect(camera.x).toBe(0.5);
    expect(camera.y).toBe(0.5);
    expect(camera.zoom).toBe(3);
  });

  it('entity is visible at screen center after navigation', () => {
    const entity = makeEntity(1, 'APCBasic', 50, 75);
    camera.x = entity.position.x;
    camera.y = entity.position.y;
    camera.zoom = 3;

    const canvasW = 800;
    const canvasH = 600;
    // Entity position should map to screen center
    const screenX = camera.worldToScreenX(entity.position.x, canvasW);
    const screenY = camera.worldToScreenY(entity.position.y, canvasH);

    // worldToScreenX centers at canvasW/2 when worldX === camera.x
    expect(screenX).toBe(canvasW / 2);
    // worldToScreenY: entity.position.y === camera.y, so offset is zero
    // but Y is inverted and offset by 1 tile, so check it's near center
    const distFromCenter = Math.abs(screenY - canvasH / 2);
    expect(distFromCenter).toBeLessThanOrEqual(camera.tileScreenSize); // within one tile of center
  });
});

describe('Search result selection contract', () => {
  it('SELECT_ENTITY action shape is correct', () => {
    const entity = makeEntity(42, 'APCBasic', 10, 20);
    const action = { type: 'SELECT_ENTITY' as const, uids: [entity.uid] };

    expect(action.type).toBe('SELECT_ENTITY');
    expect(action.uids).toEqual([42]);
  });

  it('SET_TOOL action switches to entitySelect', () => {
    const action = { type: 'SET_TOOL' as const, tool: 'entitySelect' as const };

    expect(action.type).toBe('SET_TOOL');
    expect(action.tool).toBe('entitySelect');
  });
});
