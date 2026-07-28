# Changelog

All notable changes to GRIMP are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every PR that changes user-facing behavior adds a line under **Unreleased**.
At release time that section becomes the new version's entry, and the release
workflow copies it into the GitHub release notes.

## [Unreleased]

### Fixed

- Panning could get stuck "on" when a mouse release went missing (released
  outside the window, eaten by native middle-click handling). The view would
  then follow the bare cursor back toward the pan start, and the next click
  selected a spot the cursor never visibly touched. The editor now checks
  which buttons are actually held on every mouse move and ends stale pans
  and tool drags immediately.
- Space (temporary pan) and R (rotate modifier) could get stuck "held" when
  a native menu, dialog, or alt-tab stole the key release: every click then
  panned instead of selecting, and scrolling silently rotated the selected
  entity instead of zooming. Held keys now release whenever the window
  loses focus.
- Switching tools mid-interaction (for example via a tool shortcut during a
  drag) stranded the old tool's in-progress state: ghost previews reappeared
  the next time the tool was selected, and a half-finished paint or erase
  stroke stayed in the grid as a silent, non-undoable edit. Tool switches
  now cancel the outgoing tool's interaction, and cancelled paint/erase
  strokes revert cleanly.
- Pressing R in entity-select mode with nothing selected silently switched
  to the Rectangle tile tool, so the next drag painted tiles instead of
  selecting. R is now a no-op there when there is nothing to rotate.
- Escape now cancels the active tool's in-progress action everywhere: paste
  ghost, marquee drag, pending device link (previously the only case), or
  an uncommitted stroke.
- Keyboard shortcuts no longer fire behind modals. Delete could remove
  entities behind a confirm dialog, Ctrl+Z undid edits behind Settings, tool
  shortcuts switched tools invisibly, and Escape closed a modal while also
  cancelling the tool interaction underneath it. Modals now own the keyboard
  while open.
- Focus Grid zoomed past the grid it was framing on displays with Windows
  scaling (the zoom overshot by the scaling factor, 1.5x at 150%). It now
  frames the grid correctly, and the initial view fit after importing a map
  measures the real canvas instead of estimating from the window size.

## [1.3.0] - 2026-07-26

### Added

- Save vs Save As (desktop): Ctrl+S now writes straight to the file's known
  path with no dialog, and a successful save clears the unsaved-changes
  marker. Ctrl+Shift+S (Save As) keeps the dialog flow and adopts the chosen
  path. New documents and the browser build fall back to the old behavior.
  Ctrl+S and Ctrl+Shift+S are also real keyboard shortcuts now; before, the
  menu displayed Ctrl+S but only clicking the menu item worked. (#49)
- Desktop: launching GRIMP while it's already running now focuses the
  existing window instead of opening a second instance (which could
  silently overwrite your settings and recent lists). (#48)
- The window title now shows the open file and unsaved-changes state
  (`● map.yml - GRIMP`), so a minimized editor tells you what it holds. (#57)
- Start screen (desktop): the landing screen is now a VS Code-style welcome.
  Recently opened map/grid files sit alongside recent forks and discovered
  forks; a recent file remembers which fork it was opened under and one click
  restores both, fork first, then the file. Files are recorded on native
  open and save. (#35)
- Recent forks on the landing screen (desktop): the last few forks you loaded
  are one click to reopen. Dead paths drop off the list automatically. (#11)
- Forks folder auto-discovery (desktop): point GRIMP at the folder holding
  your fork checkouts and the landing screen lists every fork it finds. The
  fork picker dialog also starts there. (#34)
- Settings window (File > Settings, or Ctrl+,) with persisted preferences,
  managing the forks folder and recent-forks list. View toggles stay in the
  View menu (they're flipped too often to bury in Settings) but now survive
  app restarts too; everything is stored in the desktop app's user data
  folder, or browser storage in dev. (#19)
- Sprite `scale` is now rendered. Scaled sprites (Tippy, Narsie, dwarf
  species, jack-o'-lanterns) draw at their true size instead of 1x, including
  mirrored sprites like the reversed lizard plushie. (#6)

### Removed

- The inert "Use Built-in Resources" option on the start screen. The editor
  ships without bundled game content; the button could never activate. (#9)

### Fixed

- Desktop: prefabs now live in a real library (the app's user data folder).
  Save as Prefab writes there and the prefab panel lists it immediately;
  before, saved prefabs fell into the browser Downloads folder and the panel
  couldn't list anything in the packaged app. The + button imports copies
  into the library via a native picker, and a new folder button opens the
  library in your file manager. (#45)
- Add Grid, grid rename, and Save as Prefab work in the desktop app again.
  They relied on `window.prompt()`, which silently does nothing under
  Electron; they now use a proper in-app dialog. (#14)

## [1.2.1] - 2026-07-23

### Fixed

- The desktop window could not be closed once you had unsaved changes. A
  browser-style unsaved-changes guard silently vetoed the window close under
  Electron, so after any edit the X button and Alt+F4 both did nothing.
- Closing with unsaved work now asks first: the desktop app shows a native
  "Cancel / Close Without Saving" confirmation instead of losing changes
  silently.

## [1.2.0] - 2026-07-23

First release under the GRIMP name (Generally Reliable Interactive Mapping
Program).

### Added

- Grid documents: File > New Map / New Grid mirroring the game's savemap and
  savegrid shapes, with a Map/Grid badge in the menu bar. New documents are
  born format 7 with the correct `meta.category`.
- Map Properties panel: document identity plus Shuttle, IFF, Roof, and
  BecomesStation switches with surgical raw-YAML patching.
- Atmos marker visibility toggle (View > Atmos Markers).

### Changed

- Rebranded from space-station-14-map-editor to GRIMP throughout the app,
  README, and packaging. SuspensionPoint's original work stays credited in
  the README and About.

## [1.1.0] - 2026-07-22

### Added

- Native application menus in the desktop app.
- Native fork loading from disk (`app://` origin), replacing the browser
  folder-picker flow on desktop.

### Fixed

- Middle-click pan.
- Export parity fixes against the game serializer: variant zeroing,
  grid-file `maps:`/`orphans:` mangling, dropped SPDX headers, and
  trailing-newline drift.

## [1.0.0] - 2026-07-22

### Added

- First packaged desktop release: Windows portable `.exe` and Linux AppImage
  built by tag-triggered CI, wrapping the browser editor in Electron.

[Unreleased]: https://github.com/rebaserHEAD/grimp/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/rebaserHEAD/grimp/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/rebaserHEAD/grimp/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/rebaserHEAD/grimp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/rebaserHEAD/grimp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/rebaserHEAD/grimp/commits/v1.0.0
