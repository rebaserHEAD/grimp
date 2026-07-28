import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShipMetaBadges } from '../ShipMetaBadges';
import type { ShipMetaEntry, StationProtoResolver } from '../../loaders/shipMetaIndex';

/**
 * Badge semantics for #3, matching how the fork chain actually wires ships:
 * a purchasable ship is vessel + gameMap wrapper, where the wrapper is the
 * station plumbing (not "a station map") and its stationProto decides
 * expedition capability via SalvageExpeditionData. Fixtures mirror real
 * corpus cases: Adjutant (security ship, no expeditions), Arkansaw
 * (expedition ship), Amber (actual station map).
 */
const VESSEL_ADJUTANT: ShipMetaEntry = {
  id: 'Adjutant',
  kind: 'vessel',
  path: '/Maps/_Triad/Shuttles/TDF/adjutant.yml',
  sourceFile: '/Prototypes/_Triad/Shipyard/TDF/adjutant.yml',
};

const WRAPPER_ADJUTANT: ShipMetaEntry = {
  id: 'Adjutant',
  kind: 'gameMap',
  path: '/Maps/_Triad/Shuttles/TDF/adjutant.yml',
  sourceFile: '/Prototypes/_Triad/Shipyard/TDF/adjutant.yml',
  stations: ['Adjutant'],
  stationProtos: ['StandardFrontierSecurityVessel'],
  stationComponents: ['StationNameSetup', 'StationJobs'],
};

const VESSEL_ARKANSAW: ShipMetaEntry = {
  id: 'Arkansaw',
  kind: 'vessel',
  path: '/Maps/_Mono/Shuttles/Expedition/arkansaw.yml',
  sourceFile: '/Prototypes/_Mono/Shipyard/Expedition/arkansaw.yml',
};

const WRAPPER_ARKANSAW: ShipMetaEntry = {
  id: 'Arkansaw',
  kind: 'gameMap',
  path: '/Maps/_Mono/Shuttles/Expedition/arkansaw.yml',
  sourceFile: '/Prototypes/_Mono/Shipyard/Expedition/arkansaw.yml',
  stations: ['Arkansaw'],
  stationProtos: ['StandardFrontierExpeditionVessel'],
  stationComponents: ['StationNameSetup', 'StationJobs'],
};

const STATION_AMBER: ShipMetaEntry = {
  id: 'Amber',
  kind: 'gameMap',
  path: '/Maps/amber.yml',
  sourceFile: '/Prototypes/Maps/amber.yml',
  stations: ['Amber'],
  stationProtos: ['StandardNanotrasenStation'],
};

/** Registry knowing exactly the two station protos the fixtures use. */
const REGISTRY: StationProtoResolver = {
  getEntity: (id) => {
    if (id === 'StandardFrontierExpeditionVessel') {
      return { components: [{ type: 'StationData' }, { type: 'SalvageExpeditionData' }] };
    }
    if (id === 'StandardFrontierSecurityVessel' || id === 'StandardNanotrasenStation') {
      return { components: [{ type: 'StationData' }] };
    }
    return null;
  },
};

describe('ShipMetaBadges', () => {
  it('renders nothing for an unreferenced file', () => {
    const { container } = render(<ShipMetaBadges hits={[]} registry={REGISTRY} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows only a Ship badge for a non-expedition ship: the wrapper is plumbing, not a station', () => {
    render(<ShipMetaBadges hits={[VESSEL_ADJUTANT, WRAPPER_ADJUTANT]} registry={REGISTRY} />);
    expect(screen.getAllByTestId('ship-meta-badge')).toHaveLength(1);
    expect(screen.getByText('Ship: Adjutant')).toBeTruthy();
    expect(screen.queryByText(/^Station:/)).toBeNull();
    expect(screen.queryByText('Expedition')).toBeNull();
  });

  it('folds the wrapper station config into the Ship tooltip', () => {
    render(<ShipMetaBadges hits={[VESSEL_ADJUTANT, WRAPPER_ADJUTANT]} registry={REGISTRY} />);
    const title = screen.getByText('Ship: Adjutant').getAttribute('title');
    expect(title).toMatch(/Station config via gameMap Adjutant/);
    expect(title).toMatch(/StandardFrontierSecurityVessel/);
  });

  it('adds an Expedition badge when the stationProto carries SalvageExpeditionData', () => {
    render(<ShipMetaBadges hits={[VESSEL_ARKANSAW, WRAPPER_ARKANSAW]} registry={REGISTRY} />);
    expect(screen.getByText('Ship: Arkansaw')).toBeTruthy();
    const expedition = screen.getByText('Expedition');
    expect(expedition.getAttribute('title')).toMatch(/SalvageExpeditionData/);
    expect(expedition.getAttribute('title')).toMatch(/StandardFrontierExpeditionVessel/);
    expect(screen.queryByText(/^Station:/)).toBeNull();
  });

  it('detects expeditions from inline station components without a registry', () => {
    const inline: ShipMetaEntry = {
      ...WRAPPER_ADJUTANT,
      stationComponents: ['SalvageExpeditionData'],
    };
    render(<ShipMetaBadges hits={[VESSEL_ADJUTANT, inline]} />);
    expect(screen.getByText('Expedition')).toBeTruthy();
  });

  it('shows no Expedition badge while the registry is still unavailable', () => {
    // stationProto-based capability cannot be resolved without the registry;
    // under-reporting beats a wrong badge.
    render(<ShipMetaBadges hits={[VESSEL_ARKANSAW, WRAPPER_ARKANSAW]} />);
    expect(screen.queryByText('Expedition')).toBeNull();
  });

  it('keeps the Station badge for standalone gameMaps: real station maps', () => {
    render(<ShipMetaBadges hits={[STATION_AMBER]} registry={REGISTRY} />);
    const badge = screen.getByText('Station: Amber');
    expect(badge.getAttribute('title')).toMatch(/stations: Amber/);
  });

  it('labels a stationless standalone gameMap as GameMap', () => {
    const bare: ShipMetaEntry = {
      id: 'MeteorArena',
      kind: 'gameMap',
      path: '/Maps/Nonstations/meteor-arena.yml',
      sourceFile: '/Prototypes/Maps/arenas.yml',
    };
    render(<ShipMetaBadges hits={[bare]} registry={REGISTRY} />);
    expect(screen.getByText('GameMap: MeteorArena')).toBeTruthy();
  });

  it('marks purchasability on the Ship badge, calling out the opt-out explicitly', () => {
    render(
      <ShipMetaBadges hits={[{ ...VESSEL_ADJUTANT, purchasable: false }, WRAPPER_ADJUTANT]} registry={REGISTRY} />,
    );
    expect(screen.getByText('Ship: Adjutant').getAttribute('title')).toMatch(/NOT purchasable/);
  });

  it('labels POIs and salvage wrecks', () => {
    const poi: ShipMetaEntry = {
      id: 'AnomalousLab',
      kind: 'pointOfInterest',
      path: '/Maps/_Mono/POI/anomalouslab.yml',
      sourceFile: '/Prototypes/_Mono/PointsOfInterest/anomalouslab.yml',
    };
    const salvage: ShipMetaEntry = {
      id: 'Wreck1',
      kind: 'salvageMap',
      path: '/Maps/Salvage/small-1.yml',
      sourceFile: '/Prototypes/Salvage/wrecks.yml',
    };
    render(<ShipMetaBadges hits={[poi, salvage]} registry={REGISTRY} />);
    expect(screen.getByText('POI: AnomalousLab')).toBeTruthy();
    expect(screen.getByText('Salvage: Wreck1')).toBeTruthy();
  });
});
