# External Dependencies on SS14 / Robust Toolbox

This document catalogs every place the map editor depends on SS14 game engine (Robust Toolbox) internals, content structures, or serialization formats. These are the coupling points that could break from upstream changes.

The concern from SS14 developers is that this tool is a "handrolled data parser", it parses RT-created YAML with custom types externally, meaning changes to content, serialization, or core components can break it. This document captures every such dependency so they can be monitored and maintained.

---

## 1. YAML Custom Type Tags (`!type:*`)

**File**: `src/import/ss14Schema.ts`

RT serializes .NET types as YAML tags like `!type:SoundPathSpecifier`, `!type:Color`, etc. The editor defines a custom JS-YAML schema with three type constructors (mapping, scalar, sequence) to handle these.

| Dependency | Detail | Breaking Change |
|------------|--------|-----------------|
| `!type:` tag prefix | All RT custom types use this prefix | Tag format change (e.g., `!rt:`) |
| Tag body kinds | Supports mapping, scalar, sequence | New kind added (binary, enum) |
| Type content format | Preserved as-is (opaque passthrough) | None, content is not interpreted |

**Mitigation**: The schema treats tag bodies as opaque data (passthrough), so individual type serialization changes don't break parsing. Only the tag format itself is fragile.

---

## 2. Map Format Structure

**Files**: `src/import/mapImporter.ts`, `src/export/mapExporter.ts`

### Format Versions

The editor supports map format versions 4, 6, and 7, each with different chunk tile encoding:

| Format | Bytes/Tile | Layout |
|--------|-----------|--------|
| 4 | 4 | int32 typeId |
| 6 | 6 | int32 typeId + uint8 flags + uint8 variant |
| 7 | 7 | format 6 + uint8 rotationMirroring |

**Breaking change**: A new format version (8+) with different byte layout would require a new decoder branch.

### Top-Level YAML Structure

```yaml
meta:
  format: 6
  postmapinit: false
  # engineVersion, forkId, forkVersion, time, entityCount
tilemap:
  0: Space
  1: FloorSteel
entities:
  - proto: ""           # structural entity (map or grid)
    entities:
      - uid: 1
        components:
          - type: Map
  - proto: ""           # grid entity
    entities:
      - uid: 2
        components:
          - type: MapGrid
            chunks: { "0,0": { ind: "base64..." } }
          - type: Transform
            parent: 1
  - proto: WallSolid     # content entities
    entities:
      - uid: 100
        components:
          - type: Transform
            pos: "5.5,3.5"
            parent: 2
```

| Dependency | Detail | Breaking Change |
|------------|--------|-----------------|
| `meta.format` | Selects chunk decoder | New format number with new encoding |
| `meta.postmapinit` | Preserved for RT compatibility | Field removal or rename |
| `tilemap` section | Maps tile index → tile ID string | Format change (e.g., array instead of map) |
| Structural entities with `proto: ""` | Map and grid entities have empty prototype | Non-empty prototype for structural entities |
| `maps:` / `grids:` / `orphans:` / `nullspace:` keys (format 7+) | Top-level UID lists | Key removal or rename |
| Document terminator `...` | Preserved for byte-exact roundtrip | Removal would break roundtrip |

### Chunk Encoding

```yaml
chunks:
  "cx,cy":              # chunk key format: "x,y"
    ind: base64_data    # tile data, base64-encoded binary
    version: 6          # format version for this chunk
```

| Dependency | Detail | Breaking Change |
|------------|--------|-----------------|
| Chunk key format `"x,y"` | String key with comma separator | Different key format |
| `ind` field name | Contains base64 tile data | Field rename (e.g., `tiles`) |
| `version` field | Per-chunk format version | Removal or different versioning |
| 16x16 chunk size | Hardcoded tile count per chunk | Different chunk dimensions |
| Base64 encoding | Binary tile data in base64 | Different encoding (hex, raw) |

---

## 3. Component Types (Hardcoded Strings)

The editor explicitly references these SS14 components by string name. A rename or removal of any breaks the corresponding feature.

### Critical (import/export breaks)

| Component | Fields Read | Used In | Purpose |
|-----------|-------------|---------|---------|
| `Transform` | `pos` (string "x,y"), `rot` (string "N rad"), `parent` (int UID) | `entityHelpers.ts`, `mapImporter.ts`, `mapExporter.ts` | Entity position, rotation, grid parenting, containment detection |
| `Map` | (presence only) | `mapImporter.ts` | Identifies map structural entity |
| `MapGrid` | `chunks` (map of chunk data) | `mapImporter.ts`, `mapExporter.ts` | Tile data storage |
| `MetaData` | `name` (string) | `mapImporter.ts` | Grid display name |

