import { describe, it, expect } from 'vitest';
import { importMap } from '../import/mapImporter';
import { exportMap } from '../export/mapExporter';

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

describe('container roundtrip', () => {
  it('import → export preserves contained entities', () => {
    const chunk = makeChunkBase64({ 0: 1 });
    const original = `meta:
  format: 6
  postmapinit: false
tilemap:
  0: Space
  1: FloorSteel
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
          tiles: ${chunk}
          version: 6
- proto: LockerBotanist
  entities:
  - uid: 100
    components:
    - type: Transform
      pos: 5.5,3.5
      parent: 1
    - type: ContainerContainer
      containers:
        entity_storage: !type:Container
          showEnts: False
          occludes: True
          ents:
          - 101
- proto: Crowbar
  entities:
  - uid: 101
    components:
    - type: Transform
      parent: 100
    - type: Physics
      canCollide: False
`;

    const map = importMap(original);
    // Verify import separated correctly
    expect(map.entities.find(e => e.uid === 100)).toBeDefined();
    expect(map.containedEntities?.[100]).toHaveLength(1);

    const exported = exportMap(map);
    // Verify exported YAML contains both the locker and its contents
    expect(exported).toContain('- proto: LockerBotanist');
    expect(exported).toContain('- proto: Crowbar');
    expect(exported).toContain('  - uid: 101');
    expect(exported).toMatch(/parent: 100/);
    expect(exported).toContain('canCollide: False');
  });

  it('double roundtrip produces stable output', () => {
    const chunk = makeChunkBase64({ 0: 1 });
    const original = `meta:
  format: 6
  postmapinit: false
tilemap:
  0: Space
  1: FloorSteel
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
          tiles: ${chunk}
          version: 6
- proto: LockerBotanist
  entities:
  - uid: 100
    components:
    - type: Transform
      pos: 5.5,3.5
      parent: 1
    - type: ContainerContainer
      containers:
        entity_storage: !type:Container
          showEnts: False
          occludes: True
          ents:
          - 101
          - 102
- proto: Crowbar
  entities:
  - uid: 101
    components:
    - type: Transform
      parent: 100
    - type: Physics
      canCollide: False
- proto: Multitool
  entities:
  - uid: 102
    components:
    - type: Transform
      parent: 100
    - type: Physics
      canCollide: False
`;

    const map1 = importMap(original);
    const exported1 = exportMap(map1);
    const map2 = importMap(exported1);
    const exported2 = exportMap(map2);

    expect(exported1).toBe(exported2);
  });
});
