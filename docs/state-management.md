# State Management

The editor uses React's `useReducer` with a command pattern for undo/redo. All map mutations flow through the reducer, ensuring predictable state transitions and a clean history stack.

## EditorState

Defined in `src/state/editorState.ts`:

```typescript
interface EditorState {
  grid: TileGrid;                    // Tile data (flat array + offsets)
  entities: ImportedEntity[];        // All placed entities
  activeTool: ToolType;             // Current tool selection
  selectedPaletteItem: PaletteItem | null;
  nextEntityId: number;             // Auto-increment for new entities
  undoStack: Command[];             // Up to 200 commands
  redoStack: Command[];
  registry: IPrototypeRegistry | null;  // Game data (loaded once)
  mapUid: number;                   // Preserved for roundtrip; -1 for grid documents (no map entity)
  gridUid: number;
  meta: MapMeta;                    // Full meta (format, category, engineVersion, etc.)
  maps?: number[];                  // Format 7+ maps UIDs
  grids?: number[];                 // Format 7+ grid UIDs
  structuralEntityData?: Record<number, Record<string, unknown>[]>;
  entityRawComponents?: Record<number, string[]>;  // Verbatim YAML for export roundtrip
  tilemap?: Record<number, string>;                // Tile index → ID mapping
  chunkKeyOrder?: string[];                        // Original chunk ordering
  lineEnding?: string;                             // Detected line ending style
  selectedEntityUids: number[];                    // Multi-select entity UIDs
  dirty: boolean;                   // Unsaved changes flag
}
```

## Actions

Defined in `src/state/actions.ts`. Each action type maps to a specific state transition:

| Action | Purpose |
|--------|---------|
| `APPLY_COMMAND` | Apply a tile/entity change with undo support |
| `UNDO` | Pop from undo stack, apply reverse command |
| `REDO` | Pop from redo stack, re-apply command |
| `SET_TOOL` | Switch active editing tool |
| `SET_PALETTE_ITEM` | Select a tile or entity in the palette |
| `LOAD_MAP` | Replace all map data from an imported map (optional `sourceName` seeds the display name) |
| `NEW_MAP` | Reset to an empty Map document (format 7, `category: Map`) |
| `NEW_GRID` | Reset to an empty Grid document (format 7, `category: Grid`, no map entity) |
| `SET_REGISTRY` | Store the loaded prototype registry |

### Document property actions

These back the Map Properties panel. They are **not** undoable commands: they patch the
grid root's structural data directly (imported files via surgical raw-YAML patch, see
[import-export.md](import-export.md#surgical-property-edits); from-scratch documents via
`GridData` fields the exporter synthesizes). Each sets `dirty: true`.

| Action | Purpose |
|--------|---------|
| `SET_GRID_IDENTITY` | Set the grid root's MetaData name / description |
| `SET_ROOT_COMPONENT` | Add or remove a bare root component (Shuttle, IFF, Roof, …) |
| `SET_ROOT_COMPONENT_FIELD` | Set a scalar field on a root component (e.g. `BecomesStation.id`) |

## Command Pattern

Commands are the unit of undo/redo. Each command records what changed:

```typescript
interface Command {
  label: string;           // Human-readable description
  tileChanges: TileChange[];    // Before/after for each tile
  entityChanges: EntityChange[]; // Add/remove entities
}

interface TileChange {
  x: number; y: number;
  before: TileCell;
  after: TileCell;
}

interface EntityChange {
  action: 'add' | 'remove';
  entity: ImportedEntity;
}
```

### How undo/redo works

1. **Apply**: The reducer applies `command.tileChanges[].after` values, pushes the command to `undoStack`, clears `redoStack`.
2. **Undo**: Reverses the last command, applies `.before` values, moves command from `undoStack` to `redoStack`.
3. **Redo**: Re-applies the command from `redoStack`, moves it back to `undoStack`.

The undo stack is capped at 200 entries (oldest entries are dropped).

### Prefab Placement Commands

Prefab stamps produce a standard `Command` with:
- `tileChanges`: before/after for each prefab tile at the target position
- `entityChanges`: `remove` for existing entities in the footprint, then `add` for each prefab entity with a fresh UID

Raw YAML lines (`entityRawComponents`) are stored as a side effect on placement, matching the pattern used for imported entities. They are not part of the undo stack, dead UIDs from undone placements are harmless.

### Spatial index sync

When a command adds or removes entities, the reducer calls `rebuildSpatialIndex(entities)` after computing the final entity array. This keeps the module-level spatial hash (used for O(1) tile lookups by the renderer) in sync with the entity array.

