# Engine Source-of-Truth Audit

This document maps every type, constant, and hardcoded value in the map editor that represents SS14 game data back to its authoritative source in the engine (`RobustToolbox/`) or content (`Content.Shared/`, `Content.Client/`) codebase, and determines whether that source can be used for automated extraction.

---

## Legend

| Column | Meaning |
|--------|---------|
| **Editor Location** | File and line in `Tools/map_creator/src/` |
| **Engine Source** | Authoritative file in the repo (relative to repo root) |
| **How Defined** | How the data exists in C#/YAML, enum, constant, DataField, procedural, etc. |
| **Extractable?** | Whether a build-time regex/parser can reliably extract the values |
| **Source of Truth?** | Whether the engine file can serve as a direct, reliable source |

---

## 1. Map Format & Serialization

### 1.1 Map Format Version

| | |
|-|-|
| **Editor** | `src/import/mapImporter.ts`, format 4, 6, 7 detection |
| **Engine Source** | `RobustToolbox/Robust.Shared/EntitySerialization/EntitySerializer.cs:44` |
| **How Defined** | `public const int MapFormatVersion = 7;` |
| **Extractable?** | YES, regex: `MapFormatVersion\s*=\s*(\d+)` |
| **Source of Truth?** | YES, single named constant |

### 1.2 Chunk Size (Tiles Per Chunk Dimension)

| | |
|-|-|
| **Editor** | `src/import/mapImporter.ts:80`, `CHUNK_SIZE = 16` |
| **Engine Source** | `RobustToolbox/Robust.Shared/EntitySerialization/MapChunkSerializer.cs:47` |
| **How Defined** | `ushort size = 16;` (local variable in deserializer) |
| **Extractable?** | PARTIAL, it's a local variable, not a named constant. Fragile regex. |
| **Source of Truth?** | WEAK, not a proper constant; could move or be refactored. The real source is `MapGridComponent.ChunkSize` but that's a runtime default. |

### 1.3 Chunk Binary Layout (Bytes Per Tile)

| | |
|-|-|
| **Editor** | chunk decode/encode inline in `src/import/mapImporter.ts` and `src/export/mapExporter.ts`, format 4: 4 bytes, format 6: 6 bytes, format 7: 7 bytes |
| **Engine Source** | `RobustToolbox/Robust.Shared/EntitySerialization/MapChunkSerializer.cs:76-92` |
| **How Defined** | PROCEDURAL, sequential `BinaryReader.ReadInt32()`, `.ReadByte()`, `.ReadByte()`, `.ReadByte()` calls. No struct definition. |
| **Extractable?** | NO, byte layout is implicit in read/write call order. Would need to parse C# method body and understand BinaryReader semantics. |
| **Source of Truth?** | NO, cannot be used directly. Must be manually audited when MapChunkSerializer.cs changes. |

### 1.4 Tile Struct Fields

| | |
|-|-|
| **Editor** | `src/types.ts:17-22`, `TileCell { tileId, flags, variant, rotationMirroring }` |
| **Engine Source** | `RobustToolbox/Robust.Shared/Map/Tile.cs` |
| **How Defined** | Struct with fields: `TypeId` (int), `Flags` (TileRenderFlag byte), `Variant` (byte), `RotationMirroring` (byte) |
| **Extractable?** | YES, regex on struct fields: `public\s+(\w+)\s+(\w+)\s*[{;]` |
| **Source of Truth?** | YES, the Tile struct is the canonical definition of what a tile contains |

### 1.5 Vector2 Serialization Format (`"x,y"`)

| | |
|-|-|
| **Editor** | `src/tools/entityHelpers.ts:26`, `pos: \`${x},${y}\`` |
| **Engine Source** | `RobustToolbox/Robust.Shared/Serialization/TypeSerializers/Implementations/Vector2Serializer.cs:49-54` |
| **How Defined** | Interpolated string: `$"{value.X.ToString(CultureInfo.InvariantCulture)},{value.Y.ToString(CultureInfo.InvariantCulture)}"` |
| **Extractable?** | PARTIAL, the format is visible in source but embedded in a format string, not a named constant. |
| **Source of Truth?** | WEAK, the comma separator and lack of spaces is visible in the code, but there's no `const string FORMAT = "{0},{1}"` to extract. A change here would be visible in git diff of that file. |

