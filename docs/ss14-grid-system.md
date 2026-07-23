# SS14 Grid System Reference

How grids work in SS14, documented for multi-grid support planning in the map editor.

## What Is a Grid

A grid is an entity with a `MapGridComponent` that owns a sparse collection of 16x16 tile chunks. Each grid has its own local coordinate space, positioned in the world via its `Transform` component parented to a **map entity**.

```
Map Entity (UID 1)
├── Grid Entity (UID 2), main station, pos: 0,0
├── Grid Entity (UID 8812), cargo shuttle, pos: 100,50
└── Grid Entity (UID 10258), ERT shuttle, pos: 9999,-0.5
```

A map file has one **map entity** (UID 1, the world container) and one or more **grid entities** (UID 2+), each with their own tiles and position.

## Grid Creation (In-Game Editor)

The `/mapping` command creates a new map. When a mapper places the **first tile** in empty space:

1. `PlacementManager.HandlePlacementRequest()` calls `TryFindGridAt(worldPos)`, no grid found
2. A **new grid entity** is created via `CreateGridEntity(mapId)`, spawns entity with `MapGridComponent`, parented to map
3. A chunk is created on-demand for that tile position
4. The tile is written into the chunk

**Subsequent tile placements** hit `TryFindGridAt()` again, if a grid exists at that position, the tile is added to that grid's chunks. If no grid exists there, a **new separate grid** is created.

**Key rule:** There is no proximity check. Two disconnected tile placements in empty space = two separate grid entities.

### Grid Initialization Flow for New Empty Map

1. Admin/mapper runs: `mapping 1`
2. Server creates MapId(1) via `SharedMapSystem.CreateMap()`
3. Map entity created with: MapComponent, GridTreeComponent (spatial index), Broadphase, OccluderTree
4. Map is paused (no initialization yet)
5. Mapper teleports to map: `tp 0 0 1`
6. Mapper selects tile and places it
7. PlacementManager finds no grid at coordinates → creates new grid entity
8. Grid entity spawned with MapGridComponent, parented to map
9. Chunk created on-demand, tile written into chunk
10. Subsequent placements either extend existing chunks or create new chunks

## Chunks Are Sparse

Grids don't pre-allocate space. Chunks (16x16) are created on-demand when the first non-empty tile is placed in that region. Empty tiles in non-existent chunks are silently ignored. This lets tiles exist at any coordinate without allocation overhead.

```csharp
// From SharedMapSystem.SetTile()
if (!grid.Chunks.TryGetValue(chunkIndex, out var chunk))
{
    if (tile.IsEmpty) return;  // Don't create chunk for empty tiles
    grid.Chunks[chunkIndex] = chunk = new MapChunk(
        chunkIndex.X, chunkIndex.Y, grid.ChunkSize);
}
```

## Grid Splitting

When a tile is removed that was connecting two sections of the same grid, the grid **automatically splits** into separate entities.

### Detection Algorithm

1. Each chunk maintains `ChunkSplitNode` objects, groups of connected non-empty tiles
2. Nodes track cardinal neighbors (N/S/E/W) within and across chunk boundaries
3. On tile removal, BFS traversal checks if the node graph has multiple disconnected islands
4. If multiple islands found → split triggered

### Split Execution

1. Islands sorted by size; **largest keeps the original grid UID**
2. Each smaller island gets a new grid entity via `CreateGridEntity()`
3. Tiles batch-copied to new grid via `SetTiles()`
4. Anchored entities re-anchored to new grid via `ReAnchor()`
5. Unanchored entities re-parented via `SetCoordinates()`
6. Source tiles removed from old grid
7. `GridSplitEvent` and `PostGridSplitEvent` emitted

### Controls

- `MapGridComponent.CanSplit` (default: `true`)
- CVar `physics.grid_splitting` (default: `true`)

**Source:** `RobustToolbox/Robust.Server/Physics/GridFixtureSystem.cs` (lines 176-386)

## Grid Merging

Grids **never merge automatically**. Two grids touching each other remain separate entities. Merging requires an explicit call to `GridFixtureSystem.Merge()`, typically via admin commands.

### Merge Process

1. Apply rotation + offset transform matrix to all GridB tiles
2. Copy transformed tiles to GridA via `SetTiles()`
3. Re-anchor anchored entities with rotated/offset positions
4. Re-parent unanchored entities with transformed coordinates
5. Delete GridB entity

**Source:** `RobustToolbox/Robust.Server/Physics/GridFixtureSystem.Merging.cs`

## Entity-to-Grid Parenting

Entities are parented to their grid via the Transform component:

```yaml
- type: Transform
  pos: 5.5,3.5     # Local to grid coordinate space
  parent: 2         # Grid UID
```

An entity's `pos` is relative to its parent grid's coordinate system. If the grid moves, all its entities move with it.

