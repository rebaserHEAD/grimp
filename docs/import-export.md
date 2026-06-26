# Import / Export Pipeline

The import/export pipeline handles loading and saving SS14 map files (`.yml`). It is designed for lossless roundtripping, importing a map and immediately exporting it should produce an equivalent file.

## SS14 Map Format

The editor supports format 6 and format 7 maps.

### Format 6

```yaml
meta:
  format: 6
  postmapinit: false

tilemap:
  0: Space
  1: FloorSteel

entities:
- proto: ""           # Structural entities (map + grid)
  entities:
  - uid: 0            # Map entity
    components: [MetaData, Transform, Map, Broadphase, OccluderTree]
  - uid: 1            # Grid entity
    components: [MetaData, Transform, MapGrid]
- proto: APCBasic     # Placed entities grouped by prototype
  entities:
  - uid: 100
    components: [Transform, Battery, ...]
```

### Format 7 (additional top-level keys)

```yaml
meta:
  format: 7
  category: Map
  engineVersion: 272.0.0
  forkId: ""
  forkVersion: ""
  time: 02/27/2026 23:57:02
  entityCount: 3112
  postmapinit: false

maps:
- 1
grids:
- 2
orphans: []
nullspace: []

tilemap:
  0: Space
  ...

entities:
  ...
```

Format 7 adds `maps`, `grids`, `orphans`, `nullspace` top-level sections and additional meta fields (`category`, `engineVersion`, `forkId`, `forkVersion`, `time`, `entityCount`).

### Tile Chunks

Tiles are stored in 16x16 chunks within the grid entity's `MapGrid` component. Each chunk is keyed by chunk coordinate (e.g., `"-1,0"`). Tile data is base64-encoded:

| Format | Bytes/Tile | Layout |
|--------|-----------|--------|
| 6 | 6 | int32 LE typeId + uint8 flags + uint8 variant |
| 7 | 7 | int32 LE typeId + uint8 flags + uint8 variant + uint8 rotationMirroring |
| Legacy | 4 | uint32 LE typeId only |

The `rotationMirroring` byte (format 7) encodes tile rotation: 0-3 = cardinal directions, 4-7 = mirrored variants.

Total: 256 tiles x bytes/tile per chunk.

## Architecture

```
Import                              Export
------                              ------
YAML string                         ImportedMap
    |                                   |
    v                                   v
yaml.load() with SS14_SCHEMA        Build tilemap (scan unique tiles)
    |                                   |
    v                                   v
Parse meta (all fields)             Encode chunks (format-aware encoding)
    |                                   |
    v                                   v
Parse tilemap                       Emit meta + top-level keys (format 7)
    |                                   |
    v                                   v
Find MapGrid, decode chunks         Emit structural entities (preserved)
(preserve flags/variant/rotation)       |
    |                                   v
    v                               Group entities by prototype
Parse entity groups                     |
(preserve all components verbatim)      v
    |                               YAML string
    v
ImportedMap
```

## Key Types

```typescript
interface MapMeta {
  format: number;
  postmapinit: boolean;
  category?: string;        // "Map" | "Grid" etc
  engineVersion?: string;   // e.g., "272.0.0"
  forkId?: string;
  forkVersion?: string;
  time?: string;
  entityCount?: number;
}

interface ImportedMap {
  meta: MapMeta;
  tilemap: Record<number, string>;
  grid: { width, height, offsetX, offsetY, cells: TileCell[] };
  entities: ImportedEntity[];
  gridUid: number;
  mapUid: number;
  maps?: number[];           // Format 7+ top-level maps array
  grids?: number[];          // Format 7+ top-level grids array
  structuralEntityData?: Record<number, Record<string, unknown>[]>;
}

interface TileCell {
  tileId: string;
  flags?: number;            // Preserved from import
  variant?: number;          // Preserved from import
  rotationMirroring?: number; // Format 7+ only
}

interface ImportedEntity {
  uid: number;
  prototype: string;
  position: { x: number; y: number };
  rotation: number;
  components: Record<string, unknown>[];  // preserved verbatim
}
```

## Component Preservation

The pipeline preserves all entity component data verbatim. Components the editor doesn't understand (custom machine configs, access lists, etc.) are stored as raw parsed objects during import and written back unchanged during export. Only the Transform component's `pos` and `rot` fields are parsed for position/rotation.

### Structural Entity Preservation

Structural entities (map entity, grid entity) have their components preserved in `structuralEntityData`. On export, these are written back verbatim (with the MapGrid chunks rebuilt from the grid). This ensures components like `GridTree`, `Broadphase`, `OccluderTree`, and custom MetaData names survive roundtrip.

### SS14 YAML Tags

SS14 uses custom YAML tags (`!type:SoundPathSpecifier`, `!type:Color`, etc.). These are handled by `SS14_SCHEMA` in `src/import/ss14Schema.ts`:
- **Import**: Tags are parsed and wrapped with `_ss14Tag` metadata
- **Export**: `stripInternalTags()` unwraps the metadata before emitting

## Multi-Grid Import/Export

### Import

The importer returns `gridDataList: GridData[]`, one entry per grid entity found in the map file. Each `GridData` contains:

- Its own `grid` (TileGrid), `entities`, `containedEntities`
- Its own `chunkKeyOrder` and `structuralComponents` for roundtrip fidelity
- A `gridUid` matching the grid entity's UID

Entity parenting is resolved by the Transform `parent` field, each entity is assigned to the grid whose UID matches its parent.

### Export

The exporter builds chunks independently per grid via `buildGridChunksMap()`. Each grid's tiles are encoded into its own set of 16x16 chunks under the corresponding grid entity's `MapGrid` component. Structural entity data is written back per grid from preserved `structuralComponents`.

### Roundtrip Fidelity

Roundtrip tests verify byte-exact fidelity for multi-grid maps including Bagel, Box, Cork, Oasis, and Fland. Edit isolation tests verify that editing one grid (adding/removing tiles or entities) does not corrupt other grids' data.

## DecalGrid Export

Decals are stored in the grid entity's `DecalGrid` component. When decals on a grid have been modified (added, removed, moved, or properties changed), the exporter re-serializes the `DecalGrid` component from the editor's decal data. Unmodified grids preserve the original raw YAML for byte-exact roundtrip fidelity.

## Files

| File | Purpose |
|------|---------|
| `src/import/mapImporter.ts` | YAML → ImportedMap |
| `src/import/ss14Schema.ts` | Custom js-yaml schema for `!type:` tags |
| `src/import/chunkDecoder.ts` | Base64 chunk decode/encode utilities |
| `src/export/mapExporter.ts` | ImportedMap → YAML |

## Testing

- **Unit tests**, Chunk decoding/encoding roundtrip
- **Importer tests**, 10 tests covering meta, tilemap, grid, entities, positions, rotations, component preservation
- **Exporter tests**, 6 tests covering YAML generation, tilemap, grid tiles, entity preservation
- **Roundtrip tests**, 13 tests verifying import → export → reimport produces identical data, including double roundtrip stability
- **Real map roundtrip**, 8 tests loading Reach.yml (3,112 entities) and verifying lossless roundtrip