### 1.6 Angle Serialization Format (`"N rad"`)

| | |
|-|-|
| **Editor** | `src/tools/entityHelpers.ts:30`, `` `${rot} rad` `` |
| **Engine Source** | `RobustToolbox/Robust.Shared/Serialization/TypeSerializers/Implementations/AngleSerializer.cs:47` |
| **How Defined** | Interpolated string: `$"{value.Theta.ToString(CultureInfo.InvariantCulture)} rad"` |
| **Extractable?** | PARTIAL, the `" rad"` suffix is a literal in the format string. Parseable but fragile. |
| **Source of Truth?** | WEAK, same issue as Vector2. The format is inline code, not a declared constant. Readable but not reliably machine-extractable. |

### 1.7 YAML `!type:*` Tag Handling

| | |
|-|-|
| **Editor** | `src/import/ss14Schema.ts:11-45`, custom JS-YAML schema for `!type:` tags |
| **Engine Source** | `RobustToolbox/Robust.Shared/Serialization/`, the entire RT serialization system |
| **How Defined** | ARCHITECTURAL, `!type:` tags are fundamental to RT's YAML serialization. The tag prefix is not a single constant; it's woven throughout the serialization framework. |
| **Extractable?** | NO, this is an architectural pattern, not a data value |
| **Source of Truth?** | NO, the tag format is implicit in the serialization system. Changes here would be a major engine overhaul. |

---

## 2. Component Types & Fields

### 2.1 Transform Component

| | |
|-|-|
| **Editor** | `src/tools/entityHelpers.ts:22-35`, reads `type: 'Transform'`, fields `pos`, `rot`, `parent` |
| **Engine Source** | `RobustToolbox/Robust.Shared/GameObjects/Components/Transform/TransformComponent.cs:34-43` |
| **How Defined** | DataField attributes: `[DataField("parent")]`, `[DataField("pos")]`, `[DataField("rot")]`, `[DataField("noRot")]`, `[DataField("anchored")]` |
| **Extractable?** | YES, regex: `\[DataField\("([^"]+)"\)\]` gives all serialized field names |
| **Source of Truth?** | YES, DataField attributes are the canonical serialization contract |

### 2.2 Sprite Component Fields

| | |
|-|-|
| **Editor** | `src/loaders/prototypeResolver.ts:85-188`, reads `layers`, `state`, `drawdepth`, `noRot`, `color`, `sprite` |
| **Engine Source** | `RobustToolbox/Robust.Client/GameObjects/Components/Sprite/SpriteComponent.cs` |
| **How Defined** | DataField attributes on component properties |
| **Extractable?** | YES, same DataField regex pattern |
| **Source of Truth?** | YES, but this is a CLIENT-SIDE component (Robust.Client, not Robust.Shared). The map editor only needs the serialized field names, which are stable. |

### 2.3 PointLight Component & Defaults

| | |
|-|-|
| **Editor** | `src/rendering/lightRenderer.ts:23-31`, `DEFAULTS: { color: '#FFFFFF', radius: 5, energy: 1.0, falloff: 6.8, ... }` |
| **Engine Source** | `RobustToolbox/Robust.Shared/GameObjects/Components/Light/SharedPointLightComponent.cs:19-106` |
| **How Defined** | Inline property initializers: `float Energy = 1f`, `float Falloff = 6.8f`, `float Radius = 5f`, etc. |
| **Extractable?** | YES, regex: `public\s+(\w+)\s+(\w+)\s*=\s*([^;]+);` within the class |
| **Source of Truth?** | YES, all defaults are literal values on DataField properties |

### 2.4 IconSmooth Component & Mode Enum

