# Rendering Pipeline

Complete reference for how the map editor renders each frame.

## Frame Lifecycle

```
requestAnimationFrame (useAnimationFrame.ts)
  └─ EditorCanvas render callback (~60 FPS)
       ├─ needsRedraw() check, skip if no dirty flags set
       ├─ Map dirty flags → compositor layer invalidation
       ├─ Compute pan offset from compositor snapshot
       ├─ Check if pan exceeds margin → invalidate all layers
       ├─ Zoom-settle debounce (150ms)
       ├─ Render dirty layers to offscreen canvases:
       │    ├─ L0 Tiles (if dirty) → renderGrid() to tileCanvas
       │    ├─ L1 Entities (if dirty) → renderEntities() to entityCanvas
       │    └─ L2 Connections (if dirty) → renderConnections() to connectionCanvas
       ├─ Composite cached layers to main canvas (2-3 drawImage calls)
       │    └─ If zoom changed: apply scale transform (zoom-deferred)
       ├─ Overlay pass (drawn directly, always pixel-crisp):
       │    ├─ renderGridLines(), coordinate grid
       │    ├─ tool.renderPreview(), active tool overlay
       │    └─ Entity hover tooltip at cursor
       └─ markClean(), clear all dirty flags
```

---

## 1. Dirty Flag System (`dirtyFlags.ts`)

Module-level flags that gate the entire render loop. If no flag is set, the frame is skipped entirely (zero render work when idle).

| Flag | Set By | Triggers |
|------|--------|----------|
| `sceneDirty` | Entity add/remove/move, tile change, layer toggle, map load | Invalidate L0+L1+L3 layers |
| `cameraDirty` | Pan, zoom, resize | Overlay redraw only (layers use offset/scale compositing) |
| `overlayDirty` | Cursor move, tool state, selection change | Overlay redraw only |
| `connectionsDirty` | Entity selection change, connection edit | Invalidate L3 layer |

`needsRedraw()` returns true if any flag is set. `markClean()` clears all flags at end of frame.

---

## 2. Layered Canvas Compositing (`layerCompositor.ts`)

The scene is rendered to five offscreen canvases (tiles, decals, entities, connections, light) that are larger than the viewport. The main canvas composites these cached layers with pixel offsets during pan, and scale transforms during zoom.

### Layer Architecture

| Layer | Canvas | Content | Invalidated By |
|-------|--------|---------|---------------|
| L0 | tileCanvas | Tile sprites | `sceneDirty`, pan margin, zoom settle |
| L1 | decalCanvas | Decal sprites (floor markings, overlays) | `sceneDirty`, entity invalidation |
| L2 | entityCanvas | Entity sprites (with LOD) | `sceneDirty`, pan margin, zoom settle |
| L3 | connectionCanvas | Device link lines | `connectionsDirty`, pan margin, zoom settle |
| L4 | lightCanvas | Lighting preview | Entity changes, light edits |
| L5 | (main canvas) | Grid lines, tool preview, hover tooltip | Every frame (cheap overlay) |

### Oversized Buffers

Each offscreen canvas is `(1 + 2 × margin)` times the viewport size (default margin = 0.5, so 2× viewport). This provides pan headroom, small pans composite cached pixels at an offset without re-rendering.

```
bufferWidth  = ceil(viewportW × (1 + 2 × 0.5)) = ceil(viewportW × 2)
bufferHeight = ceil(viewportH × (1 + 2 × 0.5)) = ceil(viewportH × 2)
physicalWidth = bufferWidth × devicePixelRatio
```

### Pan Offset Compositing

When the camera pans, the pixel offset from the snapshot position is computed:
```
offsetX = (snapshotX - camera.x) × tileScreenSize
offsetY = -(snapshotY - camera.y) × tileScreenSize  // Y-up → Y-down
drawX = offsetX - marginPxX
drawY = offsetY - marginPxY
```

