# GRIMP, User Guide

## Getting Started

### Fork Selection

On first launch, the editor shows a fork selection screen:

- **Open Fork Folder**, Pick your SS14 repository's root directory. The editor scans the `Resources/` folder for prototypes and textures. Works with base Space Station 14 or any fork.
- **Use Built-in Resources**, If the editor is hosted with pre-bundled resources (e.g., a static deployment), this option loads them directly without needing a local folder. The button shows the built-in resource name (e.g., "Built-in", or a fork name if the build was pre-baked from a fork).

After selecting a fork, the editor shows a summary of what was found (file counts, detected fork directories) and a "Load" button. Loading typically takes 2-15 seconds depending on fork size.

**Browser compatibility:** Chrome and Edge use a native directory picker. Firefox and Safari use a folder upload input. All browsers support the full feature set.

**Privacy:** All files are processed locally in your browser. Nothing is uploaded or sent to any server.

### Switching Forks

The active fork name is shown in the menu bar. Click it and select "Switch Fork..." to return to the fork selection screen. All editor state and caches are cleared when switching.

### Running Locally

1. Run `npm run dev` from the `Tools/map_creator/` directory
2. Open the URL shown in the terminal (usually `http://localhost:5173`)
3. Select your fork on the landing screen, or use built-in resources

### Creating a Document

GRIMP works with the same two document kinds the game itself saves:

- **File > New Map** (`Ctrl+N`) creates a full map: a map entity with grids parented to
  it, the shape the game's `savemap` produces. Use this for stations and multi-grid maps.
- **File > New Grid** (`Ctrl+Shift+N`) creates a standalone grid with no map entity, the
  shape `savegrid` produces. This is what ships and POIs are: a grid file that loads onto
  a map at runtime. Ships are grids because that's the shape they have to be.

A **Map / Grid badge** in the menu bar shows which kind the current document is.

- **File > Import .yml** (`Ctrl+O`) loads an existing SS14 map or grid file. The document
  kind is read from the file, and the grid tab takes its name from the file's own
  identity (falling back to the filename).
- **File > Export .yml** (`Ctrl+S`) saves the document. The default filename follows the
  kind (`map.yml` / `grid.yml`).

### Map Properties

**File > Map Properties** opens the file-side view of the current grid: the data you would
otherwise inspect in-game with VV. It shows the document meta (kind, format, engine
version, tile count) and lets you edit:

- **Identity**: the grid's MetaData name and description.
- **Ship switches**: toggle the components that make a grid function as a ship.
  - **Shuttle**, an FTL-capable grid. The shipyard refuses to sell a ship without it.
  - **IFF**, radar identity (label, color, visibility). Optional.
  - **Roof**, required on Monolith ships.
  - **BecomesStation** with a station id, which keys the grid into its `gameMap`
    prototype's station config (name template, jobs).

If a grid file was accidentally saved as a map, Map Properties detects the leftover
map-entity components and offers one-click cleanup, which upstream maintainers require
before merging.

> **Note:** Edits to an imported file are applied surgically. Every line you did not
> change stays byte-for-byte identical on export, so a rename or a single toggle produces
> a clean, minimal diff.

### Navigation

- **Scroll wheel**, Zoom in/out (centered on cursor)
- **Middle mouse drag**, Pan the camera
- **Space + drag**, Pan the camera (from any tool)
- **H key**, Switch to dedicated Pan tool

---

## Tile Tools

These tools edit the tile grid (floors, walls, space).

### Paint (B)

Click or drag to paint tiles. Select a tile type from the **Tiles** tab in the left palette.

- Left-click or drag to paint
- The grid auto-expands when painting outside its current bounds

### Erase (E)

Click or drag to erase tiles (set to Space).

### Eyedropper (I)

Click to pick a tile, entity, or decal. Automatically switches to the appropriate tool (Paint for tiles/decals, Entity Place for entities). When picking a decal, the decal's color is also applied to the placement settings. Scroll wheel cycles through all items at the cursor position (entities, decals, then tiles).

### Fill (G)

Click to flood-fill a contiguous region of same-type tiles. Has a 50,000 tile safety limit.

### Rectangle (R)

Click and drag to draw a filled rectangle. Shows a live preview with dimensions (e.g. "12x8") while dragging.

### Line (L)

Click and drag to draw a line. Uses Bresenham's algorithm for clean pixel-perfect lines. Shows length label while dragging.

### Circle (C)

Click to set center, drag to set radius. Draws a filled circle. Shows radius label while dragging.

### Select (S)

Click and drag to select tiles and entities. Supports non-rectangular selections via modifier keys.