**StrictMode constraint:** The rebuild must be a full clear-and-rebuild, not incremental insert/remove. React 18 StrictMode double-invokes reducers in development to detect side effects. Incremental spatial mutations are non-idempotent, the second invocation would create duplicate cell entries, causing phantom entity rendering. `rebuildSpatialIndex` is idempotent (clears first), so it's safe under double-invoke. See `moveUndoIntegrity.test.ts` for regression tests that simulate double-invoke.

## Auto-Expanding Grid

The tile grid uses world coordinates with an offset system. When a tool paints outside the current grid bounds, the grid auto-expands with configurable padding (default 16 tiles):

```typescript
// Expand grid to contain a world coordinate
ensureGridContains(grid, worldX, worldY, padding = 16): TileGrid

// Expand grid to contain a bounding box
ensureGridContainsBounds(grid, minX, minY, maxX, maxY, padding = 16): TileGrid
```

Grid cells are accessed by world coordinate:

```typescript
getCell(grid, worldX, worldY): TileCell | null
setCell(grid, worldX, worldY, cell): void
```

## ImportedEntity: spriteStateOverride

`ImportedEntity` has an optional `spriteStateOverride?: string` field that stores a visual RSI state override selected via the Sprite State Selector (see [tools.md](tools.md)). This field is editor-only, it controls which RSI state the renderer draws for the entity but is **not exported to YAML**. It persists through undo/redo (stored on the entity object in `EntityChange`) and through prefab save/load (see [prefab-system.md](prefab-system.md)).

## Multi-Grid State Model

The editor supports multiple grids per map (e.g., main station + cargo shuttle + ERT shuttle).

### State Shape

`EditorState` now has:

- `grids: GridData[]`, array of all grids in the map, each containing its own `grid` (TileGrid), `entities`, `containedEntities`, `gridUid`, `chunkKeyOrder`, `structuralComponents`, and `name`
- `activeGridIndex: number`, index into `grids` for the currently edited grid

Legacy alias fields (`grid`, `entities`, `containedEntities`, `gridUid`) are kept temporarily for backward compatibility but are deprecated, they mirror the active grid's data.

### Accessors

- `getActiveGrid(state.grids, state.activeGridIndex)`, returns the active `GridData`
- `getGridByUid(state.grids, uid)`, finds a grid by its UID

### Actions

| Action | Purpose |
|--------|---------|
| `SET_ACTIVE_GRID` | Switch which grid tools operate on |
| `ADD_GRID` | Create a new empty grid |
| `REMOVE_GRID` | Delete a grid and its entities |
| `RENAME_GRID` | Change a grid's display name |

All grid operations are undoable via the `GridCommand` type.

### Undo/Redo Targeting

`Command` now carries an optional `gridUid` field. When undoing/redoing, the reducer uses this field to apply changes to the correct grid, even if the user has switched active grids since the command was created. This prevents cross-grid corruption.

### Tool Isolation

All tools operate on the active grid only. The grid tab bar (above the canvas) lets users switch grids, which updates `activeGridIndex` and changes which grid receives tool interactions.

## Data Flow

```
User interaction
  → Tool.onMouseDown/Move/Up()
    → Collects changes in tool-local state
    → On mouseUp: dispatch({ type: 'APPLY_COMMAND', command })
      → Reducer applies changes to grid/entities
      → rebuildSpatialIndex(entities)  ← keeps spatial hash in sync
        → React re-renders
          → Canvas redraws with new state
```

Tools never mutate state directly through the reducer. During drag operations, tools mutate the grid directly for visual feedback, then commit the batch as a single command on mouseUp.

## Adding New State

To add a new piece of editor state:

1. Add the field to `EditorState` in `src/state/editorState.ts`
2. Initialize it in `createInitialState()`
3. Add action type(s) to `src/state/actions.ts`
4. Handle the action in `src/state/editorReducer.ts`
5. If undoable, extend `Command` with the new change type and update `applyCommand`/`reverseCommand`

## Files

| File | Purpose |
|------|---------|
| `src/state/editorState.ts` | `EditorState` interface, grid helpers, initial state |
| `src/state/actions.ts` | Action type union |
| `src/state/editorReducer.ts` | Central reducer with undo/redo |
| `src/types.ts` | `Command`, `TileChange`, `EntityChange`, `TileGrid` |
| `src/state/clipboard.ts` | Clipboard data for copy/paste |
| `src/prefab/prefabPlacer.ts` | Prefab stamp → Command generation |
| `src/rendering/spatialIndex.ts` | Persistent spatial hash (reducer-maintained) |
