import { describe, it, expect } from 'vitest';
import {
  GridData,
  createEmptyGridData,
  getActiveGrid,
  getGridByUid,
} from '../gridData';

describe('gridData helpers', () => {
  it('createEmptyGridData returns valid empty grid with given uid and name', () => {
    const gd = createEmptyGridData(2, 'Test Grid');
    expect(gd.gridUid).toBe(2);
    expect(gd.name).toBe('Test Grid');
    expect(gd.grid.width).toBe(0);
    expect(gd.grid.height).toBe(0);
    expect(gd.entities).toEqual([]);
    expect(gd.containedEntities).toEqual({});
    expect(gd.worldPosition).toEqual({ x: 0, y: 0 });
    expect(gd.structuralComponents).toEqual([]);
    expect(gd.chunkKeyOrder).toEqual([]);
  });

  it('getActiveGrid returns the grid at activeGridIndex', () => {
    const grids: GridData[] = [
      createEmptyGridData(2, 'A'),
      createEmptyGridData(5, 'B'),
    ];
    expect(getActiveGrid(grids, 0).gridUid).toBe(2);
    expect(getActiveGrid(grids, 1).gridUid).toBe(5);
  });

  it('getActiveGrid clamps out-of-bounds index to last grid', () => {
    const grids = [createEmptyGridData(2, 'A')];
    expect(getActiveGrid(grids, 99).gridUid).toBe(2);
  });

  it('getGridByUid finds grid by UID', () => {
    const grids = [
      createEmptyGridData(2, 'A'),
      createEmptyGridData(8812, 'B'),
    ];
    expect(getGridByUid(grids, 8812)?.name).toBe('B');
    expect(getGridByUid(grids, 999)).toBeUndefined();
  });
});