| Action | Effect |
|--------|--------|
| Drag | Replace selection with box contents (blue marquee) |
| Shift+Drag | Add box to existing selection (green marquee) |
| Ctrl+Drag | Remove box from existing selection (red marquee) |
| Ctrl+C | Copy selection |
| Ctrl+X | Cut (copy + erase to Space) |
| Ctrl+V | Paste, click to place the ghost preview |
| Delete / Backspace | Clear selection to Space |

Build complex shapes by combining multiple shift+drag additions. Carve out unwanted areas with ctrl+drag.

---

## Entity Tools

These tools work with entities (objects, machines, walls, doors, etc.).

### Entity Select (V)

Click to select entities. The info panel on the right shows details and lets you edit component properties. Selected entities show a pulsing gold outline that traces the exact sprite shape.

| Action | Effect |
|--------|--------|
| Left-click | Select topmost entity at tile |
| Click same tile again | Cycle through stacked entities |
| Scroll wheel (selected tile, 2+ entities) | Open stack picker, scroll to select, then drag immediately |
| Shift+click | Toggle entity in/out of selection |
| Drag on empty space | Box select, captures all entities in the rectangle |
| Shift+Drag | Add entities in box to current selection (green marquee) |
| Ctrl+Drag | Remove entities in box from current selection (red marquee) |
| Drag selected entity | Move all selected entities |
| R | Rotate all selected entities 90° clockwise |
| Delete / Backspace | Delete all selected entities |
| Right-click | Deselect all |

**Stack picker:** When you've selected an entity on a tile with multiple stacked entities, scroll the mouse wheel to open a picker popup. Scrolling immediately switches which entity is selected, no extra click needed. You can then click and drag to move the picked entity right away.

All operations are undoable with Ctrl+Z.

### Entity Place (P)

Place new entities on the map. First select an entity type from the **Entities** tab in the left palette.

| Action | Effect |
|--------|--------|
| Left-click | Place entity at cursor position |
| R | Cycle rotation (0°, 90°, 180°, 270°) before placing |

Entities are placed at tile center (x+0.5, y+0.5). Selecting an entity in the palette auto-switches to this tool.

### Decals

Decals are lightweight floor decorations (warning lines, arrows, department color overlays, dirt, flora). They render between tiles and entities.

**Browsing:** Open the **Decals** tab in the palette panel to see all available decal prototypes. Use the search box to filter.

**Placing:** Select a decal from the palette, then click on the canvas to place it. Adjust color, angle, z-index, snap, and cleanable in the placement controls below the palette list.

**Selecting:** Use the Entity Select tool (V). Click on a decal to select it, it highlights with a cyan dashed outline. Shift+click to multi-select. Box select captures both entities and decals.

**Editing:** With a decal selected, the Decal Info Panel appears in the sidebar. Edit color, angle, z-index, and cleanable. All changes are undoable. With multiple decals selected, any property change applies to all selected decals. Mixed values show a dash placeholder.