### Anchoring

**Anchored entities** (walls, machines) are additionally tracked in the chunk's `SnapGrid`, a per-tile list of anchored entity UIDs:

```csharp
// MapChunk internal structure
internal sealed class MapChunk
{
    private readonly SnapGridCell[,] _snapGrid;  // ChunkSize x ChunkSize
    struct SnapGridCell {
        public List<EntityUid>? Center;  // Entities anchored to this tile
    }
}
```

When an entity is anchored:
1. Added to chunk's SnapGrid cell
2. Body type set to Static
3. Position snapped to tile center
4. `AnchorStateChangedEvent` emitted

When a grid splits, anchored entities on affected tiles are re-anchored to the new grid.

## Multiple Grids in Map Files

Station maps commonly have multiple grids:

| Map | Grids | Purpose |
|-----|-------|---------|
| Hotel.yml | 1 | Main station only |
| Bagel.yml | 1 | Main station only |
| Box.yml | 2 | Main station + secondary |
| Cork.yml | 4 | Main station + cargo shuttle + ERT shuttle + other |

Secondary grids (shuttles, etc.) are positioned far from the main station via their Transform. For example, Cork's ERT Shuttle is at world position `(9999.484, -0.46875)`.

## Map File Format (Format 7)

```yaml
meta:
  format: 7
  category: Map
  engineVersion: 272.0.0
  entityCount: 29399

maps:
- 1                            # Map entity UIDs

grids:
- 2                            # Grid entity UIDs
- 8812
- 10258

orphans: []                    # grid uids saved without a map (grid documents)
nullspace: []                  # Entities in null-space

# The above is a Map document (category: Map). A Grid document (category: Grid,
# the shape of a saved ship/POI) has no map entity: maps is empty and the grid
# uid appears under both grids and orphans. See docs/import-export.md.

tilemap:
  0: Space                     # Numeric tile ID → tile definition name
  7: FloorSteel
  121: Plating

entities:
- proto: ""                    # Map/Grid system entities (no prototype)
  entities:
  - uid: 1                     # Map entity
    components:
    - type: MetaData
    - type: Transform
    - type: Map
      mapPaused: True
    - type: GridTree
    - type: Broadphase
    - type: OccluderTree

  - uid: 2                     # Grid entity
    components:
    - type: MetaData
    - type: Transform
      pos: 0.50032806,0.50115013
      parent: 1                # Parented to map
    - type: MapGrid
      chunks:
        -1,-1:
          ind: -1,-1
          tiles: WQAAAAACAHk...  # Base64-encoded tile data
          version: 7
        0,0:
          ind: 0,0
          tiles: WQAAAAACAFk...
          version: 7

- proto: WallSolid              # Regular entities grouped by prototype
  entities:
  - uid: 3
    components:
    - type: Transform
      pos: 5.5,3.5
      parent: 2                # Parented to grid
```

### Tile Encoding

Each tile in a chunk is encoded as binary data, Base64-serialized:

| Format | Bytes/Tile | Layout |
|--------|-----------|--------|
| v7 | 7 | int32 tileId + uint8 flags + uint8 variant + uint8 rotation |
| v6 | 4-6 | int32 tileId + uint8 flags + uint8 variant |
| v5 | 3-4 | uint16 tileId + uint8 flags + uint8 variant |

Tile data stored row-by-row: y from 0 to ChunkSize-1 (outer), x from 0 to ChunkSize-1 (inner).

## Physics Fixtures

`SharedGridFixtureSystem` generates polygon collision shapes matching non-empty tile regions per chunk.

- Fixtures are rectangular `PolygonShape` blocks covering contiguous non-empty tiles
- Chunked per MapChunk, not per individual tile
- Regenerated when tiles change (empty↔filled transitions)
- After fixture regeneration, split checks run

**Source:** `RobustToolbox/Robust.Shared/GameObjects/Systems/SharedGridFixtureSystem.cs`

## Placement Modes

SS14 has 11 placement modes affecting entity snap behavior:

| Mode | Snap Result | Used By |
|------|------------|---------|
| SnapgridCenter | (X.5, Y.5) tile center | Default, ~147 prototypes |
| SnapgridBorder | (X.0, Y.0) tile edge | Some infrastructure |
| AlignTileAny | (X.5, Y.5) | ~24 prototypes |
| AlignWall | Wall-mounted offsets | Wall fixtures |
| PlaceFree | Any coordinate | ~8 prototypes (markers, spawners) |
| PlaceNearby | Any coordinate, range-limited | Spawners |
| AlignTileDense | (X.5, Y.5) on occupied tiles | Specific items |
| AlignTileEmpty | (X.5, Y.5) on empty tiles | Specific items |
| AlignTileNonDense | (X.5, Y.5) on non-dense tiles | Specific items |
| AlignWallProper | Edge-snapped wall positions | Wall entities |
| AlignSimilar | Match nearest similar entity | Niche use |