If `|offsetX| > viewportW × margin` or `|offsetY| > viewportH × margin`, the pan has exceeded the buffer, all layers are invalidated and re-rendered at the new camera position.

### Zoom-Deferred Compositing

When zoom changes (scroll wheel), cached layers are composited with a scale transform centered on the viewport:
```
scale = camera.zoom / snapshotZoom
ctx.translate(w/2, h/2) → ctx.scale(scale, scale) → ctx.translate(-w/2, -h/2)
```

After 150ms of no zoom change, all layers are invalidated for a crisp re-render at the new zoom level.

### Layer Invalidation Rules

| Trigger | Layers Invalidated |
|---------|-------------------|
| Entity/tile mutation (`sceneDirty`) | L0 + L1 + L2 + L3 + L4 |
| Entity selection change (`connectionsDirty`) | L3 |
| Pan exceeds buffer margin | All |
| Zoom settles (150ms debounce) | All |
| Viewport resize | All (buffers reallocated) |
| `cameraDirty` alone (small pan/zoom) | None, handled by offset/scale compositing |

---

## 3. Animation Loop (`useAnimationFrame.ts`)

Simple `requestAnimationFrame` loop calling a ref-stored callback. Vsync-locked (~60 FPS on 60Hz, ~144 FPS on 144Hz). Combined with dirty flags, achieves 0 redraws/sec when idle.

---

## 4. Canvas Setup (`EditorCanvas.tsx`)

- Canvas physical size = `clientWidth × DPR` by `clientHeight × DPR`
- Context scaled by DPR so logical coordinates match CSS pixels
- Resize detected via ResizeObserver → `markAllDirty()` + `compositor.resize()`
- LayerCompositor instance persisted as a ref, resized alongside main canvas
- All render flags (`showEntities`, `showGrid`, `layerVisibility`, etc.) stored in refs to avoid re-registering the animation loop

---

## 5. Grid Renderer (`gridRenderer.ts`)

### Viewport Culling
Converts screen corners to world tile coordinates via `camera.screenToTile()`, clamps to grid bounds. Only tiles in the visible region (+1 margin) are iterated.

### Per-Tile Rendering
```
for each visible tile (x, y):
  skip if Space
  look up tile sprite in tileImageCache (Map<tileId, HTMLImageElement|null>)
    → cache miss: async load, return null this frame, markSceneDirty() when loaded
    → cache hit: drawImage with variant selection
  variant = (x*7 + y*13) % variants  (deterministic spatial hash)
  fallback: solid color rectangle if no sprite
```

**Cost:** O(visible tiles). Each tile = 1 cache lookup + 1 `drawImage`.

### Grid Lines
- Opacity scales with zoom: `0.06 * zoom + 0.02`
- **Density culling**: If tiles < 3px on screen, skip every Nth line
- Only draws lines in the visible viewport range

---

## 6. Entity Renderer (`entityRenderer.ts`)

The largest and most complex renderer. Handles multi-layer sprites, IconSmooth neighbor smoothing, cable connection masks, color tinting, and rotation.

### 6.1 LOD Short-Circuit

When `tileScreenSize < 6px`, skips the entire sprite rendering pipeline and draws colored placeholder dots for all visible entities. This eliminates thousands of `drawImage` calls, sprite loads, smooth calculations, cable masks, and tinting at full zoom-out.

### 6.2 Visibility Query (Spatial Index)

Uses the persistent spatial index for frustum culling instead of scanning all entities:

```
spatialGetInRect(visMinX, visMinY, visMaxX, visMaxY)
  → returns only entities in visible tile range (O(visible area))
```

The visible list is cached and only rebuilt when camera, entities (array reference), or filter settings change.

### 6.3 Filtering (two stages on spatial query results)

```
for each entity from spatial query:
  1. Layer visibility, skip if DrawDepth outside enabled layer ranges
  2. SubFloor filter, dim (30% opacity) if entity has SubFloorHide, tile is not subfloor, and T-Ray is off
  → survivors go into visible[] array
```