**Bulk recoloring:** When a decal has a color, the info panel shows:
- **Select All (N)**, select all decals in the grid with the same color (useful for selecting an entire department's decals)
- **Recolor All**, change every decal with the matching color to a new color in one operation (great for rebranding a department)

**Color picker:** The Eyedropper tool (I) picks decals in addition to tiles and entities. Click a decal to select its prototype and color for placement. Scroll wheel cycles through entities, decals, and tiles at the same position.

**Moving:** Drag selected decals to reposition them.

**Deleting:** Press Delete or Backspace to remove selected decals.

### Device Link (D)

Wire up device connections (air alarm → vents, fire alarm → firelocks, buttons → doors).

| Action | Effect |
|--------|--------|
| Left-click a source entity | Start linking mode (entity must have DeviceList or DeviceLinkSource component) |
| Left-click a target entity | Add link from source to target |
| Right-click a linked target | Remove the link |
| Click empty space / Escape | Cancel linking mode |

**Tips:**
- Valid source entities are highlighted with green outlines when the tool is active
- Already-linked targets show cyan/orange outlines during linking
- Enable **View > Show Connections** to see all device links as colored lines
- Use the **Auto-link Room** button in the Entity Info panel to automatically link devices in the same room:
  - **AirAlarm**: links to all vents, scrubbers, and sensors within the enclosed room (bounded by walls and doors)
  - **FireAlarm**: links to all firelocks on the room's boundary edges
  - Works on newly placed alarms, no manual DeviceList component setup needed

---

## Infrastructure Tools

These tools draw cables and pipes for power and atmospheric systems.

### Cable Draw (K)

Drag to lay cable entities. Select cable type from the Infrastructure Panel that appears on the right.

| Cable Type | Color | Purpose |
|-----------|-------|---------|
| CableHV | Orange | High voltage (generator → SMES → substations) |
| CableMV | Yellow | Medium voltage (substations → APCs) |
| CableApcExtension | Green | Low voltage (APC → room coverage) |

- Left-drag to lay cables (one per tile)
- Right-click to erase cable at cursor
- SS14 auto-connects cables, no rotation needed

### Pipe Draw (J)

Drag to lay pipe paths. Select pipe type from the Infrastructure Panel.

| Pipe Type | Color | Purpose |
|----------|-------|---------|
| Supply | Blue | Atmosphere supply (connects to vents) |
| Return | Red | Atmosphere return (connects to scrubbers) |
| Disposal | Brown | Disposal network (connects to disposal units) |

- Left-drag to lay a pipe path
- On release, the auto-fitting algorithm determines the correct pipe prototype (Straight, Bend, T-Junction, Fourway) and rotation for each tile
- Right-click to erase pipe at cursor (neighbors are automatically refitted)

---

## Prefabs

Prefabs let you save and reuse map regions as `.prefab.json` template files.

### Creating a Prefab

1. Use the **Select Tool** (S) to select a rectangular region
2. **Right-click** inside the selection to open the context menu
3. Click **"Save as Prefab..."**
4. Enter a name in the dialog
5. The file downloads as `name.prefab.json`

The prefab captures all non-Space tiles, entities (with their raw YAML data for export correctness), and device links within the selection. Links to entities outside the selection are dropped.

### Placing a Prefab

1. Click the **Prefabs** tab in the left palette panel
2. Click **+** to import a `.prefab.json` file, or click the folder icon to browse a directory of prefabs
3. Click a prefab entry in the list, the editor switches to placement mode
4. A ghost preview follows your cursor showing the prefab footprint (blue = tiles, green = entities)
5. **Left-click** to stamp the prefab onto the map
6. You stay in placement mode, click again to stamp additional copies
7. Press **Escape** or switch tools to exit placement mode

### Conflict Handling

Stamping a prefab overwrites everything in the footprint:
- Existing tiles are replaced with prefab tiles
- Existing entities in the footprint are removed
- Prefab entities are placed with fresh UIDs

Each stamp is a single undoable command, **Ctrl+Z** reverts the entire stamp.

### Context Menu

Right-click on the canvas to open a context menu. Available items depend on the active tool:

| Tool | Context Menu Items |
|------|--------------------|
| Select (with selection) | Copy, Cut, Delete, Save as Prefab... |
| Select (with clipboard) | Paste |
| Other tools | No context menu |

---

## Panels

### Tile Palette (left sidebar, Tiles tab)

Grid of all available tile types with texture previews. Click to select, then paint with the Paint tool. Search box at the top filters tiles by name.

### Entity Palette (left sidebar, Entities tab)

Browsable tree of all SS14 entity prototypes, organized by category. Click to select, then place with the Entity Place tool. Search box filters by name or ID. Priority categories (Structures, Doors, Machines, etc.) are shown first.

### Prefab Library (left sidebar, Prefabs tab)

Browse and place saved prefab templates.

- **+ button**, Import a `.prefab.json` file from disk
- **Folder icon**, Open a directory of prefabs (uses File System Access API, Chrome/Edge only)
- **Refresh button**, Re-scan the open directory for new/deleted files
- Click a prefab entry to enter placement mode (switches to PrefabPlaceTool)

### Entity Info Panel (right sidebar)

Appears when entities are selected. Shows:

**Single entity:**
- Name, prototype, UID, position, rotation, category
- **Sprite State** dropdown (when the entity's RSI has multiple states)
- Rotate and Delete buttons
- Expandable component list with inline editors for known types
- "Auto-link Room" button for entities with DeviceList (air alarms, fire alarms)

**Multiple entities:**
- Selection count and prototype summary
- Rotate All and Delete All buttons

### Component Editors

When you expand a component in the Entity Info panel, you get a type-specific editor:

| Component | Editor |
|-----------|--------|
| MetaData | Text input for entity name |
| Battery | Number inputs for maxCharge, startingCharge |
| SurveillanceCamera | Text inputs for camera ID and network |
| AtmosPipeColor | Color presets (Supply Blue, Return Red) or custom hex |
| DeviceList | List of linked device UIDs with add/remove |
| DeviceLinkSource | Port mapping table (target UID, source port, sink port) |
| Other | Generic JSON editor with validation |

You can also add new components (+ Add Component) or remove existing ones (x button).

### Sprite State Selector

When a single entity is selected, the Entity Info Panel shows a **Sprite State** dropdown if the entity's RSI has multiple states. This lets you change the visual appearance of the entity in the editor (e.g., open/closed locker, welded door).

- **Default**, Uses the entity prototype's default state
- Each available RSI state is shown with a small thumbnail preview
- Changes are undoable with Ctrl+Z
- State overrides are preserved through copy/paste, prefab save/load, and entity moves

> **Note:** Sprite state overrides are currently visual-only in the editor. They do not yet affect the exported YAML, entities will spawn in their default state in-game. Component mapping for persisted export is planned for a future update.

### Infrastructure Panel (right sidebar)

Appears when Cable Draw or Pipe Draw tool is active. Select cable type (HV/MV/APC) or pipe type (Supply/Return/Disposal).

### Layer Panel (right sidebar)

Toggle visibility of entity layers: SubFloor, Floor Objects, Structures, Objects, Doors, Markers, Atmos Markers, Decals. Also toggle sub-floor visibility (T-Ray mode) and connection line overlay.

**Atmos Markers** are the `AtmosFix` (VAC. / gas-fill) markers that ship hulls carpet across every space-adjacent tile. On a dense ship they bury the actual layout, so this toggle (also on **View > Atmos Markers**) hides just that family while leaving spawn points and other markers visible. Markers are detected by their `Marker` component, not just by name, so entities like warp points hide correctly.

Hidden layers affect both rendering and interaction, entities and decals on hidden layers cannot be selected (click, box select, or scroll picker) and do not appear in the hover tooltip. This lets you isolate specific layer types for editing without accidentally selecting items on other layers.

**Decals** are floor decorations (warning lines, arrows, department color overlays, dirt, flora) stored as lightweight visual data in the map. They render between tiles and entities. Imported maps with decals display them automatically, toggle the Decals checkbox to show/hide.

---

## Keyboard Shortcuts

### Tools

| Key | Tool |
|-----|------|
| B | Paint |
| E | Erase |
| I | Eyedropper |
| H | Pan |
| G | Fill |
| R | Rectangle |
| L | Line |
| C | Circle |
| S | Select (tiles) |
| V | Entity Select |
| P | Entity Place |
| D | Device Link |
| K | Cable Draw |
| J | Pipe Draw |

### Actions

| Shortcut | Action |
|----------|--------|
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+C | Copy tile selection |
| Ctrl+X | Cut tile selection |
| Ctrl+V | Paste tile selection |
| Delete / Backspace | Delete selection (tiles or entities) |
| R | Rotate entity (when Entity Select or Entity Place active) |
| Shift+click | Toggle entity in multi-selection |
| Escape | Cancel device linking / exit prefab placement |
| Right-click | Context menu (Select tool) / deselect (Entity Select) |
| Space (hold) | Temporary pan from any tool |
| Middle mouse | Pan |
| Scroll wheel | Zoom |

---

## Map Validation

Click the warning triangle icon in the grid tab bar (left of the search bar) to scan the active grid for common mapping mistakes.

The validator checks for:
- **Floor tiles under walls** -- Walls should be on Plating, not FloorSteel or other floor tiles. Floor tiles block cable placement under walls, making it difficult to add new APCs or route power.
- **Doors without floor tiles** -- Airlocks and firelocks need a walkable floor tile underneath to function properly.
- **Dangling device references** -- DeviceList, DeviceLinkSource, or DeviceNetwork components referencing entities that no longer exist in the map.
- **Unlinked air alarms** -- AirAlarm entities with no devices linked (empty DeviceList). These won't control any vents or scrubbers.
- **Unlinked fire alarms** -- FireAlarm entities with no devices linked. These won't control any firelocks.

Results are grouped by rule type with error/warning counts. Click any issue to close the modal and jump to the problem location. A pulsing red highlight marks the tile for 3 seconds.

---

## Tips

- **Undo everything**, Every operation (paint, move, delete, property edit, link) is recorded in the undo stack. Ctrl+Z to undo, Ctrl+Y to redo. Up to 200 steps.
- **Show connections**, Enable View > Show Connections to see device link lines. Select an entity to highlight its connections.
- **Auto-link saves time**, After placing an AirAlarm, select it and click "Auto-link Room" to wire all nearby vents and scrubbers automatically.
- **Pipe auto-fitting**, Just drag a path. The editor figures out straight sections, bends, T-junctions, and fourway intersections automatically.
- **Stack picker**, Multiple entities on the same tile? Select one, then scroll the mouse wheel to pick the exact entity you want. It's selected immediately so you can drag it right away.
- **Box select**, With Entity Select (V), drag on empty space to select all entities in a rectangle. Shift+click to add/remove from the selection.
- **Build a prefab library**, Save common room designs (medbay, engineering, etc.) as prefabs. Keep them in a folder and use the Prefabs panel's directory browser for quick access.
- **Prefabs preserve export fidelity**, Entities saved in prefabs carry their raw YAML data, so stamping a prefab and exporting produces valid SS14 map files with byte-exact entity data.
