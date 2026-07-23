import React, { useEffect, useState } from 'react';
import type { MapMeta } from '../import/mapImporter';
import type { GridProperties } from '../state/editorState';

/**
 * Map Properties: the document's meta block and the active grid root's
 * structural data. This is the file-side view of what you'd otherwise VV
 * in-game: identity (MetaData name/desc) and the ship switches (Shuttle,
 * IFF) are editable; everything else is shown read-only.
 */

interface Props {
  documentKind: 'Map' | 'Grid';
  meta: MapMeta;
  gridUid: number;
  gridProperties: GridProperties;
  /** Non-space tile count of the active grid (the gridtc number). */
  tileCount: number;
  onSetIdentity: (name: string, desc: string) => void;
  onToggleComponent: (componentType: string, enabled: boolean) => void;
  /** Set BecomesStation.id (creating the component), or null to remove it. */
  onSetBecomesStation: (id: string | null) => void;
  onClose: () => void;
}

/** The editable ship switches, with what each one actually gates. */
const SHIP_SWITCHES: { type: string; label: string; hint: string }[] = [
  {
    type: 'Shuttle',
    label: 'Shuttle',
    hint: 'FTL-capable grid. Required by the shipyard: purchase fails without it.',
  },
  {
    type: 'IFF',
    label: 'IFF',
    hint: 'Radar identity (label, color, visibility flags). Optional.',
  },
  {
    type: 'Roof',
    label: 'Roof',
    hint: 'Monolith ships require this. Roofed areas themselves come from roof markers / in-game tools.',
  },
];

/** Components that mean a grid file was saved as a map at some point.
 * NF maintainers require deleting the stray map root (PR 2599); these are its
 * signature when it lands on the grid root. Broadphase/OccluderTree are NOT
 * in this list: they are legitimate on grid roots. */
const MAP_CONTAMINATION = ['Map', 'PhysicsMap', 'GridTree', 'MovedGrids'];

