import yaml from 'js-yaml';
import { SS14_SCHEMA } from '../import/ss14Schema';
import type { ResourceProvider } from './resourceProvider';

/**
 * Index of the prototype types that point AT a map/grid file, so an open document
 * can be cross-referenced back to what the fork intends it to be.
 *
 * These types are dropped by `prototypeDiscovery` (it keeps only entity/tile/decal),
 * and they live outside the directories discovery walks, so this is a separate scan.
 *
 * The path fields are named identically across Frontier, Mono, and Triad, so one parser
 * covers every fork in the chain. Mono-only extras degrade to `undefined` elsewhere.
 *
 * A map file is routinely referenced by more than one prototype, and that overlap is the
 * useful signal rather than noise: in the Triad corpus 358 references resolve to 194
 * distinct files, because a purchasable ship commonly has both a `vessel` (shipyard
 * listing) and a `gameMap` (station config wrapper) pointing at it. Lookups therefore
 * return a list.
 */
export type ShipMetaKind = 'vessel' | 'gameMap' | 'pointOfInterest' | 'salvageMap';

/**
 * The path field each type uses to reference its map file.
 *
 * `salvageMap` is not in #3's original list but belongs here: it carries `mapPath` on 34
 * prototypes in the Triad corpus, and a salvage wreck is one of the things a grid document
 * can be meant to be. Verified against the corpus by counting the declaring type of every
 * mapPath/shuttlePath/gridPath line, which turns up exactly these four prototype types.
 * The other holders of those field names are entity COMPONENTS (LoadMapRule,
 * StationArrivals, StationPlanetSpawner), not prototypes, and are correctly not indexed:
 * they describe a game rule loading a map, not what the map is.
 */
const PATH_FIELD: Record<ShipMetaKind, string> = {
  vessel: 'shuttlePath',
  gameMap: 'mapPath',
  pointOfInterest: 'gridPath',
  salvageMap: 'mapPath',
};

const INDEXED_KINDS = Object.keys(PATH_FIELD) as ShipMetaKind[];

export interface ShipMetaEntry {
  /** Prototype id, e.g. `Adjutant`. */
  id: string;
  kind: ShipMetaKind;
  /** The path exactly as written in the prototype, e.g. `/Maps/_Triad/Shuttles/TDF/adjutant.yml`. */
  path: string;
  /** Prototype file this came from, for "go to definition" style surfacing. */
  sourceFile: string;
  /**
   * `vessel` only, and opt-OUT: the field is absent on most vessels and explicitly `false`
   * on the handful that are not for sale. Absent therefore means purchasable, which is why
   * this is `undefined` rather than defaulted to `false`. Use `isPurchasableVessel`.
   */
  purchasable?: boolean;
  /** `vessel` only (Mono). */
  cloakHunter?: boolean;
  /** `gameMap` only: the station ids declared under `stations:`, which key into BecomesStation. */
  stations?: string[];
}

export interface ShipMetaIndex {
  /** Every entry found, in scan order. */
  entries: ShipMetaEntry[];
  /** Entries keyed by normalized path. A map file can be referenced by more than one prototype. */
  byPath: Map<string, ShipMetaEntry[]>;
}

/**
 * Reduce a map path to a comparable key.
 *
 * Prototypes write engine resource paths (`/Maps/_Mono/Shuttles/archer.yml`) while a loaded
 * document knows its repo-relative path (`Resources/Maps/_Mono/Shuttles/archer.yml`), so the
 * leading slash and the `Resources/` prefix both have to come off before they will match.
 *
 * Case is folded because the path reaching us may have been round-tripped through a
 * case-insensitive filesystem. Two map files differing only in case would collide, which is a
 * fork bug rather than a case worth preserving here.
 */
export function normalizeResourcePath(path: string): string {
  let p = path.trim().replace(/\\/g, '/');
  p = p.replace(/^\/+/, '');
  p = p.replace(/^Resources\//i, '');
  return p.toLowerCase();
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** Pull the station ids out of a gameMap's `stations:` mapping. */
function readStations(value: unknown): string[] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const ids = Object.keys(value as Record<string, unknown>);
  return ids.length > 0 ? ids : undefined;
}

/**
 * Parse one prototype YAML file and return any vessel / gameMap / pointOfInterest entries.
 * Entries missing their path field are skipped: two of the vessels in the Triad corpus are
 * abstract bases with no `shuttlePath`, and they reference no file to cross-reference against.
 */
export function parseShipMetaYaml(yamlContent: string, filePath: string): ShipMetaEntry[] {
  let docs: unknown[];
  try {
    docs = yaml.loadAll(yamlContent, undefined, { schema: SS14_SCHEMA }) as unknown[];
  } catch {
    // A single malformed prototype file must not take the whole scan down.
    return [];
  }

  const found: ShipMetaEntry[] = [];
  for (const doc of docs) {
    if (!Array.isArray(doc)) continue;
    for (const entry of doc) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const kind = record.type as ShipMetaKind;
      if (!INDEXED_KINDS.includes(kind)) continue;
      if (typeof record.id !== 'string') continue;

      const path = record[PATH_FIELD[kind]];
      if (typeof path !== 'string' || path.trim() === '') continue;

      const meta: ShipMetaEntry = { id: record.id, kind, path, sourceFile: filePath };
      if (kind === 'vessel') {
        meta.purchasable = asBoolean(record.purchasable);
        meta.cloakHunter = asBoolean(record.cloakHunter);
      } else if (kind === 'gameMap') {
        meta.stations = readStations(record.stations);
      }
      found.push(meta);
    }
  }
  return found;
}

/** Build the lookup index from already-parsed entries. */
export function buildShipMetaIndex(entries: ShipMetaEntry[]): ShipMetaIndex {
  const byPath = new Map<string, ShipMetaEntry[]>();
  for (const entry of entries) {
    const key = normalizeResourcePath(entry.path);
    const existing = byPath.get(key);
    if (existing) existing.push(entry);
    else byPath.set(key, [entry]);
  }
  return { entries, byPath };
}

/**
 * Scan the fork's whole `Prototypes/` tree for the three referencing types.
 *
 * This is a second full pass over the prototype YAML, separate from `discoverPrototypes`,
 * because these types live outside the directories that walks (`Prototypes/Maps/`,
 * `Prototypes/<fork>/Shipyard/`, `Prototypes/<fork>/PointsOfInterest/`). Callers should
 * build it lazily and cache it rather than paying for it on every fork load.
 */
export async function scanShipMeta(
  provider: ResourceProvider,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ShipMetaIndex> {
  let files: string[];
  try {
    files = await provider.listFiles('Prototypes', '.yml');
  } catch {
    return buildShipMetaIndex([]);
  }

  const entries: ShipMetaEntry[] = [];
  let loaded = 0;
  for (const file of files) {
    try {
      const text = await provider.readText(file);
      entries.push(...parseShipMetaYaml(text, file));
    } catch {
      // Unreadable file, skip it: a partial index beats no index.
    }
    loaded++;
    onProgress?.(loaded, files.length);
  }
  return buildShipMetaIndex(entries);
}

/** Every prototype referencing the given map path. Empty when nothing points at it. */
export function lookupByPath(index: ShipMetaIndex, path: string): ShipMetaEntry[] {
  return index.byPath.get(normalizeResourcePath(path)) ?? [];
}

/**
 * Whether a vessel entry is for sale in the shipyard. `purchasable` is opt-out, so anything
 * that is not explicitly `false` is purchasable.
 */
export function isPurchasableVessel(entry: ShipMetaEntry): boolean {
  return entry.kind === 'vessel' && entry.purchasable !== false;
}
