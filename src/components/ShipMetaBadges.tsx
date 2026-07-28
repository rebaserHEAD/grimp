import React from 'react';
import type { ShipMetaEntry, StationProtoResolver } from '../loaders/shipMetaIndex';
import { isPurchasableVessel, isExpeditionCapable } from '../loaders/shipMetaIndex';

/**
 * Badges for what the fork intends the open document to be (#3), layered next
 * to the Map/Grid badge.
 *
 * Semantics, grounded in how the fork chain actually wires ships: nearly every
 * purchasable vessel ALSO has a gameMap wrapper, because that wrapper is what
 * turns a bought ship into a station entity (StationData/Jobs/Spawning). It is
 * plumbing, not "this file is a station map", so for vessel+gameMap pairs the
 * wrapper does NOT get its own Station badge. What it does decide is the
 * mechanics switch worth surfacing: whether the stationProto carries
 * SalvageExpeditionData, i.e. whether this ship can run expeditions. Standalone
 * gameMaps (real maps like Amber) keep the Station/GameMap badge.
 */
interface Props {
  hits: ShipMetaEntry[];
  /** Resolves stationProto ids to composed components (expedition detection). */
  registry?: StationProtoResolver | null;
}

export const ShipMetaBadges: React.FC<Props> = ({ hits, registry }) => {
  if (hits.length === 0) return null;

  const hasVessel = hits.some((h) => h.kind === 'vessel');
  const badges: { key: string; label: string; title: string }[] = [];

  for (const entry of hits) {
    const source = `Defined in ${entry.sourceFile}`;
    switch (entry.kind) {
      case 'vessel': {
        // The wrapper's station config is folded into the ship tooltip rather
        // than shown as a misleading Station badge.
        const wrapper = hits.find((h) => h.kind === 'gameMap');
        const stationNote = wrapper
          ? `Station config via gameMap ${wrapper.id} (stationProto: ${(wrapper.stationProtos ?? []).join(', ') || 'none'}).`
          : 'No gameMap wrapper: the bought ship gets no station config (name template, jobs).';
        const purchasableNote = isPurchasableVessel(entry) ? 'purchasable.' : 'NOT purchasable (purchasable: false).';
        badges.push({
          key: `vessel:${entry.id}`,
          label: `Ship: ${entry.id}`,
          title: `Shipyard vessel ${entry.id}: ${purchasableNote}\n${stationNote}\n${source}`,
        });
        break;
      }
      case 'gameMap': {
        if (hasVessel) {
          // Ship wrapper: badge only the mechanics it enables.
          if (isExpeditionCapable(entry, registry)) {
            badges.push({
              key: `expedition:${entry.id}`,
              label: 'Expedition',
              title:
                `Expedition-capable: station config ${entry.id} uses stationProto ` +
                `${(entry.stationProtos ?? []).join(', ')} carrying SalvageExpeditionData, ` +
                `which the expedition console requires.\n${source}`,
            });
          }
        } else if (entry.stations && entry.stations.length > 0) {
          badges.push({
            key: `gameMap:${entry.id}`,
            label: `Station: ${entry.id}`,
            title: `gameMap ${entry.id} wraps this file in station config (stations: ${entry.stations.join(', ')}).\n${source}`,
          });
        } else {
          badges.push({
            key: `gameMap:${entry.id}`,
            label: `GameMap: ${entry.id}`,
            title: `gameMap ${entry.id} loads this file with no station entries.\n${source}`,
          });
        }
        break;
      }
      case 'pointOfInterest':
        badges.push({
          key: `poi:${entry.id}`,
          label: `POI: ${entry.id}`,
          title: `Point of interest ${entry.id}: spawned as a world POI.\n${source}`,
        });
        break;
      case 'salvageMap':
        badges.push({
          key: `salvage:${entry.id}`,
          label: `Salvage: ${entry.id}`,
          title: `Salvage wreck ${entry.id}: spawned by the salvage magnet.\n${source}`,
        });
        break;
    }
  }

  if (badges.length === 0) return null;
  return (
    <>
      {badges.map((b) => (
        <span
          key={b.key}
          data-testid="ship-meta-badge"
          className="ml-1.5 text-[10px] uppercase tracking-wider text-accent border border-subtle rounded-sm px-1.5 py-0.5 select-none"
          title={b.title}
        >
          {b.label}
        </span>
      ))}
    </>
  );
};
