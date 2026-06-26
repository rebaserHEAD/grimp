# RSI Sprite Loader

The RSI (Robust Sprite Interface) loader handles loading and caching sprite images from the SS14 game's `.rsi` sprite directories.

## RSI Format

Each `.rsi` directory contains:
- `meta.json`, describes sprite states, their direction counts, and animation frames
- `<state>.png`, one PNG per state, containing all directions and frames

### meta.json Structure

```json
{
  "version": 1,
  "size": { "x": 32, "y": 32 },
  "states": [
    { "name": "base", "directions": 4 },
    { "name": "icon" },
    { "name": "animated", "directions": 4, "delays": [[0.1, 0.2], ...] }
  ]
}
```

### PNG Layout

Each state PNG contains all directions and frames laid out in a **grid**, wrapping left-to-right, top-to-bottom. Cells are indexed as `cellIndex = directionOffset * frameCount + frame`, then arranged using the image width:

```
columnsPerRow = imageWidth / tileWidth
col = cellIndex % columnsPerRow
row = cellIndex / columnsPerRow (floored)
sx  = col * tileWidth
sy  = row * tileHeight
```

For a 4-direction, 1-frame state with 32×32 tiles, the PNG is **64×64** (2×2 grid):

| (0,0) South | (32,0) North |
|-------------|--------------|
| (0,32) East | (32,32) West |

For a 1-direction, 6-frame animation, the PNG wraps into rows (e.g. 96×64 = 3×2 grid).

Each cell is `size.x` × `size.y` pixels (typically 32×32).

### Direction Order

SS14 RSI direction indices:
| Index | Direction |
|-------|-----------|
| 0 | South |
| 1 | North |
| 2 | East |
| 3 | West |

## Architecture

```
Entity prototype (SpriteInfo)
    │
    ├── rsiPath: "Structures/Power/apc.rsi"
    ├── baseState: "base"
    └── noRot: false
            │
            ▼
    loadRsiMeta(rsiPath)
    → fetch meta.json, parse states, cache
            │
            ▼
    loadRsiStateImage(rsiPath, stateName)
    → fetch <state>.png, cache HTMLImageElement
            │
            ▼
    loadSprite(spriteInfo, direction, frame)
    → returns { image, sx, sy, sw, sh } for drawImage()
```

## Files

| File | Purpose |
|------|---------|
| `src/loaders/rsiLoader.ts` | Meta parsing, image loading, sprite extraction |
| `src/rendering/entityRenderer.ts` | Entity rendering using loaded sprites |
| `src/rendering/gridRenderer.ts` | Tile rendering using loaded PNGs |

## Key Functions

### `parseRsiMeta(raw)`
Parses a meta.json into indexed state data with computed `yOffset` (cumulative row position in PNG) and `frameCount`.

### `getDirectionOffset(direction, numDirections)`
Maps a cardinal direction to its row offset within a state. Returns 0 for single-direction sprites.

### `loadRsiMeta(rsiPath, baseUrl)`
Fetches and parses a meta.json. Cached by URL, each RSI's meta is only fetched once.

### `loadImage(url)`
Loads an HTMLImageElement. Cached by URL.

### `loadSprite(spriteInfo, direction, frame, baseUrl, stateOverride?)`
Combines meta + image loading to return the source rectangle for `ctx.drawImage()`. Returns null if the state doesn't exist. An optional `stateOverride` parameter loads a different state from the same RSI, used for dynamic visualizers like cable connection states (e.g., `hvcable_5` instead of `hvcable_0`).

### `clearRsiCache()`
Clears both meta and image caches.

## Caching Strategy

Two-level caching:
1. **Meta cache**, `Map<string, Promise<RsiMeta>>` keyed by meta.json URL
2. **Image cache**, `Map<string, Promise<HTMLImageElement>>` keyed by PNG URL

Both use Promise-level caching to prevent duplicate fetches when multiple render frames request the same resource before it loads.

## Tile Sprites vs Entity Sprites

**Tiles** use plain PNG files (not RSI):
- Path: `/Textures/Tiles/steel.png`
- Loaded directly via `loadImage()`
- Variants laid out horizontally in a single PNG

**Entities** use RSI directories:
- Path: `Structures/Power/apc.rsi`
- Loaded via `loadRsiMeta()` + `loadRsiStateImage()`
- Directions and frames in structured PNG layout

## Rendering Tiers

**Tier 1:** Base state sprite, correct direction. One `drawImage()` call per entity.

**Tier 2 (current):** Dynamic state selection for visualizer entities. Cables use neighbor-based connection masks to select the correct sprite state (e.g., `hvcable_5` for a cable connected north+east). Pipes use AtmosPipeColor tinting via offscreen canvas compositing (multiply + destination-in).

**Tier 3 (current):** Multi-layer compositing. Extra layers from the Sprite component are rendered on top of the base layer. Each layer can override the RSI path (via `SpriteLayerInfo.sprite`), enabling spawner entities to show the green X marker (layer 0 from `Markers/cross.rsi`) with the spawned entity's sprite overlaid (layer 1+ from the target entity's RSI). The `getExtraLayers()` function in `entityRenderer.ts` loads all layers beyond the base asynchronously and caches them.

**Tier 4 (current):** Color tinting and IconSmooth rendering.

- **Layer/component color tinting:** `getSpriteColor()` reads color from the first sprite layer or the component-level `color` field. Supports `#RRGGBBAA` format, the RGB channels are applied as a multiply tint via offscreen canvas compositing, while the alpha channel is applied via `globalAlpha`. Pure white (`#FFFFFF`) skips the multiply operation as an optimization. Examples: ComfyChair layer color `#767e82` (gray tint), Puddle component color `#FFFFFF80` (50% opacity).

- **IconSmooth corner rendering (Corners mode):** Entities with `iconSmoothMode: 'corners'` (walls, tables, carpets, windows) render as 4 quarter-tile sprites. A spatial index (`Map<"x,y", smoothKey>`) enables fast neighbor lookups. `calculateCornerFills()` computes a 3-bit CornerFill (CCW=1, Diag=2, CW=4) for each corner by checking 2 cardinal + 1 diagonal neighbor. Each corner maps to an RSI direction (SE→South, NE→East, NW→North, SW→West) and state `{base}{fill}`.

- **IconSmooth cardinal rendering (CardinalFlags mode):** Entities with `iconSmoothMode: 'cardinalFlags'` (puddles) render as a single full-tile sprite selected by a 4-bit neighbor bitmask (N=1, S=2, E=4, W=8). State name: `{base}{mask}`.

## Extending

To support animated sprites (unlikely needed for editor):
1. Track frame timing in a render-loop state
2. Use `RsiState.frameCount` and delays from meta.json
3. Cycle `sx` offset based on current frame index
