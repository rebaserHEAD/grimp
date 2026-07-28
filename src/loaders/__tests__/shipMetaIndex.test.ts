import { describe, it, expect } from 'vitest';
import {
  parseShipMetaYaml,
  buildShipMetaIndex,
  normalizeResourcePath,
  lookupByPath,
  isPurchasableVessel,
  isExpeditionCapable,
  scanShipMeta,
  toResourceRelativePath,
  type ShipMetaEntry,
} from '../shipMetaIndex';
import type { ResourceProvider } from '../resourceProvider';

// Shapes copied from the Triad corpus so the fixtures match what forks actually write.
const VESSEL_YAML = `
- type: vessel
  id: Adjutant
  name: TDF Adjutant
  shuttlePath: /Maps/_Triad/Shuttles/TDF/adjutant.yml
  price: 40000
`;

const UNPURCHASABLE_VESSEL_YAML = `
- type: vessel
  id: Ravager
  shuttlePath: /Maps/_Triad/Shuttles/TDF/ravager.yml
  purchasable: false
  cloakHunter: true
`;

const GAMEMAP_YAML = `
- type: gameMap
  id: Amber
  mapName: Amber
  mapPath: /Maps/amber.yml
  stations:
    Amber:
      stationProto: StandardNanotrasenStation
    AmberSecondary:
      stationProto: StandardNanotrasenStation
`;

const POI_YAML = `
- type: pointOfInterest
  id: AnomalousLab
  gridPath: /Maps/_Mono/POI/anomalouslab.yml
`;

// salvageMap reuses gameMap's field name, so the kind has to come from `type:`, not the field.
const SALVAGE_YAML = `
- type: salvageMap
  id: Wreck1
  mapPath: /Maps/Salvage/small-1.yml
`;

describe('normalizeResourcePath', () => {
  it('strips the leading slash the prototypes write', () => {
    expect(normalizeResourcePath('/Maps/amber.yml')).toBe('maps/amber.yml');
  });

  it('strips the Resources/ prefix a loaded document carries', () => {
    expect(normalizeResourcePath('Resources/Maps/amber.yml')).toBe('maps/amber.yml');
  });

  it('makes the two spellings of the same file compare equal', () => {
    expect(normalizeResourcePath('/Maps/_Triad/Shuttles/TDF/adjutant.yml')).toBe(
      normalizeResourcePath('Resources/Maps/_Triad/Shuttles/TDF/adjutant.yml'),
    );
  });

  it('normalizes Windows separators', () => {
    expect(normalizeResourcePath('Resources\\Maps\\_Triad\\adjutant.yml')).toBe('maps/_triad/adjutant.yml');
  });

  it('folds case', () => {
    expect(normalizeResourcePath('/Maps/Amber.yml')).toBe(normalizeResourcePath('/maps/amber.yml'));
  });
});

