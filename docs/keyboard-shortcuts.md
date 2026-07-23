# Controls

## Tool Selection

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
| S | Select (tiles + entities) |
| V | Entity Select |
| P | Entity Place |
| K | Cable Draw |
| J | Pipe Draw |
| D | Device Link |

Tool shortcuts are case-insensitive and ignored when typing in input fields.

## General

| Shortcut | Action |
|----------|--------|
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+Shift+Z | Redo (alternative) |
| Ctrl+N | New Map |
| Ctrl+Shift+N | New Grid |
| Ctrl+O | Import .yml |
| Ctrl+S | Export .yml |
| Space (hold) | Temporary pan mode |
| Escape | Cancel current operation / close menu |

## Selection Modifiers (Select Tool + Entity Select Tool)

| Shortcut | Action |
|----------|--------|
| Shift+Drag | Add box contents to existing selection (green marquee) |
| Ctrl+Drag | Remove box contents from existing selection (red marquee) |
| Drag (no modifier) | Replace selection with box contents (blue marquee) |

## Clipboard (Select Tool)

| Shortcut | Action |
|----------|--------|
| Ctrl+C | Copy selection |
| Ctrl+X | Cut selection |
| Ctrl+V | Paste (enters paste mode) |
| Delete / Backspace | Delete selection |

## Entity Rotation

When Entity Select or Entity Place tool is active:

| Shortcut | Action |
|----------|--------|
| R | Rotate CW (90 degrees) |
| Shift+R | Rotate CCW (90 degrees) |

## Mouse

### Canvas Navigation

| Action | Behavior |
|--------|----------|
| Scroll wheel | Zoom in/out |
| Middle click + drag | Pan |
| Space + click + drag | Pan |

### Entity Select Tool (V)

> **Note:** The Entity Select tool also handles decals. Click, shift+click, box select, drag-move, and delete all work on decals the same way they do on entities. Mixed entity+decal selections are supported.

| Action | Behavior |
|--------|----------|
| Click | Select entity or decal (cycles through stack on repeated clicks) |
| Click + drag (on selected) | Move entity (grid-snapped) |
| Shift + click (on unselected) | Toggle into selection |
| Shift + click (on selected, no drag) | Toggle out of selection |
| Shift + drag (on selected) | Free-move with fractional precision |
| Box drag (from empty space) | Select all entities in rectangle |
| Right click | Deselect all |
| Scroll wheel (on selected tile) | Cycle through overlapping entities (stack picker) |

### Entity Place Tool (P)

| Action | Behavior |
|--------|----------|
| Click | Place entity at tile center |
| Shift + click | Place entity at exact cursor position (free placement) |

### Select Tool (S)

| Action | Behavior |
|--------|----------|
| Click + drag | Create selection rectangle |
| Click inside + drag | Move selection |
| Click outside | Start new selection |
| Right click (with selection) | Context menu (Copy, Cut, Delete, Save as Prefab) |

### Cable / Pipe Draw Tools (K / J)

| Action | Behavior |
|--------|----------|
| Click + drag | Draw cable/pipe along path |
| Right click | Erase at tile |

### Device Link Tool (D)

| Action | Behavior |
|--------|----------|
| Click | Select source device / toggle link to target |
| Right click | Cancel linking |
| Escape | Cancel linking |
