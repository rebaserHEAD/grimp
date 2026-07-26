# Changelog

All notable changes to GRIMP are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Every PR that changes user-facing behavior adds a line under **Unreleased**.
At release time that section becomes the new version's entry, and the release
workflow copies it into the GitHub release notes.

## [Unreleased]

### Added

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

[Unreleased]: https://github.com/rebaserHEAD/grimp/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/rebaserHEAD/grimp/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/rebaserHEAD/grimp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/rebaserHEAD/grimp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/rebaserHEAD/grimp/commits/v1.0.0