describe('toResourceRelativePath', () => {
  it('derives the resource path from a fork root pick', () => {
    expect(toResourceRelativePath('C:\\src\\Triad_Sector', 'C:\\src\\Triad_Sector\\Resources\\Maps\\amber.yml')).toBe(
      'Maps/amber.yml',
    );
  });

  it('derives the same path when the user picked Resources/ directly', () => {
    // main.cjs loadForkFromDir accepts either, and the renderer persists what was picked.
    expect(
      toResourceRelativePath('C:\\src\\Triad_Sector\\Resources', 'C:\\src\\Triad_Sector\\Resources\\Maps\\amber.yml'),
    ).toBe('Maps/amber.yml');
  });

  it('handles posix paths', () => {
    expect(toResourceRelativePath('/home/j/fork', '/home/j/fork/Resources/Maps/_Triad/adjutant.yml')).toBe(
      'Maps/_Triad/adjutant.yml',
    );
  });

  it('preserves case for display while staying findable in the index', () => {
    const rel = toResourceRelativePath('/fork', '/fork/Resources/Maps/_Triad/Shuttles/TDF/adjutant.yml');
    expect(rel).toBe('Maps/_Triad/Shuttles/TDF/adjutant.yml');
    const index = buildShipMetaIndex(parseShipMetaYaml(VESSEL_YAML, 'a.yml'));
    expect(lookupByPath(index, rel!)[0].id).toBe('Adjutant');
  });

  it('tolerates a trailing separator on the fork dir', () => {
    expect(toResourceRelativePath('/fork/', '/fork/Resources/Maps/amber.yml')).toBe('Maps/amber.yml');
  });

  it('ignores case differences between the fork dir and the file path', () => {
    expect(toResourceRelativePath('c:/src/fork', 'C:/SRC/Fork/Resources/Maps/amber.yml')).toBe('Maps/amber.yml');
  });

  it('returns null for a file outside the fork', () => {
    expect(toResourceRelativePath('/fork', '/somewhere/else/Maps/amber.yml')).toBeNull();
  });

  it('does not treat a sibling directory sharing a prefix as inside the fork', () => {
    expect(toResourceRelativePath('/src/fork', '/src/fork-backup/Resources/Maps/amber.yml')).toBeNull();
  });

  it('returns null when there is no fork loaded, as in the browser build', () => {
    expect(toResourceRelativePath(null, '/fork/Resources/Maps/amber.yml')).toBeNull();
    expect(toResourceRelativePath('/fork', null)).toBeNull();
  });
});

describe('parseShipMetaYaml', () => {
  it('reads a vessel and its shuttlePath', () => {
    const [entry] = parseShipMetaYaml(VESSEL_YAML, '/Prototypes/_Triad/Shipyard/TDF/adjutant.yml');
    expect(entry).toMatchObject({
      id: 'Adjutant',
      kind: 'vessel',
      path: '/Maps/_Triad/Shuttles/TDF/adjutant.yml',
      sourceFile: '/Prototypes/_Triad/Shipyard/TDF/adjutant.yml',
    });
  });

  it('leaves purchasable undefined when the vessel does not declare it', () => {
    const [entry] = parseShipMetaYaml(VESSEL_YAML, 'f.yml');
    expect(entry.purchasable).toBeUndefined();
  });

  it('records an explicit purchasable: false and the Mono-only cloakHunter', () => {
    const [entry] = parseShipMetaYaml(UNPURCHASABLE_VESSEL_YAML, 'f.yml');
    expect(entry.purchasable).toBe(false);
    expect(entry.cloakHunter).toBe(true);
  });

  it('reads a gameMap and the station ids under stations:', () => {
    const [entry] = parseShipMetaYaml(GAMEMAP_YAML, 'f.yml');
    expect(entry).toMatchObject({ id: 'Amber', kind: 'gameMap', path: '/Maps/amber.yml' });
    expect(entry.stations).toEqual(['Amber', 'AmberSecondary']);
  });

  it('captures stationProtos and inline component types: the expedition switch lives there', () => {
    const shipWrapper = `
- type: gameMap
  id: Arkansaw
  mapPath: /Maps/_Mono/Shuttles/Expedition/arkansaw.yml
  stations:
    Arkansaw:
      stationProto: StandardFrontierExpeditionVessel
      components:
        - type: StationNameSetup
          mapNameTemplate: 'Arkansaw EXP{1}'
        - type: StationJobs
          availableJobs:
            Contractor: [ 0, 0 ]
`;
    const [entry] = parseShipMetaYaml(shipWrapper, 'f.yml');
    expect(entry.stationProtos).toEqual(['StandardFrontierExpeditionVessel']);
    expect(entry.stationComponents).toEqual(['StationNameSetup', 'StationJobs']);
  });

  it('reads a pointOfInterest and its gridPath', () => {
    const [entry] = parseShipMetaYaml(POI_YAML, 'f.yml');
    expect(entry).toMatchObject({
      id: 'AnomalousLab',
      kind: 'pointOfInterest',
      path: '/Maps/_Mono/POI/anomalouslab.yml',
    });
  });

  it('reads a salvageMap, which shares gameMap mapPath field name', () => {
    const [entry] = parseShipMetaYaml(SALVAGE_YAML, 'f.yml');
    expect(entry).toMatchObject({ id: 'Wreck1', kind: 'salvageMap', path: '/Maps/Salvage/small-1.yml' });
  });

  it('distinguishes salvageMap from gameMap despite the shared field', () => {
    const both = `${GAMEMAP_YAML}${SALVAGE_YAML}`;
    const kinds = parseShipMetaYaml(both, 'f.yml').map((e) => e.kind);
    expect(kinds).toEqual(['gameMap', 'salvageMap']);
  });

  it('ignores mapPath carried by entity components rather than prototypes', () => {
    // LoadMapRule / StationArrivals / StationPlanetSpawner declare mapPath inside an
    // entity's components. Those describe a rule loading a map, not what a map IS.
    const ruleEntity = `
- type: entity
  id: LoadSalvageRule
  components:
    - type: LoadMapRule
      mapPath: /Maps/Salvage/rule-loaded.yml
`;
    expect(parseShipMetaYaml(ruleEntity, 'f.yml')).toEqual([]);
  });

  it('skips a vessel with no shuttlePath: the abstract bases reference no file', () => {
    const abstractBase = `
- type: vessel
  id: BaseVessel
  abstract: true
  price: 0
`;
    expect(parseShipMetaYaml(abstractBase, 'f.yml')).toEqual([]);
  });

  it('ignores entity and tile prototypes sharing the file', () => {
    const mixed = `
- type: entity
  id: SomeWall
- type: tile
  id: FloorSteel
${VESSEL_YAML}`;
    const entries = parseShipMetaYaml(mixed, 'f.yml');
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('Adjutant');
  });

  it('returns nothing rather than throwing on malformed YAML', () => {
    expect(parseShipMetaYaml('- type: vessel\n  id: [unclosed', 'f.yml')).toEqual([]);
  });

  it('skips entries with no id', () => {
    expect(parseShipMetaYaml('- type: vessel\n  shuttlePath: /Maps/x.yml', 'f.yml')).toEqual([]);
  });
});

