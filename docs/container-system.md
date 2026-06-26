# Container System

## Overview

SS14 entities can contain other entities (lockers hold items, crates hold supplies). The map editor supports viewing and editing these contained entities through a dedicated UI in the Entity Info Panel.

## How SS14 Containers Work

In SS14 map YAML, container relationships are defined by three parts:

1. **Parent entity** has a `ContainerContainer` component with an `entity_storage` container listing child UIDs:
   ```yaml
   - type: ContainerContainer
     containers:
       entity_storage: !type:Container
         showEnts: False
         occludes: True
         ents:
         - 101
         - 102
   ```

2. **Child entities** have a Transform with `parent: <containerUID>` (no `pos` field) and `Physics { canCollide: False }`:
   ```yaml
   - type: Transform
     parent: 100
   - type: Physics
     canCollide: False
   ```

3. Children exist at position (0,0) in the container's virtual local space, they have no world position.

### Runtime-filled containers

Some entities use `EntityTableContainerFill` to populate contents at MapInit (server-side). These items are NOT in the YAML, they're spawned at runtime. The editor shows a note for these entities.

## Editor Architecture

### Import

During import (`src/import/mapImporter.ts`), a single pass through `parseNonStructuralEntities` separates entities by checking the Transform `parent` field:

- `parent` equals grid UID, map UID, or absent → grid entity → `entities[]`
- `parent` equals any other UID → contained entity → `containedEntities[parentUid]`

The `ImportedMap` type has: `containedEntities?: Record<number, ImportedEntity[]>`

### State

`EditorState` has a non-optional `containedEntities: Record<number, ImportedEntity[]>` field, initialized to `{}`.

Two reducer actions manage container contents:
- `ADD_CONTAINED_ENTITY { parentUid, prototypeId }`, creates a child entity, updates parent's `ContainerContainer` ents list, supports undo
- `REMOVE_CONTAINED_ENTITY { parentUid, entityUid }`, removes a child, updates parent's ents, supports undo

Cascade delete: removing a container entity from the map also removes its contained entities. Undo restores both.

### Export

The exporter (`src/export/mapExporter.ts`) recombines contained entities with grid entities before grouping by prototype. Imported contained entities use preserved raw YAML lines for byte-exact roundtrip. Newly added entities have their components synthesized.

Orphan contained entities (whose parent was deleted) are not exported.

## UI

The `ContainerContentsEditor` component (`src/components/ContainerContentsEditor.tsx`) appears in the Entity Info Panel when the selected entity has a `ContainerContainer` component.

Features:
- **Item list**, shows each contained entity with a thumbnail, prototype name, and remove button
- **Add search**, inline search input queries the prototype registry; clicking a result dispatches `ADD_CONTAINED_ENTITY`
- **Runtime-fill note**, if `EntityTableContainerFill` is present, shows "Runtime-filled, items below are hand-placed additions"

## Limitations (v1)

- No prototype fill display (EntityTableContainerFill contents not parsed)
- No grid-based Storage editor (backpack slot positions)
- No ContainerSlot editing (paper_label, single-item slots)
- No rendering of contained entities on the canvas
- No nested container editing UI (containers inside containers)