| | |
|-|-|
| **Editor** | `src/loaders/registryTypes.ts:48`, `iconSmoothMode?: 'Corners' \| 'CardinalFlags' \| 'Diagonal'` |
| **Engine Source** | `Content.Client/IconSmoothing/IconSmoothComponent.cs:60-83` |
| **How Defined** | `public enum IconSmoothingMode : byte { Corners, CardinalFlags, Diagonal, NoSprite }` |
| **Extractable?** | YES, standard C# enum, regex: `enum\s+IconSmoothingMode[^{]*\{([^}]+)\}` |
| **Source of Truth?** | YES, clean enum with sequential values |

**IconSmooth fields:**

| | |
|-|-|
| **Editor** | `src/loaders/prototypeResolver.ts:40-79`, reads `key`, `base`, `mode` |
| **Engine Source** | `Content.Client/IconSmoothing/IconSmoothComponent.cs:16-54` |
| **How Defined** | DataField attributes: `[DataField("key")]`, `[DataField("base")]`, `[DataField("mode")]` |
| **Extractable?** | YES |
| **Source of Truth?** | YES |

### 2.5 SubFloorHide Component

| | |
|-|-|
| **Editor** | `src/rendering/entityRenderer.ts:139-151`, checks for component `type === 'SubFloorHide'` |
| **Engine Source** | `Content.Shared/SubFloor/SubFloorHideComponent.cs` |
| **How Defined** | `[RegisterComponent]` class with DataField properties |
| **Extractable?** | YES, component name derivable from class name (strip "Component" suffix) |
| **Source of Truth?** | YES, but the component NAME comes from the class naming convention (see 2.10) |

### 2.6 DeviceList Component

| | |
|-|-|
| **Editor** | `src/tools/deviceLinkTool.ts:19-25`, reads `devices: number[]` |
| **Engine Source** | `Content.Shared/DeviceNetwork/Components/DeviceListComponent.cs:14` |
| **How Defined** | `public HashSet<EntityUid> Devices = new();` with `[DataField]` |
| **Extractable?** | YES, field name and type visible |
| **Source of Truth?** | PARTIAL, the editor treats `devices` as `number[]` but engine uses `HashSet<EntityUid>`. The YAML serialization bridges this (UIDs become integers), but the structural assumption (array of ints) is an interpretation of the serialized form, not directly from the C# type. |

### 2.7 DeviceLinkSource Component

| | |
|-|-|
| **Editor** | `src/tools/deviceLinkTool.ts:27-33`, reads `linkedPorts: Record<string, [string, string][]>` |
| **Engine Source** | `Content.Shared/DeviceLinking/DeviceLinkSourceComponent.cs:35` |
| **How Defined** | `public Dictionary<EntityUid, HashSet<(ProtoId<SourcePortPrototype>, ProtoId<SinkPortPrototype>)>> LinkedPorts = new();` |
| **Extractable?** | PARTIAL, the C# type signature is complex generics. The YAML serialized form (which the editor actually reads) is simpler: `{ uid: [[port, port], ...] }` |
| **Source of Truth?** | WEAK, the C# type tells you the semantic structure, but the actual YAML format depends on how RT's serializer flattens generics. The editor reads the serialized form, not the C# type. |

### 2.8 EntityStorageVisuals Component

| | |
|-|-|
| **Editor** | `src/loaders/prototypeResolver.ts:149-154`, reads `stateBaseClosed` |
| **Engine Source** | `Content.Client/Storage/Visualizers/EntityStorageVisualsComponent.cs:12` |
| **How Defined** | `[DataField("stateBaseClosed")] public string? StateBaseClosed;` |
| **Extractable?** | YES, DataField with explicit YAML name |
| **Source of Truth?** | YES |

### 2.9 Occluder Component

| | |
|-|-|
| **Editor** | `src/rendering/wallSegments.ts:29`, checks for component `type === 'Occluder'` |
| **Engine Source** | `RobustToolbox/Robust.Shared/GameObjects/Components/Light/OccluderComponent.cs:15-54` |
| **How Defined** | `[RegisterComponent]` with `[DataField("enabled")]`, `[DataField("boundingBox")]` |
| **Extractable?** | YES |
| **Source of Truth?** | YES |

### 2.10 Component Name Resolution (How "Transform" Maps to TransformComponent)

