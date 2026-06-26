import { describe, it, expect } from 'vitest';
import { importMap } from '../import/mapImporter';
import { exportMap } from '../export/mapExporter';

// ---- Helper: build base64-encoded 16x16 chunk (format 6, 6 bytes/tile) ----

function makeChunkBase64(tileAssignments: Record<number, number>): string {
  const BYTES_PER_TILE = 6;
  const buf = new Uint8Array(256 * BYTES_PER_TILE);
  const view = new DataView(buf.buffer);
  for (const [idx, tileIndex] of Object.entries(tileAssignments)) {
    const offset = Number(idx) * BYTES_PER_TILE;
    view.setInt32(offset, tileIndex, true);
  }
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

// ---- Test map YAML ----

// Tilemap: 0=Space, 1=FloorDark, 2=FloorSteel, 3=Plating
// Chunk (0,0): FloorSteel at positions 0-5, Plating at 6-10, rest Space
// Chunk (1,0): FloorDark at positions 0-3, rest Space
const chunk00Assignments: Record<number, number> = {};
for (let i = 0; i <= 5; i++) chunk00Assignments[i] = 2;  // FloorSteel
for (let i = 6; i <= 10; i++) chunk00Assignments[i] = 3; // Plating

const chunk10Assignments: Record<number, number> = {};
for (let i = 0; i <= 3; i++) chunk10Assignments[i] = 1;  // FloorDark

const CHUNK_00 = makeChunkBase64(chunk00Assignments);
const CHUNK_10 = makeChunkBase64(chunk10Assignments);

const TEST_MAP_YAML = `meta:
  format: 6
  postmapinit: false

tilemap:
  0: Space
  1: FloorDark
  2: FloorSteel
  3: Plating

entities:
- proto: ""
  entities:
  - uid: 0
    components:
    - type: MetaData
      name: Map Entity
    - type: Transform
    - type: Map
      mapPaused: True
  - uid: 1
    components:
    - type: MetaData
      name: Station
    - type: Transform
      parent: 0
    - type: MapGrid
      chunks:
        0,0:
          ind: 0,0
          tiles: ${CHUNK_00}
          version: 6
        1,0:
          ind: 1,0
          tiles: ${CHUNK_10}
          version: 6
- proto: APCBasic
  entities:
  - uid: 100
    components:
    - type: Transform
      pos: 0.5,0.5
      parent: 1
    - type: Battery
      startingCharge: 25000
      maxCharge: 50000
  - uid: 103
    components:
    - type: Transform
      pos: 8.5,8.5
      parent: 1
    - type: Battery
      startingCharge: 25000
      maxCharge: 50000
- proto: Airlock
  entities:
  - uid: 101
    components:
    - type: Transform
      rot: 1.5707963267948966
      pos: 5.5,3.5
      parent: 1
- proto: GasVentPump
  entities:
  - uid: 102
    components:
    - type: Transform
      pos: 16.5,2.5
      parent: 1
    - type: AtmosDevice
      joinedGrid: 1
      enabled: True
`;

// ---- Tests ----

describe('map roundtrip', () => {
  function roundtrip() {
    const original = importMap(TEST_MAP_YAML);
    const exported = exportMap(original);
    const reimported = importMap(exported);
    return { original, exported, reimported };
  }

  it('preserves grid dimensions through import-export-reimport', () => {
    const { original, reimported } = roundtrip();

    expect(reimported.grid.width).toBe(original.grid.width);
    expect(reimported.grid.height).toBe(original.grid.height);
  });

  it('preserves grid tiles through import-export-reimport', () => {
    const { original, reimported } = roundtrip();

    expect(reimported.grid.cells.length).toBe(original.grid.cells.length);

    for (let i = 0; i < original.grid.cells.length; i++) {
      expect(reimported.grid.cells[i].tileId).toBe(original.grid.cells[i].tileId);
    }
  });

  it('preserves specific tile placements across chunks', () => {
    const { reimported } = roundtrip();
    const w = reimported.grid.width; // 32

    // Chunk (0,0): positions 0-5 should be FloorSteel
    for (let i = 0; i <= 5; i++) {
      expect(reimported.grid.cells[i].tileId).toBe('FloorSteel');
    }
    // Chunk (0,0): positions 6-10 should be Plating
    for (let i = 6; i <= 10; i++) {
      expect(reimported.grid.cells[i].tileId).toBe('Plating');
    }
    // Chunk (0,0): position 11 should be Space
    expect(reimported.grid.cells[11].tileId).toBe('Space');

    // Chunk (1,0): positions 0-3 should be FloorDark
    // Chunk (1,0) starts at column 16 in the grid
    for (let i = 0; i <= 3; i++) {
      expect(reimported.grid.cells[0 * w + 16 + i].tileId).toBe('FloorDark');
    }
    // Chunk (1,0): position 4 should be Space
    expect(reimported.grid.cells[0 * w + 16 + 4].tileId).toBe('Space');
  });

  it('preserves entity count and prototypes', () => {
    const { original, reimported } = roundtrip();

    expect(reimported.entities.length).toBe(original.entities.length);

    for (const origEntity of original.entities) {
      const match = reimported.entities.find(e => e.uid === origEntity.uid);
      expect(match).toBeDefined();
      expect(match!.prototype).toBe(origEntity.prototype);
    }
  });

  it('preserves multiple entities of the same prototype', () => {
    const { reimported } = roundtrip();

    const apcs = reimported.entities.filter(e => e.prototype === 'APCBasic');
    expect(apcs.length).toBe(2);

    const uids = apcs.map(e => e.uid).sort((a, b) => a - b);
    expect(uids).toEqual([100, 103]);
  });

  it('preserves entity positions', () => {
    const { original, reimported } = roundtrip();

    for (const origEntity of original.entities) {
      const match = reimported.entities.find(e => e.uid === origEntity.uid);
      expect(match).toBeDefined();
      expect(match!.position.x).toBeCloseTo(origEntity.position.x, 1);
      expect(match!.position.y).toBeCloseTo(origEntity.position.y, 1);
    }
  });

  it('preserves entity rotations', () => {
    const { original, reimported } = roundtrip();

    for (const origEntity of original.entities) {
      const match = reimported.entities.find(e => e.uid === origEntity.uid);
      expect(match).toBeDefined();
      expect(match!.rotation).toBeCloseTo(origEntity.rotation, 4);
    }
  });

  it('preserves non-zero rotation specifically', () => {
    const { reimported } = roundtrip();

    const airlock = reimported.entities.find(e => e.uid === 101);
    expect(airlock).toBeDefined();
    expect(airlock!.rotation).toBeCloseTo(1.5707963267948966, 4);
  });

  it('preserves component data (Battery)', () => {
    const { original, reimported } = roundtrip();

    const origApc = original.entities.find(e => e.uid === 100);
    const reimApc = reimported.entities.find(e => e.uid === 100);
    expect(reimApc).toBeDefined();

    const origBattery = origApc!.components.find((c: any) => c.type === 'Battery') as any;
    const reimBattery = reimApc!.components.find((c: any) => c.type === 'Battery') as any;
    expect(reimBattery).toBeDefined();
    expect(reimBattery.startingCharge).toBe(origBattery.startingCharge);
    expect(reimBattery.maxCharge).toBe(origBattery.maxCharge);
  });

  it('preserves component data (AtmosDevice)', () => {
    const { reimported } = roundtrip();

    const vent = reimported.entities.find(e => e.uid === 102);
    expect(vent).toBeDefined();

    const atmosDevice = vent!.components.find((c: any) => c.type === 'AtmosDevice') as any;
    expect(atmosDevice).toBeDefined();
    expect(atmosDevice.joinedGrid).toBe(1);
    // js-yaml parses 'True' as boolean true
    expect(atmosDevice.enabled).toBe(true);
  });

  it('preserves meta through roundtrip', () => {
    const { original, reimported } = roundtrip();

    expect(reimported.meta.format).toBe(original.meta.format);
    expect(reimported.meta.postmapinit).toBe(original.meta.postmapinit);
  });

  it('preserves structural UIDs', () => {
    const { original, reimported } = roundtrip();

    expect(reimported.mapUid).toBe(original.mapUid);
    expect(reimported.gridUid).toBe(original.gridUid);
  });

  it('exported YAML is valid and re-exportable (double roundtrip)', () => {
    const { reimported } = roundtrip();

    // Do a second roundtrip
    const exported2 = exportMap(reimported);
    const reimported2 = importMap(exported2);

    expect(reimported2.entities.length).toBe(reimported.entities.length);
    expect(reimported2.grid.cells.length).toBe(reimported.grid.cells.length);

    for (let i = 0; i < reimported.grid.cells.length; i++) {
      expect(reimported2.grid.cells[i].tileId).toBe(reimported.grid.cells[i].tileId);
    }

    for (const entity of reimported.entities) {
      const match = reimported2.entities.find(e => e.uid === entity.uid);
      expect(match).toBeDefined();
      expect(match!.prototype).toBe(entity.prototype);
      expect(match!.position.x).toBeCloseTo(entity.position.x, 1);
      expect(match!.position.y).toBeCloseTo(entity.position.y, 1);
      expect(match!.rotation).toBeCloseTo(entity.rotation, 4);
    }
  });
});
