# Entity & Layer System, Design Reference

This document captures how SS14 handles entities, rendering layers, grids, and infrastructure connections. It serves as the authoritative reference for implementing entity placement, layer visibility, and infrastructure tools in the map editor.

---

## 1. SS14 Rendering Layers (DrawDepth)

**Source:** `Content.Shared/DrawDepth/DrawDepth.cs`

SS14 renders entities in a strict depth order. Lower values render first (behind), higher values render last (on top). All values are offsets from `DrawDepthTag.Default` (0).

| DrawDepth | Value | Examples |
|-----------|-------|----------|
| LowFloors | -22 | Sub-floors visible after prying tiles |
| ThickPipe | -21 | Thick pipes on subfloor |
| ThickWire | -20 | Thick wires on subfloor |
| ThinPipeAlt4 | -19 | Alt pipe layer 4 |
| ThinPipeAlt3 | -18 | Alt pipe layer 3 |
| ThinPipeAlt2 | -17 | Alt pipe layer 2 |
| ThinPipeAlt1 | -16 | Alt pipe layer 1 |
| ThinPipe | -15 | Standard thin pipes |
| ThinWire | -14 | Standard thin wires |
| BelowFloor | -13 | Entities beneath floors |
| FloorTiles | -12 | Carpets, floor decorations |
| FloorObjects | -11 | Items on floor, atmos devices |
| Puddles | -10 | Liquid puddles |
| HighFloorObjects | -5 | Holopads, levers |
| DeadMobs | -4 | Dead creatures |
| SmallMobs | -3 | Mice, drones |
| Walls | -2 | Wall structures |
| WallTops | -1 | Windows, grilles, signage |
| Objects | 0 | Furniture, crates, tables (default) |
| SmallObjects | +1 | Items on tables |
| WallMountedItems | +2 | APCs, air alarms, lights |
| LargeObjects | +3 | Tall machines |
| Items | +4 | Items above crates/tables |
| BelowMobs | +5 | Muzzle flashes |
| Mobs | +6 | Players and creatures |
| OverMobs | +7 | Effects above mobs |
| Doors | +8 | Standard doors |
| BlastDoors | +9 | Blast doors, shutters |
| Overdoors | +10 | Special overlays |
| Effects | +11 | Explosions, fire |
| Ghosts | +12 | Ghost entities |
| Overlays | +13 | Debug tools |

### Sort Order for Same-Tile Entities

When multiple entities share a position, rendering is sorted by:

1. **DrawDepth** (primary), integer comparison
2. **RenderOrder** (secondary), uint, for fine-tuning within same DrawDepth
3. **Y-position** (tertiary), screen-space bounding box for isometric sorting
4. **EntityUid** (quaternary), tiebreaker

**Source:** `RobustToolbox/Robust.Client/Graphics/Clyde/Clyde.Sprite.cs` (`SpriteDrawingOrderComparer`)

---

## 2. SubFloor Visibility

**Source:** `Content.Shared/SubFloor/SubFloorHideComponent.cs`

Infrastructure entities (pipes, cables) have a `SubFloorHide` component. Visibility is **automatic** based on the tile type they sit on:

- **Plating** (`isSubfloor: true`) → pipes/cables **visible**
- **FloorSteel**, **FloorDark**, etc. (`isSubfloor: false`) → pipes/cables **hidden**

No YAML configuration is needed. The game checks the tile's `isSubfloor` property at runtime.

### Editor Implications

The editor should provide a **"Show SubFloor"** toggle that reveals all infrastructure regardless of tile type, similar to the in-game T-ray scanner. When this toggle is off, entities with `SubFloorHide` component should be hidden when placed on non-subfloor tiles.

---

## 3. Grids and Maps (No Z-Levels)

**Source:** `RobustToolbox/docs/Map Format.md`, `RobustToolbox/Robust.Shared/Map/Components/MapGridComponent.cs`

### Key Concepts

- **Map**: Top-level container entity. Has a MapId. Contains one or more grids.
- **Grid**: A `MapGridComponent` entity parented to a map. Stores 16x16 tile chunks. Has its own world position relative to the map origin.

### SS14 Has No Z-Levels

SS14 is strictly 2D. There is no z-axis coordinate on tiles or entities. What appears as "multiple levels" is actually:

- **Multiple grids** at different world XY positions on the same map
- **Separate maps** loaded independently