### High (rendering/editing breaks)

| Component | Fields Read | Used In | Purpose |
|-----------|-------------|---------|---------|
| `Sprite` | `layers[]`, `state`, `drawdepth`, `noRot`/`norot`, `color`, `sprite` | `prototypeResolver.ts`, `entityRenderer.ts` | All entity rendering |
| `IconSmooth` | `key`, `base`, `mode` | `prototypeResolver.ts`, `entityRenderer.ts` | Wall/table/carpet neighbor smoothing |
| `PointLight` | `color`, `radius`, `energy`, `softness`, `falloff`, `offset`, `enabled` | `lightRenderer.ts`, `LightEditor.tsx` | Lighting preview |
| `ContainerContainer` | `containers.entity_storage.ents[]` | `ContainerContentsEditor.tsx` | Container contents editing |
| `SubFloorHide` | (presence only) | `entityRenderer.ts` | Infrastructure visibility under floors |
| `Occluder` | (presence only) | `wallSegments.ts` | Wall shadow casting |

### Medium (specific features break)

| Component | Fields Read | Used In | Purpose |
|-----------|-------------|---------|---------|
| `DeviceList` | `devices[]` (UID array) | `deviceLinkTool.ts`, `connectionRenderer.ts` | Air alarm → vent connections |
| `DeviceLinkSource` | `linkedPorts` (Record<uid, [port,port][]>) | `deviceLinkTool.ts`, `connectionRenderer.ts` | Door/button → shutter links |
| `EntityStorageVisuals` | `stateBaseClosed` | `prototypeResolver.ts` | Locker/crate closed-state sprite |
| `EntityTableContainerFill` | (presence only) | `ContainerContentsEditor.tsx` | Runtime-fill warning label |
| `Icon` | `state` | `prototypeResolver.ts` | Fallback sprite state |
| `AtmosPipeColor` | `color` (hex string) | `pipeDrawTool.ts` | Pipe color tinting |

---

## 4. Serialization Formats

### Rotation

```yaml
rot: 1.5707963267948966 rad    # Radians with " rad" suffix
```

**Files**: `entityHelpers.ts:22-35`, `mapImporter.ts`, `mapExporter.ts`

| Dependency | Breaking Change |
|------------|-----------------|
| Radians unit | Switch to degrees, revolutions, or quaternion |
| `" rad"` string suffix | Suffix removal, change to ` deg`, object format |
| Single float value | Change to vector (x,y,z) or quaternion (x,y,z,w) |

### Position

```yaml
pos: 90.5,17.5    # String "x,y" format
```

**Files**: `entityHelpers.ts:22-35`, `mapImporter.ts`

| Dependency | Breaking Change |
|------------|-----------------|
| String `"x,y"` format | Change to object `{x, y}`, array `[x, y]`, or 3D `"x,y,z"` |
| 2D coordinates | Addition of Z coordinate |
| Comma separator | Different separator |

### Entity UID

```yaml
- uid: 100
```

| Dependency | Breaking Change |
|------------|-----------------|
| Integer UIDs | Change to GUID/string UIDs |
| Sequential numbering | Random or hash-based UIDs |
| UID references in components (parent, devices, linkedPorts) | Reference format change |

---

## 5. Prototype System

**Files**: `src/loaders/prototypeDiscovery.ts`, `src/loaders/prototypeResolver.ts`

### Directory Structure

The editor discovers prototypes by scanning these paths:

```
Resources/Prototypes/Tiles/           → tile definitions
Resources/Prototypes/Entities/        → entity definitions
Resources/Prototypes/Catalog/         → filled entity variants (lockers, crates)
Resources/Prototypes/_ForkName/       → fork-specific overrides
```

| Dependency | Breaking Change |
|------------|-----------------|
| `Prototypes/Entities/` path | Directory relocation |
| `Prototypes/Tiles/` path | Directory relocation |
| `Prototypes/Catalog/` path | Removal of catalog system |
| `_ForkName` prefix convention | Different fork directory convention |

### Prototype YAML Format

**Tiles** (`type: tile`):
```yaml
- type: tile
  id: FloorSteel
  name: Steel
  sprite: /Textures/Tiles/steel.rsi
  variants: 4
  isSubfloor: false
  isSpace: false
```

**Entities** (`type: entity`):
```yaml
- type: entity
  id: WallSolid
  parent: BaseWall
  name: Wall
  abstract: false
  placement:
    mode: SnapgridCenter
  components:
    - type: Sprite
      sprite: /Textures/Structures/Walls/solid.rsi
```

