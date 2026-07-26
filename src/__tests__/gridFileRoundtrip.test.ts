import { describe, it, expect } from 'vitest';
import { importMap } from '../import/mapImporter';
import { exportMap } from '../export/mapExporter';

/**
 * Grid-format files (saved ships, POIs) have no map entity: `maps: []`, and the
 * grid is registered under `orphans:`. The game's loader relies on that
 * registration, so the exporter must preserve the top-level uid lists verbatim
 * instead of fabricating a maps entry or emptying orphans.
 */

/** 16x16 chunk, 7 bytes/tile, all tiles set to tilemap index `tileIndex`. */
function chunkBase64F7(tileIndex: number): string {
  const buf = new Uint8Array(256 * 7);
  const view = new DataView(buf.buffer);
  for (let i = 0; i < 256; i++) {
    view.setInt32(i * 7, tileIndex, true);
  }
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

function makeGridFileYaml(header = ''): string {
  return `${header}meta:
  format: 7
  postmapinit: false
maps: []
grids:
- 864
orphans:
- 864
nullspace: []
tilemap:
  0: Space
  7: FloorSteel
entities:
- proto: ""
  entities:
  - uid: 864
    components:
    - type: MetaData
      name: gridfile-ship
    - type: Transform
    - type: MapGrid
      chunks:
        0,0:
          ind: 0,0
          tiles: ${chunkBase64F7(7)}
          version: 7
`;
}

describe('grid file (saved ship) roundtrip', () => {
  it('preserves maps/grids/orphans/nullspace verbatim', () => {
    const yaml = makeGridFileYaml();
    const exported = exportMap(importMap(yaml));

    expect(exported).toContain('maps: []');
    expect(exported).not.toMatch(/^maps:\s*$/m);
    expect(exported).toMatch(/^orphans:\n- 864$/m);
    expect(exported).toContain('nullspace: []');
  });

  it('is idempotent: reimport + re-export is byte-identical', () => {
    const yaml = makeGridFileYaml();
    const e1 = exportMap(importMap(yaml));
    const e2 = exportMap(importMap(e1));
    expect(e2).toBe(e1);
  });

  it('does not fabricate a map uid on double roundtrip', () => {
    const yaml = makeGridFileYaml();
    const e1 = exportMap(importMap(yaml));
    const e2 = exportMap(importMap(e1));
    expect(e2).toContain('maps: []');
    expect(e2).not.toMatch(/^- 0$/m);
  });
});

describe('leading comment preservation', () => {
  const header =
    '# SPDX-FileCopyrightText: 2025 Example Author\n' + '#\n' + '# SPDX-License-Identifier: AGPL-3.0-or-later\n' + '\n';

  it('preserves SPDX license headers through roundtrip', () => {
    const yaml = makeGridFileYaml(header);
    const exported = exportMap(importMap(yaml));

    expect(exported.startsWith(header)).toBe(true);
    expect(exported).toContain('SPDX-License-Identifier: AGPL-3.0-or-later');
  });

  it('emits no leading lines when the original had none', () => {
    const exported = exportMap(importMap(makeGridFileYaml()));
    expect(exported.startsWith('meta:')).toBe(true);
  });
});