### 6.4 Sorting

`visible.sort()` by DrawDepth (lower = behind), UID tiebreaker. DrawDepth is cached per prototype ID. Sort is skipped when cached visible list is still valid.

### 6.5 Neighbor Lookups (via Spatial Index)

Cable and smooth neighbor lookups use the persistent spatial index (`spatialGetAt()`) instead of per-frame rebuilt indexes:

| Query | Method | Cost |
|-------|--------|------|
| Cable connection mask | `hasCablePrototypeAt()` × 4 directions | O(cell size) per direction |
| Smooth cardinal mask | `hasSmoothKeyAt()` × 4 directions | O(cell size) per direction |
| Smooth corner fills | `hasSmoothKeyAt()` × 8 directions | O(cell size) per direction |

Cell size is typically 1-5 entities, so these are effectively O(1).

### 6.6 Per-Entity Rendering

For each visible entity, in sorted order:

```
1. Determine direction from rotation (south/north/east/west)

2. IconSmooth check (cached per prototype):
   a. CardinalFlags mode:
      - 4 neighbor lookups via spatial index → bitmask (N=1,S=2,E=4,W=8)
      - Load sprite by base+mask state (e.g. "swindow5")
      - Draw 1 sprite
   b. Corners mode:
      - 8 neighbor lookups via spatial index → 4 corner fill values
      - Load 4 sprites (one per corner: east/south/west/north direction)
      - Draw 4 sprites

3. Cable connection mask (if cable prototype):
   - 4 neighbor lookups via spatial index
   - Override sprite state (e.g. "hvcable_5")

4. Load sprite via getEntitySprite():
   - Cache key: "prototype:direction:state"
   - Hit → SpriteDrawInfo (draw immediately)
   - Miss → start async load, return undefined (skip this frame)
   - Failed → null (draw placeholder circle)
   - markSceneDirty() on async load completion

5. Canvas rotation (if needed):
   - Skip if noRot entity (cached per prototype)
   - Skip if rotation == 0
   - Save → translate to center → rotate(-rotation) → translate back

6. Color tinting:
   Priority: AtmosPipeColor (per entity UID) > sprite layer color (per prototype) > none
   - Tinted sprites rendered via offscreen canvas (cached per sprite+color combo)
   - Uses multiply composite + destination-in to preserve alpha
   - Alpha channel (from #RRGGBBAA) applied separately via ctx.globalAlpha

7. drawImage(), base sprite (or tinted version)

8. Extra layers (multi-layer entities):
   - Loaded in parallel via Promise.all()
   - Cached per "prototype:direction:layers"
   - Each extra layer = additional drawImage()

9. Restore canvas rotation (if applied in step 5)
```

### 6.7 Placeholders

When sprite is loading or missing, draws a small colored circle:
- Green: Spawn entities
- Orange: Cables
- Cyan: Pipes/Gas
- Magenta: Everything else
- Skipped when zoom < 8px per tile (unless in LOD mode)

---

## 7. Connection Renderer (`connectionRenderer.ts`)

Renders DeviceList (cyan) and DeviceLinkSource (orange) lines between entities using batched rendering for performance.

### Optimizations
- **Zoom skip**: Entire pass skipped when `tileScreenSize < 4px`
- **Viewport culling**: Only iterates entities within the visible viewport via `spatialGetInRect()`
- **Target lookup**: Uses `spatialGetByUid()` for O(1) target position lookups, also handles deleted entities gracefully (returns undefined → line skipped)
- **Batched drawing**: All lines of the same style drawn in a single `beginPath`/`stroke` call (4 batches total), eliminating per-line draw call overhead
- **Cached selection Set**: `selectedEntityUids` array is converted to a Set once, cached by reference identity to avoid per-frame allocation