| Dependency | Detail | Breaking Change |
|------------|--------|-----------------|
| `type: tile` / `type: entity` discriminator | Selects parser path | Different discriminator field or values |
| `parent` field (string or string[]) | Prototype inheritance chain | Format change (object, removal) |
| `abstract` field | Filters non-placeable prototypes | Removal or rename |
| `placement.mode` | Snap behavior hint | Removal (low impact) |
| `components` array with `type` field | Component lookup key | Different component identification |

### Prototype Inheritance (Shallow Merge)

**File**: `prototypeResolver.ts:200-218`

The editor resolves prototype inheritance by walking the `parent` chain and shallow-merging components by their `type` field. Child component fields override parent fields; parent fields not in child are preserved.

| Dependency | Breaking Change |
|------------|-----------------|
| Shallow merge by `type` key | RT switches to deep merge strategy |
| Single `parent` or `parent[]` field | Inheritance model change |
| Component override = full replace per field | Field-level merge semantics change |

---

## 6. RSI Sprite Format

**Files**: `src/loaders/rsiLoader.ts`, `src/loaders/spriteStateHelper.ts`

### RSI meta.json Structure

```json
{
  "version": 1,
  "size": { "x": 32, "y": 32 },
  "states": [
    { "name": "base", "directions": 4, "delays": [[100, 100]] }
  ]
}
```

| Dependency | Detail | Breaking Change |
|------------|--------|-----------------|
| `meta.json` filename | RSI metadata location | Different filename or format |
| `size.x`, `size.y` | Sprite cell dimensions | Field rename or removal |
| `states[].name` | State lookup key | Different identification scheme |
| `states[].directions` | 1 or 4 directions per state | New direction counts (8-dir) |
| `states[].delays` | Animation frame timing | Different timing format |
| PNG sprite sheet layout | Left-to-right, row-per-direction | Column-major or packed layout |

### Direction Mapping

```
0 = South, 1 = North, 2 = East, 3 = West
```

**File**: `rsiLoader.ts:74-87`

| Dependency | Breaking Change |
|------------|-----------------|
| 4-direction enum order: S, N, E, W | Direction reordering or 8-direction support |
| Direction index = row in sprite sheet | Layout change |

---

## 7. Rendering Logic Mirroring Game Behavior

### DrawDepth Values

**File**: `entityRenderer.ts:16-55`

Hardcoded numeric values from `Content.Shared/DrawDepth/DrawDepth.cs`:

```typescript
LowFloors: -22, ThickPipe: -21, ThickWire: -20, BelowFloor: -12,
FloorTiles: -11, FloorObjects: -8, Walls: -4, WallTops: -3,
WallMountedItems: -2, Tables: -1, Objects: 0, SmallObjects: 1,
Machines: 2, Items: 3, Mobs: 4, Doors: 6, Ghosts: 12, Overlays: 13
```

| Dependency | Breaking Change |
|------------|-----------------|
| Enum names and values | Adding/removing/renaming depth levels |
| Numeric ordering | Value changes that reorder layers |

### IconSmooth Algorithm

**Files**: `prototypeResolver.ts:40-79`, `entityRenderer.ts:200-392`

Mirrors `IconSmoothSystem.cs` from RT:

| Dependency | Detail | Breaking Change |
|------------|--------|-----------------|
| Smoothing modes: `Corners`, `CardinalFlags`, `Diagonal` | Mode enum values | New modes, renamed modes |
| 8-neighbor matching by `smoothKey` | Entities match if keys equal | Match logic change |
| 3-bit corner fill: CCW(1) + Diagonal(2) + CW(4) | Bit layout per corner | Bit order change |
| Corner-to-direction mapping: NE→East, SE→South, SW→West, NW→North | RSI direction for corners | Direction mapping change |
| `CardinalFlags` mode: N(1)+S(2)+E(4)+W(8) bitmask | State name = `base{bitmask}` | Bitmask encoding change |

### SubFloorHide Visibility

**File**: `entityRenderer.ts:131-158`

| Dependency | Detail | Breaking Change |
|------------|--------|-----------------|
| `SubFloorHide` component name | Presence = entity is infrastructure | Component rename/removal |
| Hardcoded prototype prefixes: `Cable`, `GasPipe`, `DisposalPipe`, etc. | Fallback detection when component missing | Prefix rename |
| `tile.isSubfloor` property | true = show pipes, false = hide | Property rename/removal |

---

## 8. Hardcoded Prototype IDs

### Pipe Prototypes

**Files**: `src/tools/pipeDrawTool.ts`, `src/algorithms/pipeFittings.ts`

