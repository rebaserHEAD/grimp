# GRIMP

**GRIMP** (Generally Reliable Interactive Mapping Program) is a map editor for
[Space Station 14](https://github.com/space-wizards/space-station-14).
Build and edit maps and ship grids with a fast, GUI-driven workflow inspired by tools like Photoshop: without launching the game.

GRIMP is a fork of [space-station-14-map-editor](https://github.com/SuspensionPoint/space-station-14-map-editor)
by **SuspensionPoint**. The rendering pipeline, tools, and the large majority of the
editor core are their work, and this project would not exist without it. GRIMP builds
on that foundation in a different direction: a natively maintained desktop app
(Electron), byte-exact export parity with the game serializer, grid documents, and
mapper-workflow features driven by fork maintainer feedback.

The editor does not hardcode any game content. It discovers tiles, entity prototypes,
sprites, and decals at runtime by parsing your fork's prototype YAML and RSI sprite
sheets, so it always reflects the current state of the content it is pointed at.

> **Note on game content:** This repository contains only the editor. It ships with
> **no** Space Station 14 game assets (prototypes, textures, sprites). You supply those
> from your own SS14 fork: see [Where it lives](#where-it-lives) below.

## Direction

GRIMP started as a browser-based map viewer/editor and is growing into a **maintained
desktop application for authoring SS14 maps and ship grids**. The rendering core it
inherited is excellent; the work going in now is about the mapper's real workflow:
creating grid files from scratch, preparing ships for the shipyard, and matching what
fork maintainers actually ask for in review. It still runs in the browser, but the
desktop build (native menus, real file dialogs, local fork loading) is the primary target.

## Features

### Authoring maps and ship grids

- **Document kinds that match the game**: **New Map** and **New Grid** produce exactly
  what the engine's `savemap` / `savegrid` write, format and structure identical. A
  Map / Grid badge shows which kind you're editing. Grid files authored from scratch
  load in-game through the engine's own grid loader (verified against `MapLoaderSystem`).
- **Map Properties**: the file-side view you'd otherwise VV in-game. Edit the grid's
  identity (name/description) and toggle ship switches: `Shuttle` (required by the
  shipyard), `IFF`, `Roof`, and `BecomesStation` with a station id. Detects and cleans
  up map-entity contamination on grids saved as maps. Edits to imported files preserve
  byte-for-byte parity on every untouched line.

### Editing

- **Accurate rendering**: tiles, entities, and infrastructure render the same way they
  appear in-game: RSI sprite sheets, multi-layer compositing, DrawDepth sorting,
  rotation/direction handling, color tinting, IconSmooth (walls/windows/tables/carpets/
  puddles), and cable/pipe connection visualization.
- **Tile tools**: Paint, Erase, Fill, Rectangle, Line, Circle, and rectangular Select
  with copy/cut/paste/delete.
- **Entity editing**: browse a searchable, categorized palette; place with a ghost
  preview; select, move, rotate, scale, free-place, and bulk-edit; per-entity sprite-state
  override; component property editor with device linking.
- **Infrastructure drawing**: lay HV/MV/APC cables and supply/return/disposal pipes with
  automatic fitting (straight/bend/T-junction/fourway) and neighbor refitting.
- **Decals**: paint, pick, and edit decals with color.
- **Prefabs**: save a selected region as a reusable `.prefab.json` and stamp it elsewhere.
- **Import/Export**: load existing SS14 `.yml` maps and export valid YAML that loads
  back in-game, preserving entities round-trip.
- **Multi-grid** support, undo/redo, layer visibility toggles (including an Atmos Markers
  toggle for the VAC. marker carpet on hulls), T-Ray (subfloor) mode, and lighting preview.

### Running it

- **Desktop app** (primary): native menus, native open/save dialogs, and local fork
  loading. Packaged as a Windows portable `.exe` and a Linux `.AppImage`.
- **Browser**: pick your fork folder (File System Access API, with an upload fallback for
  Firefox/Safari) or deploy a build with pre-bundled resources.
- All file processing happens locally; nothing is uploaded.

## Where it lives

The editor is designed to sit in the `Tools/` directory of a Space Station 14 fork:

```
<your-ss14-fork>/
  Resources/            # the fork's game content (prototypes + textures)
  Tools/
    grimp/                              # <- this repository
```

Both the dev server and the resource pre-baker resolve the game content at
`../../Resources` relative to the project root, which is exactly your fork's
`Resources/` folder when the editor lives at `<fork>/Tools/grimp/`. You can clone
it anywhere, but this layout makes the dev server "just work" against live content.

## Getting started (development)

Requirements: [Node.js](https://nodejs.org/) 18+ and npm.

```bash
# from <your-ss14-fork>/Tools/
git clone <this-repo-url> grimp
cd grimp
npm install
npm run dev
```

Open the URL shown in the terminal (e.g. `http://localhost:5174`). On the landing
screen, either:

- **Open Fork Folder**: pick any SS14 fork's root directory; the editor scans its
  `Resources/` folder, or
- **Use Built-in Resources**: only available when the app was built with pre-baked
  resources (see below).

During development the Vite dev server also serves the fork's content live from
`../../Resources`, so the built-in option works without a pre-bake step.

### Desktop build

The desktop app is the primary target. To run it against the live dev server:

```bash
npm run electron:dev
```

To produce distributable binaries:

```bash
npm run package        # Windows portable .exe (release/)
```

Tagged releases (`v*`) build the Windows `.exe` and Linux `.AppImage` via GitHub Actions
and assemble them into a **draft** release for review before publishing. See
[`.github/workflows/release.yml`](.github/workflows/release.yml).

## Pre-baking resources for deployment

A static/hosted build cannot read your local filesystem, so for deployment you bake a
copy of the needed game content into `public/resources/`:

```bash
npm run prebuild-resources                 # minimal texture set (~27 MB)
npm run prebuild-resources -- --textures=full   # all textures (~150 MB)
npm run prebuild-resources -- --textures=none   # prototypes only, no textures (~8 MB)
```

This reads `../../Resources`, generates prototype manifests, and copies the selected
content into `public/resources/` (git-ignored). The convenience scripts
`npm run build:deploy`, `build:deploy-minimal`, and `build:deploy-full` run the
pre-bake and the production build together.

The label shown for the built-in resources on the landing screen is auto-detected: if
the host repo has exactly one fork directory under `Prototypes/` (e.g. `_MyFork`) it is
used (`MyFork`); base Space Station 14 falls back to `Built-in`. Override it explicitly
with `npm run prebuild-resources -- --fork-name="My Fork"`.

## Deploying to Vercel

This repo includes `vercel.example.json` with a working SPA + cache configuration.

1. Copy it: `cp vercel.example.json vercel.json`
2. Pre-bake the resources you want shipped, e.g. `npm run prebuild-resources -- --textures=minimal`
3. Deploy with the [Vercel CLI](https://vercel.com/docs/cli) (`vercel`) or by importing
   the repo in the Vercel dashboard. The build command (`npm run build`) and output
   directory (`dist`) are already set in the config.

The same static `dist/` output can be hosted on any static host (Netlify, GitHub Pages,
Cloudflare Pages, plain nginx): Vercel is just one option.

> Analytics are intentionally not included. To add [Vercel Analytics](https://vercel.com/docs/analytics),
> install `@vercel/analytics` and render `<Analytics />` in `src/main.tsx`.

## Project structure

```
grimp/
  docs/                 # system & architecture documentation
  public/
    images/             # editor UI images (favicon, backgrounds)
    prefabs/            # example prefab(s)
    resources/          # pre-baked game content (generated; git-ignored)
  scripts/
    prebuild-resources.mjs   # bakes Resources/ into public/resources/
  src/
    components/         # React UI components
    rendering/          # canvas rendering systems
    state/              # editor state, reducer, command pattern, undo/redo
    tools/              # editing tools (paint, place, link, ...)
    prefab/             # prefab save/load/place
    loaders/            # game-data discovery & loading
    import/  export/    # map YAML import/export
  index.html
  vite.config.ts
```

See [`docs/`](docs/) for a full feature/architecture tour.

## Tech stack

React 18 · TypeScript · Vite · Canvas 2D rendering · js-yaml · Tailwind CSS.

## License

This editor is released under the [MIT License](LICENSE).

Space Station 14 game content (prototypes, sprites, textures) is **not** included in this
repository and is governed by the licenses in the
[space-station-14 repository](https://github.com/space-wizards/space-station-14): its
code is MIT-licensed and most assets are CC-BY-SA 3.0. When you pre-bake and redistribute
a build that bundles content from a fork, you are responsible for complying with that
content's licenses and attribution requirements.

## Acknowledgements

- **[SuspensionPoint](https://github.com/SuspensionPoint)**: original author of
  [space-station-14-map-editor](https://github.com/SuspensionPoint/space-station-14-map-editor),
  the codebase this fork is built on. The MIT license and copyright notice are theirs.
- Built for the [Space Station 14](https://spacestation14.com/) community and the many
  community forks that extend it.