### Process
```
1. Spatial query for viewport entities: spatialGetInRect(viewport bounds)
2. Collect pass, bucket connection lines into 4 arrays:
   - DeviceList unselected / DeviceList selected (cyan)
   - DeviceLinkSource unselected / DeviceLinkSource selected (orange)
   For each target UID: spatialGetByUid() → skip if deleted
3. Draw unselected batches (thin, low alpha, 0.15 with selection, 0.4 without)
4. Draw selected batches (thick 3px, full opacity, with directional arrows)
5. Draw connection count badges (only if zoom >= 16px/tile)
```

### Visual Hierarchy
- **No selection**: All connections shown at medium visibility (1.5px, 0.4α)
- **With selection**: Selected entity connections highlighted (3px, 1.0α, arrows), all others dimmed (1px, 0.15α)

### Invalidation
Connection layer is invalidated by:
- `sceneDirty`, entity add/remove/move/component edit (ensures deleted entity links disappear immediately)
- `connectionsDirty`, entity selection change (ensures highlight/dim state updates instantly)
- Pan margin overflow / zoom settle (standard compositor triggers)

**Cost:** O(visible_connected × connections_per_entity). 4 `beginPath`/`stroke` calls regardless of connection count.

---

## 8. Spatial Index (`spatialIndex.ts`)

Persistent module-level spatial hash rebuilt by the reducer after entity mutations.

### API
| Function | Complexity | Description |
|----------|-----------|-------------|
| `rebuildSpatialIndex(entities)` | O(N) | Full rebuild (clears + re-inserts all) |
| `spatialInsert(entity)` | O(1) | Add entity to index (internal/test use) |
| `spatialRemove(uid)` | O(cell) | Remove entity from index (internal/test use) |
| `spatialGetAt(x, y)` | O(1) | Get entities at tile |
| `spatialGetInRect(...)` | O(area) | Get entities in rectangle |
| `spatialGetByUid(uid)` | O(cell) | Look up entity by UID |

### Reducer Integration

All entity-mutating actions call `rebuildSpatialIndex(entities)` after computing the new entity array:

- `APPLY_COMMAND`: `rebuildSpatialIndex(entities)` if entity changes exist
- `UNDO`/`REDO`: Same
- `LOAD_MAP`: `rebuildSpatialIndex(map.entities)`
- `NEW_MAP`: `rebuildSpatialIndex([])`

**Why rebuild instead of incremental updates?** React 18 StrictMode double-invokes reducers in development to detect impure reducers. Incremental `spatialInsert`/`spatialRemove` calls are non-idempotent side effects, the second invocation creates duplicate entries in spatial index cells, causing phantom entities to render at stale positions. `rebuildSpatialIndex` is idempotent (clears before rebuilding), so double-invocation produces the same correct result. The O(N) rebuild cost is negligible (~<1ms for 10K entities) since it only runs on dispatch, not per frame.

---

## 9. Entity Hover Tooltip

Runs per frame but only rescans when cursor tile changes or entity array reference changes:
```
if (cursorTile changed || entities array changed):
  cachedHovered = getEntitiesAtTile(x, y)  // O(1) via spatial index
```
If entities found: draws tile highlight outline + background rectangle + prototype name label.

**Cost:** O(1) per cursor tile change (spatial index lookup). O(0) when cursor hasn't moved.

---

## 10. Camera (`camera.ts`)

- World space: Y-up (SS14 convention)
- Screen space: Y-down (Canvas convention)
- `worldToScreenY` negates Y and adds +1 (tile bottom → tile top)
- Zoom range: 0.1x to 50x
- `zoomAt()` keeps world point under cursor fixed
- `tileScreenSize` = 32 × zoom (pixels per tile on screen)
- Pan/zoom/fitBounds automatically call `markCameraDirty()`

---

## Caching Summary

### Session-Long Caches (never cleared)