describe('buildShipMetaIndex / lookupByPath', () => {
  const entries = [
    ...parseShipMetaYaml(VESSEL_YAML, 'a.yml'),
    ...parseShipMetaYaml(GAMEMAP_YAML, 'b.yml'),
    ...parseShipMetaYaml(POI_YAML, 'c.yml'),
  ];

  it('finds a vessel by the repo-relative path a loaded document would carry', () => {
    const index = buildShipMetaIndex(entries);
    const hits = lookupByPath(index, 'Resources/Maps/_Triad/Shuttles/TDF/adjutant.yml');
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('Adjutant');
  });

  it('finds a gameMap by the engine-style path the prototype wrote', () => {
    const index = buildShipMetaIndex(entries);
    expect(lookupByPath(index, '/Maps/amber.yml')[0].id).toBe('Amber');
  });

  it('returns every prototype pointing at the same file', () => {
    const sharedPath = `
- type: gameMap
  id: WrapperStation
  mapPath: /Maps/shared.yml
- type: pointOfInterest
  id: SharedPoi
  gridPath: /Maps/shared.yml
`;
    const index = buildShipMetaIndex(parseShipMetaYaml(sharedPath, 'f.yml'));
    const hits = lookupByPath(index, '/Maps/shared.yml');
    expect(hits.map((h) => h.kind).sort()).toEqual(['gameMap', 'pointOfInterest']);
  });

  it('returns empty for a file nothing references', () => {
    const index = buildShipMetaIndex(entries);
    expect(lookupByPath(index, '/Maps/_Triad/Shuttles/unreferenced.yml')).toEqual([]);
  });
});

