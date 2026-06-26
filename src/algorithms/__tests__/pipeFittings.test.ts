import { describe, it, expect } from 'vitest';
import { fitPipes, computePipeChanges } from '../pipeFittings';

describe('fitPipes', () => {
  it('single tile produces straight pipe with default rotation', () => {
    const tiles = new Set(['5,5']);
    const result = fitPipes(tiles);
    expect(result).toHaveLength(1);
    expect(result[0].prototype).toBe('GasPipeStraight');
    expect(result[0].rotation).toBe(0);
  });

  it('vertical straight (N-S neighbors)', () => {
    const tiles = new Set(['5,4', '5,5', '5,6']);
    const result = fitPipes(tiles);
    const mid = result.find(p => p.x === 5 && p.y === 5)!;
    expect(mid.prototype).toBe('GasPipeStraight');
    expect(mid.rotation).toBe(0); // vertical
  });

  it('horizontal straight (E-W neighbors)', () => {
    const tiles = new Set(['4,5', '5,5', '6,5']);
    const result = fitPipes(tiles);
    const mid = result.find(p => p.x === 5 && p.y === 5)!;
    expect(mid.prototype).toBe('GasPipeStraight');
    expect(mid.rotation).toBeCloseTo(Math.PI / 2); // horizontal
  });

  // SS14 SWBend at rotation 0 connects S+W. Rotating transforms connections:
  // rot 0: S+W, rot π/2: E+S, rot π: N+E, rot -π/2: W+N
  it('bend S+W (default orientation)', () => {
    const tiles = new Set(['5,5', '5,4', '4,5']);
    const result = fitPipes(tiles);
    const corner = result.find(p => p.x === 5 && p.y === 5)!;
    expect(corner.prototype).toBe('GasPipeBend');
    expect(corner.rotation).toBe(0);
  });

  it('bend E+S', () => {
    const tiles = new Set(['5,5', '6,5', '5,4']);
    const result = fitPipes(tiles);
    const corner = result.find(p => p.x === 5 && p.y === 5)!;
    expect(corner.prototype).toBe('GasPipeBend');
    expect(corner.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('bend N+E', () => {
    const tiles = new Set(['5,5', '5,6', '6,5']);
    const result = fitPipes(tiles);
    const corner = result.find(p => p.x === 5 && p.y === 5)!;
    expect(corner.prototype).toBe('GasPipeBend');
    expect(corner.rotation).toBeCloseTo(Math.PI);
  });

  it('bend W+N', () => {
    const tiles = new Set(['5,5', '4,5', '5,6']);
    const result = fitPipes(tiles);
    const corner = result.find(p => p.x === 5 && p.y === 5)!;
    expect(corner.prototype).toBe('GasPipeBend');
    expect(corner.rotation).toBeCloseTo(-Math.PI / 2);
  });

  // SS14 TSouth at rotation 0 is missing N (connections S+E+W). Rotating transforms which is missing:
  // rot 0: missing N, rot π/2: missing W, rot π: missing S, rot -π/2: missing E
  it('T-junction missing N (default orientation)', () => {
    // S, E, W present
    const tiles = new Set(['5,5', '5,4', '6,5', '4,5']);
    const result = fitPipes(tiles);
    const center = result.find(p => p.x === 5 && p.y === 5)!;
    expect(center.prototype).toBe('GasPipeTJunction');
    expect(center.rotation).toBe(0);
  });

  it('T-junction missing W', () => {
    // N, S, E present
    const tiles = new Set(['5,5', '5,6', '5,4', '6,5']);
    const result = fitPipes(tiles);
    const center = result.find(p => p.x === 5 && p.y === 5)!;
    expect(center.prototype).toBe('GasPipeTJunction');
    expect(center.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('T-junction missing S', () => {
    // N, E, W present
    const tiles = new Set(['5,5', '5,6', '6,5', '4,5']);
    const result = fitPipes(tiles);
    const center = result.find(p => p.x === 5 && p.y === 5)!;
    expect(center.prototype).toBe('GasPipeTJunction');
    expect(center.rotation).toBeCloseTo(Math.PI);
  });

  it('T-junction missing E', () => {
    // N, S, W present
    const tiles = new Set(['5,5', '5,6', '5,4', '4,5']);
    const result = fitPipes(tiles);
    const center = result.find(p => p.x === 5 && p.y === 5)!;
    expect(center.prototype).toBe('GasPipeTJunction');
    expect(center.rotation).toBeCloseTo(-Math.PI / 2);
  });

  it('fourway junction', () => {
    const tiles = new Set(['5,5', '5,6', '5,4', '6,5', '4,5']);
    const result = fitPipes(tiles);
    const center = result.find(p => p.x === 5 && p.y === 5)!;
    expect(center.prototype).toBe('GasPipeFourway');
    expect(center.rotation).toBe(0);
  });

  it('single connection facing east produces horizontal straight', () => {
    const tiles = new Set(['5,5', '6,5']);
    const result = fitPipes(tiles);
    const left = result.find(p => p.x === 5 && p.y === 5)!;
    expect(left.prototype).toBe('GasPipeStraight');
    expect(left.rotation).toBeCloseTo(Math.PI / 2); // horizontal
  });

  it('single connection facing north produces vertical straight', () => {
    const tiles = new Set(['5,5', '5,6']);
    const result = fitPipes(tiles);
    const bottom = result.find(p => p.x === 5 && p.y === 5)!;
    expect(bottom.prototype).toBe('GasPipeStraight');
    expect(bottom.rotation).toBe(0); // vertical
  });

  it('preserves color on gas pipes', () => {
    const tiles = new Set(['5,5']);
    const result = fitPipes(tiles, 'gas', '#0055CCFF');
    expect(result[0].color).toBe('#0055CCFF');
  });

  it('disposal family uses disposal prototypes', () => {
    const tiles = new Set(['5,5', '5,6', '5,4']);
    const result = fitPipes(tiles, 'disposal');
    const mid = result.find(p => p.x === 5 && p.y === 5)!;
    expect(mid.prototype).toBe('DisposalPipe');
    expect(mid.color).toBeUndefined();
  });

  // Disposal bends use the same rotation logic as gas bends
  it('disposal bend S+W (default orientation, same as gas)', () => {
    const tiles = new Set(['5,5', '5,4', '4,5']);
    const result = fitPipes(tiles, 'disposal');
    const corner = result.find(p => p.x === 5 && p.y === 5)!;
    expect(corner.prototype).toBe('DisposalBend');
    expect(corner.rotation).toBe(0);
  });

  it('disposal bend E+S', () => {
    const tiles = new Set(['5,5', '6,5', '5,4']);
    const result = fitPipes(tiles, 'disposal');
    const corner = result.find(p => p.x === 5 && p.y === 5)!;
    expect(corner.prototype).toBe('DisposalBend');
    expect(corner.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('disposal bend N+E', () => {
    const tiles = new Set(['5,5', '5,6', '6,5']);
    const result = fitPipes(tiles, 'disposal');
    const corner = result.find(p => p.x === 5 && p.y === 5)!;
    expect(corner.prototype).toBe('DisposalBend');
    expect(corner.rotation).toBeCloseTo(Math.PI);
  });

  it('disposal bend W+N', () => {
    const tiles = new Set(['5,5', '4,5', '5,6']);
    const result = fitPipes(tiles, 'disposal');
    const corner = result.find(p => p.x === 5 && p.y === 5)!;
    expect(corner.prototype).toBe('DisposalBend');
    expect(corner.rotation).toBeCloseTo(-Math.PI / 2);
  });

  it('disposal bend uses same rotation as gas bend for same neighbors', () => {
    const tiles = new Set(['5,5', '5,4', '4,5']);
    const gasResult = fitPipes(tiles, 'gas');
    const disposalResult = fitPipes(tiles, 'disposal');
    const gasBend = gasResult.find(p => p.x === 5 && p.y === 5)!;
    const disposalBend = disposalResult.find(p => p.x === 5 && p.y === 5)!;
    expect(gasBend.rotation).toBe(disposalBend.rotation);
  });

  it('L-shaped pipe path produces correct fittings', () => {
    // Vertical segment + horizontal segment forming an L
    const tiles = new Set(['5,3', '5,4', '5,5', '6,5', '7,5']);
    const result = fitPipes(tiles);

    const corner = result.find(p => p.x === 5 && p.y === 5)!;
    expect(corner.prototype).toBe('GasPipeBend');

    const vertMid = result.find(p => p.x === 5 && p.y === 4)!;
    expect(vertMid.prototype).toBe('GasPipeStraight');
    expect(vertMid.rotation).toBe(0); // vertical

    const horizMid = result.find(p => p.x === 6 && p.y === 5)!;
    expect(horizMid.prototype).toBe('GasPipeStraight');
    expect(horizMid.rotation).toBeCloseTo(Math.PI / 2); // horizontal
  });
});

describe('computePipeChanges', () => {
  it('adds new pipes and refits affected neighbors', () => {
    // Existing vertical pipe at (5,4) and (5,5)
    const existing = [
      { uid: 100, x: 5, y: 4 },
      { uid: 101, x: 5, y: 5 },
    ];

    // Draw new pipe extending east from (5,5) to (6,5)
    const newTiles = [{ x: 6, y: 5 }];

    const { removedUids, fittedPipes } = computePipeChanges(newTiles, existing);

    // The existing pipe at (5,5) should be removed for refitting (it was straight, now becomes a bend)
    expect(removedUids).toContain(101);

    // New tile (6,5) should be in fitted results
    const newPipe = fittedPipes.find(p => p.x === 6 && p.y === 5);
    expect(newPipe).toBeDefined();

    // (5,5) should be refitted as a bend (has N at 5,6... wait, y+1=N, y-1=S)
    // existing: (5,4) is y-1 = S neighbor of (5,5)
    // new: (6,5) is x+1 = E neighbor of (5,5)
    // So (5,5) has S+E → bend
    const refitted = fittedPipes.find(p => p.x === 5 && p.y === 5);
    expect(refitted).toBeDefined();
    expect(refitted!.prototype).toBe('GasPipeBend');
  });

  it('does not remove unaffected existing pipes', () => {
    const existing = [
      { uid: 100, x: 5, y: 3 },
      { uid: 101, x: 5, y: 4 },
      { uid: 102, x: 5, y: 5 },
    ];

    const newTiles = [{ x: 5, y: 6 }];
    const { removedUids } = computePipeChanges(newTiles, existing);

    // Only (5,5) should be affected (neighbor of new tile)
    expect(removedUids).toContain(102);
    expect(removedUids).not.toContain(100); // (5,3) is not adjacent to new tile
  });
});

