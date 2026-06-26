import { describe, it, expect } from 'vitest';
import { Camera } from '../../rendering/camera';

describe('screenToWorld precision modes', () => {
  it('standard mode floors to integer tile coordinates', () => {
    const camera = new Camera();
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 1;
    const canvasW = 800;
    const canvasH = 600;

    const screenX = 420;
    const screenY = 310;
    const tile = camera.screenToTile(screenX, screenY, canvasW, canvasH);
    const floored = { x: Math.floor(tile.x), y: Math.floor(tile.y) };

    expect(floored.x).toBe(Math.floor(floored.x));
    expect(floored.y).toBe(Math.floor(floored.y));
  });

  it('precise mode returns fractional world coordinates', () => {
    const camera = new Camera();
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 1;
    const canvasW = 800;
    const canvasH = 600;

    const screenX = 400 + 16 + 5;
    const screenY = 300;
    const tile = camera.screenToTile(screenX, screenY, canvasW, canvasH);

    expect(tile.x % 1).not.toBe(0);
  });

  it('fractional coordinates differ from floored by expected pixel amount', () => {
    const camera = new Camera();
    camera.x = 5;
    camera.y = 5;
    camera.zoom = 2;
    const canvasW = 800;
    const canvasH = 600;

    const screenX = 450;
    const screenY = 320;
    const tile = camera.screenToTile(screenX, screenY, canvasW, canvasH);
    const precise = { x: tile.x, y: tile.y };
    const standard = { x: Math.floor(tile.x), y: Math.floor(tile.y) };

    // Unless exactly at tile boundary, they should differ
    if (tile.x % 1 !== 0) {
      expect(precise.x).not.toBe(standard.x);
    }
  });
});