describe('isExpeditionCapable', () => {
  const REGISTRY = {
    getEntity: (id: string) =>
      id === 'StandardFrontierExpeditionVessel'
        ? { components: [{ type: 'StationData' }, { type: 'SalvageExpeditionData' }] }
        : id === 'StandardFrontierSecurityVessel'
          ? { components: [{ type: 'StationData' }] }
          : null,
  };

  const wrapper = (stationProtos: string[], stationComponents: string[] = []): ShipMetaEntry => ({
    id: 'X',
    kind: 'gameMap',
    path: '/Maps/x.yml',
    sourceFile: 'f.yml',
    stations: ['X'],
    stationProtos,
    stationComponents,
  });

  it('is true when the stationProto resolves to SalvageExpeditionData', () => {
    expect(isExpeditionCapable(wrapper(['StandardFrontierExpeditionVessel']), REGISTRY)).toBe(true);
  });

  it('is false for a plain ship stationProto', () => {
    expect(isExpeditionCapable(wrapper(['StandardFrontierSecurityVessel']), REGISTRY)).toBe(false);
  });

  it('is true from inline components even without a registry', () => {
    expect(isExpeditionCapable(wrapper([], ['SalvageExpeditionData']), null)).toBe(true);
  });

  it('under-reports rather than guesses when the registry is missing', () => {
    expect(isExpeditionCapable(wrapper(['StandardFrontierExpeditionVessel']), null)).toBe(false);
  });

  it('is false for non-gameMap kinds', () => {
    const vessel: ShipMetaEntry = { id: 'X', kind: 'vessel', path: '/Maps/x.yml', sourceFile: 'f.yml' };
    expect(isExpeditionCapable(vessel, REGISTRY)).toBe(false);
  });
});

describe('isPurchasableVessel', () => {
  it('treats an absent purchasable as for sale, since the field is opt-out', () => {
    const [entry] = parseShipMetaYaml(VESSEL_YAML, 'f.yml');
    expect(isPurchasableVessel(entry)).toBe(true);
  });

  it('honours an explicit purchasable: false', () => {
    const [entry] = parseShipMetaYaml(UNPURCHASABLE_VESSEL_YAML, 'f.yml');
    expect(isPurchasableVessel(entry)).toBe(false);
  });

  it('is false for non-vessel kinds regardless of the flag', () => {
    const [gameMap] = parseShipMetaYaml(GAMEMAP_YAML, 'f.yml');
    expect(isPurchasableVessel(gameMap)).toBe(false);
  });
});

describe('scanShipMeta', () => {
  function fakeProvider(files: Record<string, string>): ResourceProvider {
    return {
      listFiles: async () => Object.keys(files),
      readText: async (path: string) => {
        const text = files[path];
        if (text === undefined) throw new Error(`missing ${path}`);
        return text;
      },
      getImageUrl: () => '',
      forkName: 'TestFork',
      dispose: () => {},
    };
  }

  it('indexes every referencing prototype across the tree', async () => {
    const index = await scanShipMeta(
      fakeProvider({
        '/Prototypes/_Triad/Shipyard/TDF/adjutant.yml': VESSEL_YAML,
        '/Prototypes/Maps/amber.yml': GAMEMAP_YAML,
        '/Prototypes/_Mono/PointsOfInterest/anomalouslab.yml': POI_YAML,
      }),
    );
    expect(index.entries).toHaveLength(3);
    expect(lookupByPath(index, '/Maps/amber.yml')[0].id).toBe('Amber');
  });

  it('reports progress per file', async () => {
    const seen: number[] = [];
    await scanShipMeta(fakeProvider({ 'a.yml': VESSEL_YAML, 'b.yml': GAMEMAP_YAML }), (loaded) => seen.push(loaded));
    expect(seen).toEqual([1, 2]);
  });

  it('keeps going when one file is unreadable', async () => {
    const provider = fakeProvider({ 'good.yml': VESSEL_YAML });
    const withGhost: ResourceProvider = { ...provider, listFiles: async () => ['ghost.yml', 'good.yml'] };
    const index = await scanShipMeta(withGhost);
    expect(index.entries.map((e: ShipMetaEntry) => e.id)).toEqual(['Adjutant']);
  });

  it('returns an empty index when the provider cannot list the tree', async () => {
    const provider: ResourceProvider = {
      ...fakeProvider({}),
      listFiles: async () => {
        throw new Error('no such directory');
      },
    };
    const index = await scanShipMeta(provider);
    expect(index.entries).toEqual([]);
    expect(lookupByPath(index, '/Maps/amber.yml')).toEqual([]);
  });
});