export const MapPropertiesModal: React.FC<Props> = ({
  documentKind, meta, gridUid, gridProperties, tileCount,
  onSetIdentity, onToggleComponent, onSetBecomesStation, onClose,
}) => {
  const [name, setName] = useState(gridProperties.name);
  const [desc, setDesc] = useState(gridProperties.desc);
  const [stationId, setStationId] = useState(gridProperties.becomesStationId ?? '');
  const hasBecomesStation = gridProperties.components.includes('BecomesStation');

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const commitIdentity = () => {
    if (name !== gridProperties.name || desc !== gridProperties.desc) {
      onSetIdentity(name, desc);
    }
  };

  const editableTypes = new Set([...SHIP_SWITCHES.map(s => s.type), 'BecomesStation']);
  const otherComponents = gridProperties.components.filter(t => !editableTypes.has(t));
  const contamination = documentKind === 'Grid'
    ? MAP_CONTAMINATION.filter(t => gridProperties.components.includes(t))
    : [];

  const metaRows: [string, string][] = [
    ['Kind', documentKind],
    ['Format', String(meta.format)],
    ...(meta.engineVersion ? [['Engine', meta.engineVersion] as [string, string]] : []),
    ...(meta.time ? [['Saved', meta.time] as [string, string]] : []),
    ...(meta.entityCount !== undefined ? [['Entities', String(meta.entityCount)] as [string, string]] : []),
    ['Tiles', String(tileCount)],
    ['Grid root uid', String(gridUid)],
  ];

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-elevated border border-subtle rounded-lg p-6 max-w-[560px] w-full max-h-[80vh] overflow-y-auto text-primary text-[13px]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-accent m-0">Map Properties</h2>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-muted hover:text-primary cursor-pointer text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        <div className="mb-4">
          <h3 className="text-[11px] uppercase tracking-wider text-muted mb-1.5 font-semibold">Document</h3>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
            {metaRows.map(([k, v]) => (
              <React.Fragment key={k}>
                <span className="text-muted whitespace-nowrap">{k}</span>
                <span className="text-primary font-mono text-[12px]">{v}</span>
              </React.Fragment>
            ))}
          </div>
          {meta.postmapinit === true && (
            <div className="mt-2 text-[12px] text-warning">
              This file was saved post-mapinit. Grids should be saved before map
              initialization; the game may misbehave loading this one.
            </div>
          )}
        </div>

        <div className="mb-4">
          <h3 className="text-[11px] uppercase tracking-wider text-muted mb-1.5 font-semibold">Identity</h3>
          <label className="block mb-2">
            <span className="text-muted block mb-0.5">Name</span>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={commitIdentity}
              placeholder="Unnamed grid"
              className="w-full bg-transparent border border-subtle rounded-sm px-2 py-1 text-primary text-[13px]"
            />
          </label>
          <label className="block">
            <span className="text-muted block mb-0.5">Description</span>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onBlur={commitIdentity}
              rows={3}
              placeholder="Shown on examine and in shipyard listings that read MetaData."
              className="w-full bg-transparent border border-subtle rounded-sm px-2 py-1 text-primary text-[13px] resize-y"
            />
          </label>
        </div>

        <div className="mb-4">
          <h3 className="text-[11px] uppercase tracking-wider text-muted mb-1.5 font-semibold">Ship switches</h3>
          {SHIP_SWITCHES.map(sw => {
            const enabled = gridProperties.components.includes(sw.type);
            return (
              <label key={sw.type} className="flex items-start gap-2 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={e => onToggleComponent(sw.type, e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-primary font-semibold">{sw.label}</span>
                  <span className="text-muted block text-[12px]">{sw.hint}</span>
                </span>
              </label>
            );
          })}

          <label className="flex items-start gap-2 mb-1 cursor-pointer">
            <input
              type="checkbox"
              checked={hasBecomesStation}
              onChange={e => {
                if (e.target.checked) {
                  const id = stationId.trim() || name.trim() || gridProperties.name;
                  setStationId(id);
                  onSetBecomesStation(id);
                } else {
                  onSetBecomesStation(null);
                }
              }}
              className="mt-0.5"
            />
            <span>
              <span className="text-primary font-semibold">BecomesStation</span>
              <span className="text-muted block text-[12px]">
                Applies station config (name, jobs) on gameMap load. The id must
                match a key under the gameMap prototype's stations block.
              </span>
            </span>
          </label>
          {hasBecomesStation && (
            <label className="block ml-6 mb-2">
              <span className="text-muted block mb-0.5">Station id</span>
              <input
                type="text"
                value={stationId}
                onChange={e => setStationId(e.target.value)}
                onBlur={() => {
                  const id = stationId.trim();
                  if (id && id !== gridProperties.becomesStationId) onSetBecomesStation(id);
                }}
                className="w-full bg-transparent border border-subtle rounded-sm px-2 py-1 text-primary text-[13px] font-mono"
              />
            </label>
          )}
        </div>

        {contamination.length > 0 && (
          <div className="mb-4 border border-subtle rounded p-2">
            <div className="text-[12px] text-warning mb-1.5">
              This grid file carries map-entity components ({contamination.join(', ')}):
              it was saved as a map at some point. Upstream maintainers require
              removing these from ship grids.
            </div>
            <button
              onClick={() => contamination.forEach(t => onToggleComponent(t, false))}
              className="text-[12px] border border-subtle rounded-sm px-2 py-1 text-primary hover:bg-hover cursor-pointer bg-transparent"
            >
              Remove map-entity components
            </button>
          </div>
        )}

        <div className="mb-2">
          <h3 className="text-[11px] uppercase tracking-wider text-muted mb-1.5 font-semibold">
            Other root components (read-only)
          </h3>
          <div className="flex flex-wrap gap-1">
            {otherComponents.map(t => (
              <span
                key={t}
                className="text-[11px] font-mono border border-subtle rounded-sm px-1.5 py-0.5 text-muted"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