```
Gas:       GasPipeStraight, GasPipeBend, GasPipeTJunction, GasPipeFourway
           + Alt1/Alt2 variants for each
Disposal:  DisposalPipe, DisposalBend, DisposalJunction, DisposalYJunction
           + DisposalJunctionFlipped
```

### Cable Prototypes

**Files**: `src/types.ts`, `src/tools/cableDrawTool.ts`

```
CableHV           → hvcable_ state prefix
CableMV           → mvcable_ state prefix
CableApcExtension → lvcable_ state prefix
```

### Auto-Link Targets

**File**: `src/algorithms/autoLink.ts`

```
AirAlarm  → GasVentPump, GasVentScrubber, AirSensor
FireAlarm → Firelock
```

### Pipe Colors

**File**: `src/tools/pipeDrawTool.ts`

```
Supply:    #0055CCFF
Return:    #990000FF
Disposal:  #886644FF
```

| Breaking Change | Impact |
|-----------------|--------|
| Any prototype rename | That pipe/cable/link type stops working |
| New pipe/cable types added | Editor doesn't know about them |
| Rotation semantics change for fittings | Pipes render at wrong angles |

---

## 9. Pipe/Cable Rotation Logic

**File**: `src/algorithms/pipeFittings.ts`

Bend and T-junction rotation formulas are reverse-engineered from game behavior:

| Fitting | Default (rotation=0) | Logic |
|---------|---------------------|-------|
| **Bend** | S+W connected (SWBend) | Rotation = which corner the bend occupies |
| **T-Junction** | Missing North (TSouth) | Rotation = which direction is missing |

| Dependency | Breaking Change |
|------------|-----------------|
| Bend default frame = SWBend | Default frame change |
| T-Junction default = missing North | Default frame change |
| Rotation in radians (0, π/2, π, 3π/2) | Rotation unit change |

---

## 10. Lighting Attenuation Formula

**File**: `src/rendering/lightRenderer.ts:94-102`

Hardcoded from RT's `light_shared.swsl`:

```
s = normalized_distance [0, 1]
val = ((1 - s^2)^2) / (1 + falloff * s)
val *= energy
```

Default falloff = 6.8.

| Dependency | Breaking Change |
|------------|-----------------|
| Attenuation curve formula | RT changes the shader math |
| Default falloff value | Default changes |
| LIGHTING_HEIGHT constant | Height-based distance offset changes |

---

## 11. Byte-Exact Roundtrip Preservation

**Files**: `src/import/mapImporter.ts`, `src/export/mapExporter.ts`

The editor preserves raw YAML text lines to achieve import→export byte identity:

| What's Preserved | How | Breaking Change |
|-----------------|-----|-----------------|
| Component YAML lines | Stored as `rawYamlLines` on entities | RT changes YAML formatter output |
| Entity preamble lines (between `uid:` and `components:`) | `preambleLines` field | Structural YAML changes |
| Chunk key ordering | Preserved iteration order | Map re-serialization reorders chunks |
| Line endings | Detected and preserved | Mixed line ending changes |
| Document terminator `...` | Tracked and re-emitted | Removal of terminator |
| Tilemap ordering | Preserved as-is | Re-serialization reorders tilemap |

**Note**: Byte-exact roundtrip is the most fragile dependency, any change to RT's YAML serializer output (field ordering, quoting style, comment handling) breaks it, even if the data is semantically identical.

---

## Summary: Risk by Category

| Category | Severity | Example Breaking Change |
|----------|----------|------------------------|
| Component type strings | **CRITICAL** | Rename `Transform` → `TransformComponent` |
| Map format encoding | **CRITICAL** | New chunk format version with different byte layout |
| YAML `!type:` schema | **CRITICAL** | Tag prefix change |
| Structural entity format | **CRITICAL** | Map/Grid entity identification change |
| Serialization formats (pos, rot) | **HIGH** | Position from string to object |
| Prototype inheritance | **HIGH** | Shallow merge → deep merge |
| RSI sprite format | **HIGH** | Direction order change, layout change |
| DrawDepth values | **HIGH** | Numeric value changes |
| IconSmooth algorithm | **HIGH** | Bit layout or mode changes |
| Tile properties | **HIGH** | `isSubfloor` removal |
| Device linking structure | **MEDIUM** | DeviceList array → Set; port format change |
| Pipe/cable prototype IDs | **MEDIUM** | Any prototype rename |
| Lighting formula | **MEDIUM** | Attenuation curve change |
| Prototype directory paths | **LOW** | Directory relocation |
| Byte-exact roundtrip | **LOW** (graceful degradation) | YAML formatter output changes |