| | |
|-|-|
| **Editor** | All component checks use string literals: `c.type === 'Transform'`, `c.type === 'Sprite'`, etc. |
| **Engine Source** | `RobustToolbox/Robust.Shared/GameObjects/ComponentFactory.cs:144-176` |
| **How Defined** | PROCEDURAL ALGORITHM, `CalculateComponentName()`: (1) check for `[ComponentProtoNameAttribute]` override, (2) strip "Component" suffix, (3) optionally strip "Client"/"Server"/"Shared" prefix |
| **Extractable?** | PARTIAL, the algorithm is simple and deterministic, but it's code logic, not data. You'd need to apply the same stripping rules to C# class names to derive YAML type names. |
| **Source of Truth?** | PARTIAL, you can derive component names from class names using the algorithm, but some components have explicit `[ComponentProtoNameAttribute("CustomName")]` overrides that must be checked first. |

---

## 3. Rendering Data

### 3.1 DrawDepth Enum Values

| | |
|-|-|
| **Editor** | `src/rendering/entityRenderer.ts:16-49`, `DRAW_DEPTH_VALUES` map with 32 entries |
| **Engine Source** | `Content.Shared/DrawDepth/DrawDepth.cs` |
| **How Defined** | C# enum: `LowFloors = DrawDepthTag.Default - 22`, etc. `DrawDepthTag.Default` = 0 (from `Robust.Shared.GameObjects.DrawDepth`) |
| **Extractable?** | YES, regex: `(\w+)\s*=\s*DrawDepthTag\.Default\s*([+-]\s*\d+)?` then evaluate arithmetic (base is always 0) |
| **Source of Truth?** | YES, clean enum. Need to know `DrawDepthTag.Default = 0` to compute values, but this is stable engine infrastructure. |

### 3.2 Layer Visibility Ranges

| | |
|-|-|
| **Editor** | `src/rendering/entityRenderer.ts:59-66,117-128`, `LayerVisibility` interface with hardcoded depth ranges |
| **Engine Source** | NONE, these groupings are an editor-invented concept |
| **How Defined** | Editor-specific UI grouping of DrawDepth values into visibility layers |
| **Extractable?** | N/A |
| **Source of Truth?** | N/A, this is editor-only logic. The ranges should update if DrawDepth values change, but the grouping itself is our design. |

### 3.3 RSI Meta Format