**Source:** `RobustToolbox/Robust.Client/Placement/Modes/`

## Entity Position Conventions

- **Structural entities** (walls, machines, lights): always at tile center (X.5, Y.5)
- **Decorative/item entities** (pens, chairs, debris): may use fractional positions
- SpaceMall analysis: 96.48% tile-center, 3.52% fractional (1,463 of 41,505 entities)
- Fractional positions use high-precision decimals (e.g., `11.536,-37.744`), hand-placed for realism

## Coordinate Systems

### Grid Indices vs Chunk Indices

```csharp
// Grid tile index → chunk index
Vector2i chunkIndex = new Vector2i(
    (int)Math.Floor(tile.X / (float)chunkSize),
    (int)Math.Floor(tile.Y / (float)chunkSize));

// Grid tile index → position within chunk
Vector2i chunkRelative = new Vector2i(
    MathHelper.Mod(tile.X, chunkSize),
    MathHelper.Mod(tile.Y, chunkSize));
```

### Y-Axis Convention

- SS14 uses Y-up coordinate system
- Canvas rendering uses Y-down
- Handled by Camera class in our editor (flip on render)

## Key Events

| Event | When | Subscribers |
|-------|------|-------------|
| `GridInitializeEvent` | Grid entity initialized | GridFixtureSystem, content |
| `TileChangedEvent` | Tiles modified (batched) | Lighting, rendering, content |
| `AnchorStateChangedEvent` | Entity anchored/unanchored | Physics, content |
| `ReAnchorEvent` | Entity moved between grids | Content |
| `GridSplitEvent` | Grid split into multiple | Content |
| `PostGridSplitEvent` | Per new grid after split | Content |

## Key Source Files

| File | Purpose |
|------|---------|
| `RobustToolbox/Robust.Shared/GameObjects/Systems/SharedMapSystem.Map.cs` | CreateMap |
| `RobustToolbox/Robust.Shared/GameObjects/Systems/SharedMapSystem.Grid.cs` | SetTile, tile API |
| `RobustToolbox/Robust.Shared/Map/MapManager.GridCollection.cs` | CreateGridEntity |
| `RobustToolbox/Robust.Shared/Map/Components/MapGridComponent.cs` | Grid data structure |
| `RobustToolbox/Robust.Shared/Map/MapChunk.cs` | Chunk + SnapGrid |
| `RobustToolbox/Robust.Server/Physics/GridFixtureSystem.cs` | Splitting |
| `RobustToolbox/Robust.Server/Physics/GridFixtureSystem.Merging.cs` | Merging |
| `RobustToolbox/Robust.Server/Placement/PlacementManager.cs` | Tile placement |
| `RobustToolbox/Robust.Shared/EntitySerialization/Systems/MapLoaderSystem.*.cs` | Load/save |
| `RobustToolbox/Robust.Shared/EntitySerialization/MapChunkSerializer.cs` | Tile encoding |
| `RobustToolbox/Robust.Shared/GameObjects/Systems/SharedGridFixtureSystem.cs` | Physics fixtures |
| `RobustToolbox/Robust.Shared/GameObjects/Systems/SharedTransformSystem.Component.cs` | Anchoring |
| `Content.Server/Mapping/MappingCommand.cs` | /mapping command |
| `Content.Client/Mapping/MappingState.cs` | Editor UI |

## Our Editor's Current Limitations

1. **No grid splitting**, disconnected tile islands remain on the same grid in our exports. In-game, these would be separate grids.

2. **Entity rendering snaps to tile center**, fractional entity positions from imports are preserved in data but rendered at floored tile positions (fix planned).

## Multi-Grid Support (Implemented)

The editor now fully supports multiple grids per map:

1. **Import all grids**, all `MapGrid` entities are parsed into separate `GridData` entries with per-grid tiles, entities, and structural components
2. **Grid-relative rendering**, each grid's Transform offset is applied when rendering its tiles and entities
3. **Grid selection**, grid tab bar above the canvas lets users switch the active grid for editing
4. **Grid creation/deletion**, users can add new empty grids and remove existing ones via the grid tab bar
5. **Grid renaming**, grids can be given display names for easier identification
6. **Entity grid parenting**, entities are assigned to grids by Transform `parent` field; all tools operate on the active grid's entities only
7. **Export all grids**, each grid's tiles are encoded into separate chunk sets under the corresponding grid entity
8. **Roundtrip fidelity**, byte-exact roundtrip verified for multi-grid maps (Bagel, Box, Cork, Oasis, Fland)
9. **Edit isolation**, editing one grid does not affect other grids' data