| Cache | Key | Stores |
|-------|-----|--------|
| `tileImageCache` | tileId | `HTMLImageElement \| null` |
| `entitySpriteCache` | `proto:dir:state` | `SpriteDrawInfo \| null` |
| `extraLayerCache` | `proto:dir:layers` | `SpriteDrawInfo[] \| null` |
| `tintedSpriteCache` | `imgSrc:sx,sy:color` | `HTMLCanvasElement` (offscreen) |
| `drawDepthCache` | prototype | `number` |
| `noRotCache` | prototype | `boolean` |
| `spriteColorCache` | prototype | `string \| null` |
| `smoothInfoCache` | prototype | `SmoothInfo \| null` |
| `subFloorCache` | prototype | `boolean` |

### Persistent (Reducer-Maintained)

| Structure | Scope | Update Cost |
|-----------|-------|-------------|
| Spatial index | All entities | O(N) rebuild per dispatch (idempotent) |

### Cached Between Frames (Invalidated on Change)

| Structure | Invalidated When | Cost to Rebuild |
|-----------|-----------------|-----------------|
| `cachedVisible[]` | Camera, entities, or filters change | O(visible area) spatial query + O(V log V) sort |
| `cachedHovered` | Cursor tile changes | O(1) spatial lookup |

### Per-Entity (UID-based)

| Cache | Key | Notes |
|-------|-----|-------|
| `pipeColorCache` | entity.uid | AtmosPipeColor component lookup |

---

## Per-Frame Work Summary

### With Layered Compositing

| Scenario | Per-Frame Cost | Notes |
|----------|---------------|-------|
| Idle | 0 work | Dirty flags skip entire frame |
| Hover only | ~5 draw calls | Overlay pass only (grid lines + tooltip) |
| Pan (within margin) | 2-3 drawImage composites + overlay | Cached layers at offset, no re-render |
| Pan (exceeds margin) | Full layer re-render + composite | Same as pre-compositing, but only when margin exceeded |
| Zoom (during scroll) | 2-3 scaled drawImage + overlay | Cached layers with scale transform |
| Zoom (after 150ms settle) | Full layer re-render + composite | Crisp re-render at new zoom level |
| Entity mutation | L1+L3 re-render next frame | Entity + connection layers (links to deleted entities removed) |
| Tile mutation | L0+L1+L3 re-render next frame | Tile, entity, and connection layers |
| Entity selection change | L3 re-render next frame | Connection layer only (highlight/dim) |

### Per-Layer Render Cost (when layer is dirty)

For a map with N total entities, V visible entities, and A visible tile area:

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Grid tile rendering (L0) | O(visible tiles) | Viewport-culled |
| Entity spatial query (L1) | O(A) | Visible area, not total entities |
| Entity sorting (L1) | O(V log V) | Cached, skipped when unchanged |
| IconSmooth per entity (L1) | O(1), 4-8 lookups | Via spatial index |
| Cable mask per entity (L1) | O(1), 4 lookups | Via spatial index |
| Sprite draw per entity (L1) | O(1) | Cache hit = instant |
| Connection rendering (L2) | O(V_connected × M) | Viewport-only, M = connections/entity |
| LOD mode (zoom < 6px) | O(V) | Colored dots only, no sprites |

### Overlay Pass (every frame, always cheap)

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Grid line rendering | O(visible lines) | Viewport-culled, density-culled |
| Tool preview | O(1) | Single draw operation |
| Hover tooltip | O(1) | Spatial index, cached by cursor tile |

---

## Remaining Optimization Opportunities

- **Edge-strip rendering**, when pan exceeds margin, only re-render the newly exposed edge strip instead of the full buffer. Would extend the benefit of oversized buffers.
- **Tint canvas pooling**, pool offscreen canvases for tint operations to reduce GC pressure.
- **Sprite atlas batching**, pack loaded sprites into atlas textures (mainly relevant if migrating to WebGL).