| | |
|-|-|
| **Editor** | `src/loaders/rsiLoader.ts:18-23`, `RsiRawMeta { version, size, states[] }` |
| **Engine Source** | `RobustToolbox/Robust.Shared/Resources/RsiLoading.cs:37-56` (C# class) AND `RobustToolbox/Schemas/rsi.json` (JSON Schema) |
| **How Defined** | JSON-deserialized class `RsiJsonMetadata` + formal JSON Schema |
| **Extractable?** | YES (from JSON Schema), `rsi.json` is machine-readable and authoritative |
| **Source of Truth?** | YES, `RobustToolbox/Schemas/rsi.json` is the canonical spec |

### 3.4 RSI Direction Order

| | |
|-|-|
| **Editor** | `src/loaders/rsiLoader.ts:74-87`, South=0, North=1, East=2, West=3 |
| **Engine Source** | `RobustToolbox/Robust.Shared/Graphics/RSI/RsiDirection.cs:10-20` |
| **How Defined** | `public enum RsiDirection : byte { South=0, North=1, East=2, West=3, SouthEast=4, SouthWest=5, NorthEast=6, NorthWest=7 }` |
| **Extractable?** | YES, standard C# enum with explicit values |
| **Source of Truth?** | YES |

### 3.5 Light Attenuation Formula

| | |
|-|-|
| **Editor** | `src/rendering/lightRenderer.ts:94-102`, `((1-s²)²) / (1 + falloff * s)` |
| **Engine Source** | `RobustToolbox/Resources/Shaders/Internal/light-soft.swsl:38-66` |
| **How Defined** | GLSL shader code: `((1.0 - s2) * (1.0 - s2)) / (1.0 + lightFalloff * curveFactor)` |
| **Extractable?** | NO, it's shader math, not a data value. You'd need to parse GLSL. |
| **Source of Truth?** | NO, the formula is embedded in shader code. Must be manually synchronized. Changes are rare (affects all lighting visually). |

### 3.6 Ambient Darkness / LIGHTING_HEIGHT

| | |
|-|-|
| **Editor** | `src/rendering/lightRenderer.ts:135`, `AMBIENT_DARKNESS = 0.6` |
| **Engine Source** | No direct equivalent, the engine computes ambient via a full lighting system, not a single constant |
| **How Defined** | Editor-only approximation |
| **Extractable?** | N/A |
| **Source of Truth?** | N/A, editor-only visual approximation, not mirroring a specific engine value |

---

## 4. Prototype System

### 4.1 Tile Prototype Fields (`ContentTileDefinition`)

| | |
|-|-|
| **Editor** | `src/loaders/registryTypes.ts:2-18`, `RawTilePrototype { id, name, sprite, variants, isSubfloor, isSpace, ... }` |
| **Engine Source** | `Content.Shared/Maps/ContentTileDefinition.cs` |
| **How Defined** | DataField attributes: `[DataField("isSubfloor")]`, `[DataField("sprite")]`, `[DataField("variants")]`, etc. |
| **Extractable?** | YES, regex on DataField attributes gives all YAML field names |
| **Source of Truth?** | YES, DataField attributes define the exact YAML serialization contract |

### 4.2 Entity Prototype Structure

| | |
|-|-|
| **Editor** | `src/loaders/registryTypes.ts:21-32`, `RawEntityPrototype { id, parent, name, abstract, components, ... }` |
| **Engine Source** | `RobustToolbox/Robust.Shared/Prototypes/EntityPrototype.cs` |
| **How Defined** | Class properties with `[DataField]` and `[IdDataField]` attributes |
| **Extractable?** | YES, DataField attributes |
| **Source of Truth?** | YES |

### 4.3 Prototype Inheritance (Shallow Merge)

| | |
|-|-|
| **Editor** | `src/loaders/prototypeResolver.ts:200-218`, walks `parent` chain, merges components by `type` field |
| **Engine Source** | `RobustToolbox/Robust.Shared/Prototypes/PrototypeManager.Resolutions.cs` |
| **How Defined** | PROCEDURAL, `ResolveEntityParent()` method with component-level override logic |
| **Extractable?** | NO, it's algorithm logic, not data |
| **Source of Truth?** | NO, the merge strategy is encoded in methods. Our implementation mirrors the behavior but can't be auto-derived. |

### 4.4 Prototype Directory Paths

| | |
|-|-|
| **Editor** | `src/loaders/prototypeDiscovery.ts:12-19`, expects `Prototypes/Entities/`, `Prototypes/Tiles/`, `Prototypes/Catalog/` |
| **Engine Source** | `Resources/Prototypes/` directory structure (convention, not defined in code) |
| **How Defined** | File system convention, no code constant defines these paths |
| **Extractable?** | NO, convention-based, not declared |
| **Source of Truth?** | NO, the directory layout is a convention. The engine loads all `.yml` files recursively from `Resources/Prototypes/` regardless of subdirectory. |

---

## 5. Hardcoded Prototype IDs

### 5.1 Cable Prototypes

| | |
|-|-|
| **Editor** | `src/types.ts:72`, `CableType = 'CableHV' \| 'CableMV' \| 'CableApcExtension'` |
| **Engine Source** | `Resources/Prototypes/Entities/Structures/Power/cables.yml` |
| **How Defined** | YAML prototypes with `id:` fields |
| **Extractable?** | YES, parse YAML, filter by parent chain containing "Cable" or by directory |
| **Source of Truth?** | PARTIAL, prototype IDs are in YAML, but knowing WHICH prototypes are "cable types" requires understanding the inheritance hierarchy or relying on naming convention. |

### 5.2 Cable State Prefixes

| | |
|-|-|
| **Editor** | `src/rendering/entityRenderer.ts:163-167`, `CableHV: 'hvcable_'`, etc. |
| **Engine Source** | `Resources/Prototypes/Entities/Structures/Power/cables.yml`, `CableVis` component or Sprite states |
| **How Defined** | Sprite state names in RSI files AND prototype YAML (e.g., `state: hvcable_0`) |
| **Extractable?** | PARTIAL, could parse the Sprite component's `state` field from cable prototypes, but the prefix mapping (CableHV → hvcable_) is implicit in the state naming. |
| **Source of Truth?** | WEAK, the prefix is a sprite naming convention, not a declared constant anywhere. |

### 5.3 Gas Pipe Prototypes

| | |
|-|-|
| **Editor** | `src/algorithms/pipeFittings.ts:19-26`, `GasPipeStraight`, `GasPipeBend`, `GasPipeTJunction`, `GasPipeFourway` |
| **Engine Source** | `Resources/Prototypes/Entities/Structures/Piping/Atmospherics/pipes.yml` |
| **How Defined** | YAML prototypes with `id:` fields |
| **Extractable?** | YES, parse YAML for `id: GasPipe*` |
| **Source of Truth?** | PARTIAL, same as cables. The IDs are there, but knowing which is a "straight" vs "bend" vs "T-junction" requires understanding the prototype's behavior or name. |

### 5.4 Gas Pipe Alt Variants

| | |
|-|-|
| **Editor** | `src/tools/pipeDrawTool.ts:9-13`, `GasPipeStraightAlt1`, `GasPipeBendAlt1`, etc. |
| **Engine Source** | `Resources/Prototypes/Entities/Structures/Piping/Atmospherics/alt_layers.yml` (or similar) |
| **How Defined** | YAML prototypes, Alt variants are separate prototypes inheriting from the base |
| **Extractable?** | YES, parse YAML for `id: GasPipe*Alt*` |
| **Source of Truth?** | YES, if we discover all prototypes matching the naming pattern |

### 5.5 Disposal Pipe Prototypes

| | |
|-|-|
| **Editor** | `src/tools/pipeDrawTool.ts:16-19`, `DisposalPipe`, `DisposalBend`, `DisposalJunction`, etc. |
| **Engine Source** | `Resources/Prototypes/Entities/Structures/Piping/Disposal/pipes.yml` |
| **How Defined** | YAML prototypes |
| **Extractable?** | YES, parse YAML for `id: Disposal*` |
| **Source of Truth?** | PARTIAL, same naming convention dependency |

### 5.6 Pipe Colors

| | |
|-|-|
| **Editor** | `src/types.ts:81-84`, `supply: '#0055CCFF'`, `return: '#990000FF'` |
| **Engine Source** | Not defined as constants anywhere. Colors are set at runtime via `AtmosPipeColorSystem` or in individual prototype YAML. |
| **How Defined** | Runtime behavior, no single source |
| **Extractable?** | NO |
| **Source of Truth?** | NO, pipe colors are a visual convention. The default `AtmosPipeColor` component color is `Color.White`. Specific supply/return colors are applied by game systems at runtime, not stored in prototypes. |

### 5.7 Auto-Link Target Prototypes

| | |
|-|-|
| **Editor** | `src/algorithms/autoLink.ts:8-9`, `['GasVentPump', 'GasVentScrubber', 'AirSensor']`, `['Firelock']` |
| **Engine Source** | `Content.Server/DeviceNetwork/Systems/AirAlarmSystem.cs` (or similar) |
| **How Defined** | PROCEDURAL, game system code determines what links to what |
| **Extractable?** | NO, linking logic is in server-side C# code |
| **Source of Truth?** | NO, the set of entities an AirAlarm links to is determined by game logic, not a declared list |

### 5.8 SubFloor Prototype Prefixes

| | |
|-|-|
| **Editor** | `src/rendering/entityRenderer.ts:132-135`, `['Cable', 'GasPipe', 'DisposalPipe', ...]` |
| **Engine Source** | No direct equivalent, the engine uses the `SubFloorHide` COMPONENT on entities, not prototype name prefixes |
| **How Defined** | The editor uses name prefixes as a FALLBACK when component data isn't available. The real mechanism is the SubFloorHide component. |
| **Extractable?** | N/A, the prefix list is an editor heuristic |
| **Source of Truth?** | N/A, editor-invented fallback. The real source of truth is whether an entity has a SubFloorHide component in its prototype, which IS available from prototype YAML. |

### 5.9 Infrastructure Entity Icons

| | |
|-|-|
| **Editor** | `src/rendering/infrastructureRenderer.ts:6-56`, `APCBasic`, `GasVentPump`, etc. with colors/symbols |
| **Engine Source** | Prototype YAML files across `Resources/Prototypes/Entities/` |
| **How Defined** | Editor-only visual mapping, colors and symbols are editor design choices |
| **Extractable?** | N/A, editor-only |
| **Source of Truth?** | N/A, the prototype IDs should match YAML, but the color/symbol assignments are our design |

---

## 6. Algorithms Mirroring Game Behavior

### 6.1 IconSmooth Corner-Fill Algorithm

| | |
|-|-|
| **Editor** | `src/rendering/entityRenderer.ts:200-392`, 8-neighbor check, 3-bit corner fill, 4 corner states |
| **Engine Source** | `Content.Client/IconSmoothing/IconSmoothSystem.cs` |
| **How Defined** | PROCEDURAL, C# methods implementing the smoothing algorithm |
| **Extractable?** | NO, complex algorithm logic |
| **Source of Truth?** | NO, must be manually kept in sync. The algorithm uses the same IconSmoothingMode enum values (extractable) but the actual corner-fill bit math is procedural. |

### 6.2 Pipe Bend/T-Junction Rotation Formulas

| | |
|-|-|
| **Editor** | `src/algorithms/pipeFittings.ts:102-138`, rotation lookup by connected directions |
| **Engine Source** | Implied by sprite frame definitions in RSI files + `Content.Client/Atmos/Piping/` visualizer code |
| **How Defined** | PROCEDURAL, rotation semantics are implicit in how RSI frames are authored and how the game's visualizer selects frames |
| **Extractable?** | NO |
| **Source of Truth?** | NO, the rotation-to-frame mapping is baked into RSI sprite authoring conventions, not declared in code |

### 6.3 Cable Connection Bitmask

| | |
|-|-|
| **Editor** | `src/rendering/entityRenderer.ts:187-198`, N=1, S=2, E=4, W=8 neighbor bitmask |
| **Engine Source** | `Content.Client/Power/CableVisualizerSystem.cs` (or similar) |
| **How Defined** | PROCEDURAL, client visualizer computes connection state from neighbors |
| **Extractable?** | NO |
| **Source of Truth?** | NO, the bitmask convention matches the engine's but is not extracted from a constant |

### 6.4 Device Link Default Ports

| | |
|-|-|
| **Editor** | `src/tools/deviceLinkTool.ts:45`, default link `['Pressed', 'Toggle']` |
| **Engine Source** | `Content.Shared/DeviceLinking/`, port prototypes in YAML and C# |
| **How Defined** | Port names are prototype IDs defined in `Resources/Prototypes/DeviceLinking/` |
| **Extractable?** | YES, from YAML prototype files |
| **Source of Truth?** | PARTIAL, port names exist in YAML, but the DEFAULT pairing (Pressed→Toggle) is game logic |

---

## 7. Map Structural Entities

### 7.1 Map Entity Detection

| | |
|-|-|
| **Editor** | `src/import/mapImporter.ts:215-217`, entities with `type: Map` component |
| **Engine Source** | `RobustToolbox/Robust.Shared/Map/MapComponent.cs` |
| **How Defined** | `[RegisterComponent]`, presence of this component marks the map entity |
| **Extractable?** | YES, component name from class |
| **Source of Truth?** | YES |

### 7.2 Grid Entity Detection

| | |
|-|-|
| **Editor** | `src/import/mapImporter.ts:220-243`, entities with `type: MapGrid` component |
| **Engine Source** | `RobustToolbox/Robust.Shared/Map/MapGridComponent.cs` |
| **How Defined** | `[RegisterComponent]`, component with `chunks` DataField |
| **Extractable?** | YES |
| **Source of Truth?** | YES |

### 7.3 MetaData Component (Grid Names)

| | |
|-|-|
| **Editor** | `src/import/mapImporter.ts:225-226`, reads `name` from MetaData component |
| **Engine Source** | `RobustToolbox/Robust.Shared/GameObjects/Components/MetaData/MetaDataComponent.cs` |
| **How Defined** | `[DataField("name")]` property |
| **Extractable?** | YES |
| **Source of Truth?** | YES |

### 7.4 Container Parent Detection

| | |
|-|-|
| **Editor** | `src/import/mapImporter.ts:445`, entities with Transform `parent` pointing to non-grid UID are contained |
| **Engine Source** | Engine containment system uses Transform parenting |
| **How Defined** | ARCHITECTURAL, containment = Transform.parent points to container entity, not grid |
| **Extractable?** | NO, it's a semantic interpretation of the parent field |
| **Source of Truth?** | NO, this is behavioral knowledge about how containment works, not a data constant |

---

## Summary: Can It Be a Source of Truth?

### YES, Directly Usable (17 items)

| Item | Engine File | Extraction Method |
|------|-------------|-------------------|
| Map format version | `EntitySerializer.cs` | Regex on `const int` |
| DrawDepth enum | `DrawDepth.cs` | Regex on enum members + arithmetic |
| Tile struct fields | `Tile.cs` | Regex on struct fields |
| Transform field names | `TransformComponent.cs` | Regex on `[DataField]` |
| PointLight defaults | `SharedPointLightComponent.cs` | Regex on property initializers |
| IconSmoothingMode enum | `IconSmoothComponent.cs` | Regex on enum |
| IconSmooth field names | `IconSmoothComponent.cs` | Regex on `[DataField]` |
| RSI direction enum | `RsiDirection.cs` | Regex on enum |
| RSI schema | `Schemas/rsi.json` | Direct JSON parse |
| EntityStorageVisuals fields | `EntityStorageVisualsComponent.cs` | Regex on `[DataField]` |
| Occluder fields | `OccluderComponent.cs` | Regex on `[DataField]` |
| ContentTileDefinition fields | `ContentTileDefinition.cs` | Regex on `[DataField]` |
| SubFloorHide fields | `SubFloorHideComponent.cs` | Regex on `[DataField]` |
| Map component | `MapComponent.cs` | Class name → component name |
| MapGrid component | `MapGridComponent.cs` | Class name → component name |
| MetaData fields | `MetaDataComponent.cs` | Regex on `[DataField]` |
| Entity prototype structure | `EntityPrototype.cs` | Regex on `[DataField]` / `[IdDataField]` |

### PARTIAL, Usable with Caveats (8 items)

| Item | Caveat |
|------|--------|
| Vector2 format | Format string in code, not a constant, visible but fragile to extract |
| Angle format | Same, `" rad"` suffix is inline literal |
| Component name resolution | Algorithm is deterministic but procedural, can replicate the rule |
| DeviceList fields | C# type differs from YAML serialized form |
| DeviceLinkSource fields | Complex generic type → simpler YAML form |
| Chunk size | Local variable, not a named constant |
| Cable/pipe prototype IDs | IDs are in YAML, but classifying them (straight vs bend) requires naming convention |
| Device link port names | Port names in YAML, but default pairings are game logic |

### NO, Cannot Be Auto-Extracted (10 items)

| Item | Reason |
|------|--------|
| Chunk binary layout | Procedural BinaryWriter calls, no struct |
| YAML `!type:` tag format | Architectural pattern, not data |
| Prototype inheritance merge strategy | Algorithm in methods |
| Prototype directory paths | Convention, not declared |
| IconSmooth corner-fill algorithm | Complex procedural math |
| Pipe rotation formulas | RSI authoring convention + visualizer logic |
| Cable connection bitmask | Procedural visualizer code |
| Light attenuation formula | GLSL shader math |
| Pipe colors (supply/return) | Runtime system behavior, no constant |
| Auto-link targets | Server-side game logic |