### Multi-Grid YAML Structure

```yaml
maps:
  - 1                     # Map EntityUid

grids:
  - 2                     # Grid 1 (main station)
  - 29396                 # Grid 2 (arrivals shuttle)

entities:
  - proto: ""
    entities:
      - uid: 1            # Map entity
        components:
          - type: Map
      - uid: 2            # Grid 1
        components:
          - type: Transform
            pos: 0.5, 0.5
            parent: 1     # Child of map entity
          - type: MapGrid
            chunks: { ... }
      - uid: 29396        # Grid 2
        components:
          - type: Transform
            pos: -65.5, 25.2
            parent: 1     # Also child of same map
          - type: MapGrid
            chunks: { ... }
```

### Editor Implications

- **Phase 1 (current)**: Single-grid editing. The editor works with one grid at a time.
- **Future**: Multi-grid support would add a grid switcher panel. Each grid is an independent tile plane with its own offset. Grids can be repositioned relative to each other.

---

## 4. Entity Transform and Positioning

**Source:** `RobustToolbox/Robust.Shared/GameObjects/Components/Transform/TransformComponent.cs`

### Transform Component in YAML

```yaml
- type: Transform
  pos: 10.5, -34.5     # World position (float)
  rot: 1.5707963        # Rotation in radians
  parent: 2              # Parent entity UID (usually the grid)
  anchored: true         # Locked in place
```

### Key Properties

- **pos**: `Vector2` (float x, float y). For anchored entities, this is typically tile-center (x.5, y.5).
- **rot**: Rotation in radians. SS14 convention: 0 = south, π/2 = east, π = north, 3π/2 = west.
- **parent**: EntityUid. Entities on a grid have the grid entity as parent. The grid is parented to the map.
- **anchored**: When true, entity cannot move. Most structural entities are anchored.

### Entity Hierarchy

```
Map (uid 1)
└── Grid (uid 2)
    ├── Wall (uid 100, pos: 5.5, 3.5, anchored: true)
    ├── APC (uid 200, pos: 5.5, 3.5, anchored: true)  ← same tile as wall
    ├── Cable (uid 300, pos: 5.5, 3.5, anchored: true)
    └── Chair (uid 400, pos: 7.5, 3.5, anchored: false)
```

---

## 5. Entity Prototype Structure

**Source:** `Resources/Prototypes/Entities/`

### Folder Hierarchy

```
Entities/
  Structures/          ← Station infrastructure
    Walls/             ← Walls, reinforced walls
    Doors/             ← Airlocks, firelocks, windoors
    Furniture/         ← Tables, chairs, beds
    Machines/          ← Computers, medical devices, research
    Piping/
      Atmospherics/    ← Pipes, vents, scrubbers, pumps
      Disposal/        ← Disposal pipes and units
    Power/             ← APCs, cables, SMES, substations
    Lighting/          ← Light fixtures
    Wallmounts/        ← Signs, switches, intercoms
    Storage/           ← Crates, closets, canisters
    Decoration/        ← Decorative items
    Specific/          ← Department-specific equipment
  Objects/             ← Items, consumables, tools
  Mobs/                ← Creatures, NPCs
  Markers/             ← Spawn points, mapping helpers
  Effects/             ← Visual effects
  Clothing/            ← Wearable items
```

### Inheritance

Prototypes use `parent:` for inheritance. Components are merged, child overrides parent properties:

```yaml
# Abstract base
- type: entity
  id: BaseStructure
  abstract: true
  components:
  - type: Transform
    anchored: true
  - type: Physics
    bodyType: Static

# Concrete entity inheriting from base
- type: entity
  id: APCBasic
  parent: BaseAPC
  components:
  - type: Sprite
    sprite: Structures/Power/apc.rsi
```

### Categories and Placement

```yaml
categories: [ HideSpawnMenu ]   # Hidden from spawn menu
placement:
  mode: SnapgridCenter          # Snap to tile center
  snap: [ Wall ]                # Snap to walls
```

**Placement modes**: `SnapgridCenter` (structures), `PlaceFree` (furniture), `AlignAtmosPipeLayers` (pipes)

---

## 6. Connection Systems

### 6a. Power Network (Automatic via Cables)

**Source:** `Content.Server/Power/`

Power connections form **automatically** when cable entities are adjacent on the same grid. No explicit links stored in YAML.

