import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShipMetaBadges } from '../ShipMetaBadges';
import type { ShipMetaEntry } from '../../loaders/shipMetaIndex';

/**
 * Badge rendering for #3: one badge per referencing prototype, with the
 * purchasable / station-config semantics surfaced in the tooltip. Fixture
 * shapes mirror the Triad corpus (adjutant + spyglass are real cases).
 */
const VESSEL: ShipMetaEntry = {
  id: 'Adjutant',
  kind: 'vessel',
  path: '/Maps/_Triad/Shuttles/TDF/adjutant.yml',
  sourceFile: '/Prototypes/_Triad/Shipyard/TDF/adjutant.yml',
};

const UNPURCHASABLE: ShipMetaEntry = {
  id: 'Ravager',
  kind: 'vessel',
  path: '/Maps/_Triad/Shuttles/TDF/ravager.yml',
  sourceFile: '/Prototypes/_Triad/Shipyard/TDF/ravager.yml',
  purchasable: false,
};

const STATION_MAP: ShipMetaEntry = {
  id: 'Amber',
  kind: 'gameMap',
  path: '/Maps/amber.yml',
  sourceFile: '/Prototypes/Maps/amber.yml',
  stations: ['Amber'],
};

const BARE_GAMEMAP: ShipMetaEntry = {
  id: 'MeteorArena',
  kind: 'gameMap',
  path: '/Maps/Nonstations/meteor-arena.yml',
  sourceFile: '/Prototypes/Maps/arenas.yml',
};

const POI: ShipMetaEntry = {
  id: 'AnomalousLab',
  kind: 'pointOfInterest',
  path: '/Maps/_Mono/POI/anomalouslab.yml',
  sourceFile: '/Prototypes/_Mono/PointsOfInterest/anomalouslab.yml',
};

const SALVAGE: ShipMetaEntry = {
  id: 'Wreck1',
  kind: 'salvageMap',
  path: '/Maps/Salvage/small-1.yml',
  sourceFile: '/Prototypes/Salvage/wrecks.yml',
};

describe('ShipMetaBadges', () => {
  it('renders nothing for an unreferenced file', () => {
    const { container } = render(<ShipMetaBadges hits={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('labels a vessel as a ship and marks it purchasable in the tooltip', () => {
    render(<ShipMetaBadges hits={[VESSEL]} />);
    const badge = screen.getByText('Ship: Adjutant');
    expect(badge.getAttribute('title')).toMatch(/purchasable/i);
    expect(badge.getAttribute('title')).toMatch(/adjutant\.yml/);
  });

  it('calls out purchasable: false, since absent means for sale', () => {
    render(<ShipMetaBadges hits={[UNPURCHASABLE]} />);
    expect(screen.getByText('Ship: Ravager').getAttribute('title')).toMatch(/NOT purchasable/);
  });

  it('labels a gameMap with stations as a Station and lists the station ids', () => {
    render(<ShipMetaBadges hits={[STATION_MAP]} />);
    const badge = screen.getByText('Station: Amber');
    expect(badge.getAttribute('title')).toMatch(/stations: Amber/);
  });

  it('labels a stationless gameMap as GameMap, not Station', () => {
    render(<ShipMetaBadges hits={[BARE_GAMEMAP]} />);
    expect(screen.getByText('GameMap: MeteorArena')).toBeTruthy();
    expect(screen.queryByText(/^Station:/)).toBeNull();
  });

  it('labels POIs and salvage wrecks', () => {
    render(<ShipMetaBadges hits={[POI, SALVAGE]} />);
    expect(screen.getByText('POI: AnomalousLab')).toBeTruthy();
    expect(screen.getByText('Salvage: Wreck1')).toBeTruthy();
  });

  it('renders one badge per referencing prototype: the vessel+gameMap overlap is the payload', () => {
    // spyglass.yml in the Triad corpus is referenced by both a vessel and a
    // gameMap in the same prototype file; both facts must be visible.
    render(<ShipMetaBadges hits={[VESSEL, STATION_MAP]} />);
    expect(screen.getAllByTestId('ship-meta-badge')).toHaveLength(2);
    expect(screen.getByText('Ship: Adjutant')).toBeTruthy();
    expect(screen.getByText('Station: Amber')).toBeTruthy();
  });
});
