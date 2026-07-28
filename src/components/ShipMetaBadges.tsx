import React from 'react';
import type { ShipMetaEntry } from '../loaders/shipMetaIndex';
import { isPurchasableVessel } from '../loaders/shipMetaIndex';

/**
 * Badges for what the fork intends the open document to be (#3), layered next
 * to the Map/Grid badge: one badge per prototype that references the file's
 * path. A purchasable ship typically shows two (vessel + gameMap wrapper),
 * and that overlap is the information, not a rendering accident.
 */
interface Props {
  hits: ShipMetaEntry[];
}

function badgeLabel(entry: ShipMetaEntry): string {
  switch (entry.kind) {
    case 'vessel':
      return `Ship: ${entry.id}`;
    case 'gameMap':
      return entry.stations && entry.stations.length > 0 ? `Station: ${entry.id}` : `GameMap: ${entry.id}`;
    case 'pointOfInterest':
      return `POI: ${entry.id}`;
    case 'salvageMap':
      return `Salvage: ${entry.id}`;
  }
}

function badgeTitle(entry: ShipMetaEntry): string {
  const source = `Defined in ${entry.sourceFile}`;
  switch (entry.kind) {
    case 'vessel':
      return isPurchasableVessel(entry)
        ? `Shipyard vessel ${entry.id}: purchasable.\n${source}`
        : `Shipyard vessel ${entry.id}: NOT purchasable (purchasable: false).\n${source}`;
    case 'gameMap':
      return entry.stations && entry.stations.length > 0
        ? `gameMap ${entry.id} wraps this file in station config (stations: ${entry.stations.join(', ')}).\n${source}`
        : `gameMap ${entry.id} loads this file with no station entries.\n${source}`;
    case 'pointOfInterest':
      return `Point of interest ${entry.id}: spawned as a world POI.\n${source}`;
    case 'salvageMap':
      return `Salvage wreck ${entry.id}: spawned by the salvage magnet.\n${source}`;
  }
}

export const ShipMetaBadges: React.FC<Props> = ({ hits }) => {
  if (hits.length === 0) return null;
  return (
    <>
      {hits.map((entry) => (
        <span
          key={`${entry.kind}:${entry.id}`}
          data-testid="ship-meta-badge"
          className="ml-1.5 text-[10px] uppercase tracking-wider text-accent border border-subtle rounded-sm px-1.5 py-0.5 select-none"
          title={badgeTitle(entry)}
        >
          {badgeLabel(entry)}
        </span>
      ))}
    </>
  );
};
