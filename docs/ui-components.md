# UI Components Reference

## CollapsiblePanel

A shared wrapper for sidebar panels that can be expanded/collapsed by clicking the header.

### Usage

```tsx
import { CollapsiblePanel } from './components/CollapsiblePanel';

<CollapsiblePanel title="Entity Info" defaultOpen={true}>
  {/* panel content */}
</CollapsiblePanel>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | required | Header text |
| `defaultOpen` | `boolean` | `true` | Initial expanded state |
| `forceOpen` | `boolean` | `undefined` | When true, auto-expands the panel (e.g., on entity selection) |
| `className` | `string` | `''` | Additional CSS classes on the outer container |
| `children` | `ReactNode` | required | Panel content |

### Behavior

- Click the header bar to toggle collapsed/expanded
- Collapsed: only the header (~28px tall) is visible
- Expanded: header + scrollable content
- `forceOpen` triggers auto-expand but user can still manually collapse afterward
- Uses Tailwind classes for styling (theme tokens: `bg-surface`, `border-subtle`, etc.)

### Extending

To create a new collapsible sidebar panel:
1. Wrap your content in `<CollapsiblePanel>`
2. Add it to the right sidebar in `App.tsx`
3. Pass `forceOpen` if the panel should auto-expand based on some condition

## ContainerContentsEditor

Inline editor for viewing and modifying the contents of container entities (lockers, crates).

### Usage

```tsx
import { ContainerContentsEditor, hasContainerComponent } from './components/ContainerContentsEditor';

{hasContainerComponent(entity.components) && (
  <ContainerContentsEditor
    entity={entity}
    containedEntities={containedEntities[entity.uid] ?? []}
    registry={registry}
    onAdd={(parentUid, prototypeId) => dispatch({ type: 'ADD_CONTAINED_ENTITY', parentUid, prototypeId })}
    onRemove={(parentUid, entityUid) => dispatch({ type: 'REMOVE_CONTAINED_ENTITY', parentUid, entityUid })}
  />
)}
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `entity` | `ImportedEntity` | The container entity |
| `containedEntities` | `ImportedEntity[]` | Entities currently inside the container |
| `registry` | `IPrototypeRegistry \| null` | Prototype registry for search and thumbnails |
| `onAdd` | `(parentUid, prototypeId) => void` | Called when adding an item |
| `onRemove` | `(parentUid, entityUid) => void` | Called when removing an item |

### Exported Helpers

- `hasContainerComponent(components)`, returns true if the entity has a `ContainerContainer` component
- `getContainedEntityUids(components)`, extracts UIDs from the `entity_storage.ents` list

See [Container System](container-system.md) for full architecture documentation.

## Entity Search Bar

A persistent search bar in the GridTabBar for finding placed entities on the active grid.

**Location:** Right side of the grid tab bar, always visible.

**Search fields:** Prototype ID and display name (case-insensitive substring match).

**Components:**
- `src/hooks/useEntitySearch.ts`, `filterEntities()` pure function + `useEntitySearch()` hook
- `src/components/EntitySearchBar.tsx`, Search input, results dropdown, keyboard navigation

**Interactions:**

| Action | Result |
|--------|--------|
| Type query | Filters placed entities, shows dropdown (max 200 results) |
| Click result | Pans camera to entity, selects it |
| Arrow Up/Down | Navigate results list |
| Enter | Jump to highlighted result |
| Escape | Close dropdown / clear + blur |
| Ctrl+F | Focus search bar |
| × button | Clear query |

**Result row shows:** Sprite thumbnail (24×24), display name, prototype ID, position (x,y), UID.

**Camera behavior:** Centers on entity position. Always zooms to 3× (96px/tile) for clear visibility.

## Theme Tokens

Custom colors defined in `src/App.css` via `@theme`:

| Token | Value | Usage |
|-------|-------|-------|
| `panel` | `#0d1b2a` | Darkest background (sidebar base) |
| `surface` | `#16213e` | Panel headers, section backgrounds |
| `elevated` | `#1a1a3e` | Buttons, inputs, modals |
| `subtle` | `#2a2a4a` | Borders, separators |
| `primary` | `#e0e0e0` | Main text |
| `muted` | `#888888` | Secondary text, labels |
| `accent` | `#4488ff` | Active states, highlights |
| `active` | `#0f3460` | Active/selected backgrounds |
| `hover` | `#1a2a4e` | Hover backgrounds |
| `danger` | `#cc4444` | Delete buttons, errors |
| `success` | `#88ff88` | Success indicators |
| `warning` | `#ff8800` | Warning indicators |

Use as Tailwind classes: `bg-panel`, `text-muted`, `border-subtle`, etc.