**Three voltage tiers:**
- **HVPower**, High voltage (generators → substations)
- **MVPower**, Medium voltage (substations → APCs)
- **Apc**, Low voltage (APCs → devices)

**How APCs connect:**
```yaml
# APC has two node types:
- type: NodeContainer
  nodes:
    input:
      !type:CableDeviceNode
      nodeGroupID: MVPower    # Receives from MV cable network
    output:
      !type:CableDeviceNode
      nodeGroupID: Apc        # Provides to APC network
```

Devices connect by having `ApcPowerReceiver` component, they draw from the nearest APC network via cable adjacency. **No explicit wiring in YAML.**

### Cable Connection Visualization

**Source (in-game):** `Content.Server/Power/EntitySystems/CableVisSystem.cs`, `Content.Client/Power/Visualizers/CableVisualizerSystem.cs`

In-game, cables use a `CableVisualizer` component to dynamically select a sprite state based on neighboring cables. Each cable RSI contains 16 states (0–15) representing all possible connection combinations.

**Bitmask:** `WireVisDirFlags`, North=1, South=2, East=4, West=8

| Mask | Connections | State Example |
|------|------------|---------------|
| 0 | None (isolated) | `hvcable_0` |
| 3 | North+South | `hvcable_3` |
| 5 | North+East | `hvcable_5` |
| 12 | East+West | `hvcable_12` |
| 15 | All four | `hvcable_15` |

**Cable type → state prefix mapping:**
| Prototype | RSI | State Prefix |
|-----------|-----|--------------|
| CableHV | `Structures/Power/Cables/hv_cable.rsi` | `hvcable_` |
| CableMV | `Structures/Power/Cables/mv_cable.rsi` | `mvcable_` |
| CableApcExtension | `Structures/Power/Cables/lv_cable.rsi` | `lvcable_` |

**Editor implementation:** The entity renderer builds a spatial index of cable positions each frame, then for each cable entity computes a neighbor bitmask by checking the 4 adjacent tiles for cables of the same type. The mask is used to select the sprite state (e.g., `hvcable_5`) via `loadSprite`'s `stateOverride` parameter. This matches the in-game appearance without needing the full CableVisualizer system.

### 6a-ii. IconSmooth Rendering

**Source (in-game):** `Content.Client/IconSmoothing/IconSmoothSystem.cs`

Entities with an `IconSmooth` component (walls, windows, tables, carpets, puddles) render differently based on their neighbors. The editor replicates this system using two modes:

**SpriteInfo fields:** `iconSmoothKey` (matching key for neighbor checks), `iconSmoothBase` (state prefix), `iconSmoothMode` (`'corners'` or `'cardinalFlags'`).

#### Corners Mode (walls, windows, tables, carpets)

Each entity renders as **4 quarter-tile sprites** (one per corner: NE, SE, SW, NW). For each corner, the system checks 2 cardinal neighbors + 1 diagonal neighbor against a spatial index (`Map<"x,y", smoothKey>`) to compute a 3-bit CornerFill value:

- **Bit 1 (CounterClockwise):** Cardinal neighbor CCW from the corner
- **Bit 2 (Diagonal):** Diagonal neighbor at the corner
- **Bit 4 (Clockwise):** Cardinal neighbor CW from the corner

Per-corner cardinal assignments:
| Corner | CCW (bit 1) | Diagonal (bit 2) | CW (bit 4) | RSI Direction |
|--------|------------|-------------------|------------|---------------|
| NE | North | NE | East | East |
| SE | East | SE | South | South |
| SW | South | SW | West | West |
| NW | West | NW | North | North |

The state name is `{base}{cornerFill}` (e.g., `solid5` for a corner with CCW+CW neighbors). Each corner sprite is drawn at quarter-tile offset using the direction column from the RSI (SE→South, NE→East, NW→North, SW→West).

#### CardinalFlags Mode (puddles)

A single full-tile sprite selected by a 4-bit cardinal bitmask: N=1, S=2, E=4, W=8 (matching SS14's `CardinalConnectDirs` enum). State name: `{base}{mask}` (e.g., `splat5` for N+E connected).

#### Base and Mode Inference

When IconSmooth has no explicit `base` field (like Puddle), `inferSmoothBase()` extracts it from the baseState pattern (e.g., `"splat0"` → `"splat"`). When no explicit mode is available, `inferSmoothMode()` defaults to CardinalFlags (matching PuddleSystem runtime behavior).

#### Preview State for Palette

Entities with IconSmooth use a special baseState for palette previews:
1. Icon component's state (e.g., `'full'` for carpets)
2. `'full'` (SS14 convention for IconSmooth RSIs)
3. `{base}0` as last resort

This avoids showing quarter-tile corner pieces in the palette.

### 6b. Atmos Pipe Network (Automatic via Adjacency + Direction)

**Source:** `Content.Server/NodeContainer/Nodes/PipeNode.cs`

Pipe networks form automatically when pipe entities with compatible `PipeDirection` values are adjacent.

**Key properties:**
- **PipeDirection**: South, North, East, West, Fourway, determines which sides connect
- **AtmosPipeLayer**: Primary, Secondary (Alt1), Tertiary (Alt2), etc., visual layering only, for stacking multiple pipes on one tile
- **Rotation**: Entity rotation rotates the pipe direction

**Alt pipe prototypes** (Alt1–Alt4) exist for **visual stacking only**, multiple independent pipe networks can overlay the same tile using different visual layers.

**Vents/scrubbers** connect to pipe networks via their PipeNode and are controlled by air alarms through the device network.

### 6c. Device Linking (Explicit in YAML)

**Source:** `Content.Shared/DeviceLinking/`

Some devices have explicit signal links stored in the map YAML. This is used for:
- Air alarms → vents/scrubbers (DeviceList)
- Signal buttons → doors
- Sensors → alarms

**Two mechanisms:**

1. **DeviceLinkSource/Sink**, Direct signal ports:
```yaml
- type: DeviceLinkSource
  linkedPorts:
    201:                    # Target entity UID
    - - DoorStatus          # Source port name
      - Close               # Sink port name
```

2. **DeviceList**, Device network whitelist:
```yaml
- type: DeviceList
  devices:
  - 18094                   # UID of connected vent
  - 670                     # UID of connected scrubber
```

### 6d. Disposal Pipe Network (Automatic via Adjacency)

Works identically to atmos pipes but uses `DisposalPipe` node group. Disposal units, junctions, and routers connect based on adjacency and pipe direction.

---

## 7. Editor Layer Model

Based on the above research, the editor should expose these logical layers for visibility and editing:

| Layer | DrawDepth Range | Contents | Toggle |
|-------|----------------|----------|--------|
| **Tiles** | N/A | Floor tiles (rendered as grid) | Always visible |
| **SubFloor** | -22 to -13 | Cables (HV/MV/APC), pipes, disposal | "Show SubFloor" toggle |
| **Floor Objects** | -12 to -5 | Carpets, floor decorations, puddles | "Show Floor Objects" |
| **Structures** | -2 to -1 | Walls, windows, grilles | "Show Structures" |
| **Objects** | 0 to +3 | Furniture, machines, wall mounts | "Show Objects" |
| **Doors** | +8 to +9 | Airlocks, firelocks, blast doors | "Show Doors" |
| **Markers** | N/A | Spawn points, mapping helpers (detected by the `Marker` component, not just the name) | "Show Markers" |
| **Atmos Markers** | N/A | `AtmosFix` (VAC. / gas-fill) markers, a sub-layer of Markers | "Atmos Markers" (View menu) |

Markers are classified by their composed `Marker` component when the registry is
available, falling back to a name heuristic. This catches markers like `WarpPoint` whose
names carry no marker vocabulary. The **Atmos Markers** toggle hides just the `AtmosFix`
family (which hulls carpet across every space-adjacent tile) while leaving spawn points
and other markers visible; the Markers master toggle still hides everything.

### SubFloor Filtering

When "Show SubFloor" is **off**, entities with `SubFloorHide` component should be hidden unless the tile they sit on has `isSubfloor: true`. When "Show SubFloor" is **on**, all infrastructure is visible regardless of tile type.

This matches the in-game T-ray scanner behavior and is the most important toggle for infrastructure editing.

---

## 8. Entity Palette Design

### Browsing

The entity palette should present entities in a **category tree** derived from `sourceCategory` (the prototype file path):

```
Structures/
  Walls/
  Doors/
  Furniture/
  Machines/
  Power/          ← APCs, cables, SMES
  Piping/
    Atmospherics/ ← Vents, pipes, pumps
    Disposal/     ← Disposal system
  Lighting/
  Wallmounts/
  Storage/
Objects/
Markers/
```

### Filtering

- **Search**: Full-text search across entity ID, name, description
- **Hide abstract**: Filter out `abstract: true` entities (not placeable)
- **Hide HideSpawnMenu**: Filter `categories: [HideSpawnMenu]` by default (toggle to show)
- **Favorites/Recents**: Quick access to frequently used entities

### Sprite Preview

Each palette entry shows the entity's sprite loaded from `spriteInfo.rsiPath` + `spriteInfo.baseState`. The existing `entityRenderer.ts` async cache pattern handles this.

---

## 9. Entity Placement Flow

1. User selects entity in palette → palette item becomes `{ type: 'entity', id: prototypeId }`
2. Paint tool (or dedicated entity tool) shows ghost preview at cursor position
3. Click places entity → dispatches `APPLY_COMMAND` with `entityChanges: [{ action: 'add', entity }]`
4. Entity gets next available UID from `state.nextEntityId`
5. Position is tile-center: `{ x: tileX + 0.5, y: tileY + 0.5 }`
6. Rotation defaults to 0 (south), user can press R to rotate before placing
7. Components are populated from the resolved prototype's defaults

### Entity from Prototype

When placing a new entity, the minimum required data is:

```typescript
{
  uid: nextEntityId++,
  prototype: 'APCBasic',
  position: { x: 10.5, y: 5.5 },
  rotation: 0,
  components: []  // Empty = use prototype defaults
}
```

The map exporter only needs to emit components that **differ from prototype defaults**. For placement, we start with empty components and only add overrides (like custom names, access levels, device links).

---

## 10. Current Editor State

### What Exists (Phase 3a Complete)

- **Registry**: Loads all tile and entity prototypes with full inheritance resolution
- **Entity import**: Preserves all entity data verbatim (UID, position, rotation, all components)
- **Entity rendering**: Renders entity sprites with DrawDepth sorting, rotation, frustum culling, async sprite loading
- **Entity export**: Exports entities grouped by prototype with full component preservation
- **DrawDepth sorting**: Entities render in correct depth order (pipes → floors → walls → objects → doors)
- **Rotation-aware rendering**: Single-direction sprites rotate via canvas transform; multi-direction sprites select correct RSI direction. `noRot: true` entities (chairs, mobs) use the entity's rotation to select the correct direction frame but skip the canvas rotation transform.
- **Layer/component color tinting**: Sprite layer `color` and component-level `color` fields rendered as multiply tint with alpha support (`#RRGGBBAA` format).
- **IconSmooth rendering**: Corner-based (walls, tables, carpets) and CardinalFlags (puddles) smooth rendering with spatial neighbor analysis.
- **RSI grid layout**: Sprite sheet cells laid out left-to-right, top-to-bottom (e.g., 4-direction 32×32 sprites use a 64×64 PNG in a 2×2 grid)
- **SubFloor toggle**: "T-Ray mode" reveals infrastructure hidden under non-subfloor tiles
- **Pipe color tinting**: AtmosPipeColor from entity components applied as multiply blend (offscreen canvas compositing)
- **Cable connection visualization**: Dynamic sprite state selection based on neighbor bitmask, cables show connected lines matching in-game appearance
- **Multi-layer sprite compositing**: Entities with multiple sprite layers render all layers (e.g., spawners show green X marker + spawned entity preview). Per-layer RSI path overrides supported.
- **Layer visibility panel**: Toggle groups (SubFloor, Floor Objects, Structures, Objects, Doors, Markers, Atmos Markers)
- **Connection visualization**: Lines between DeviceList/DeviceLinkSource linked entities

### What's Missing for Phase 3b (Entity Placement)

1. **Entity palette UI**, browsable/searchable entity tree
2. **Entity placement tool**, click to place with sprite preview
3. **Entity selection/inspection**, click to select, view properties, delete
4. **Direction control**, rotate entities before/after placement

### What's Missing for Phase 4 (Infrastructure Drawing)

1. **Cable drawing tool**, place cable entities along drag path
2. **Pipe drawing tool**, place pipe entities with auto-direction-fitting
3. **Disposal drawing tool**, same as pipes but disposal network
4. **Device link editor**, connect air alarms to vents, buttons to doors
