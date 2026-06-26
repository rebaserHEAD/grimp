import React from 'react';
import type { LayerVisibility } from '../rendering/entityRenderer';

interface Props {
  layers: LayerVisibility;
  onToggleLayer: (layer: keyof LayerVisibility) => void;
  showSubFloor: boolean;
  onToggleSubFloor: () => void;
  showConnections: boolean;
  onToggleConnections: () => void;
}

const LAYER_DEFS: { key: keyof LayerVisibility; label: string; desc: string }[] = [
  { key: 'subfloor', label: 'SubFloor', desc: 'Cables, pipes, disposal (-22 to -13)' },
  { key: 'floorObjects', label: 'Floor Obj', desc: 'Carpets, floor items (-12 to -5)' },
  { key: 'structures', label: 'Structures', desc: 'Walls, windows, grilles (-2 to -1)' },
  { key: 'objects', label: 'Objects', desc: 'Furniture, machines, wall mounts (0 to +7)' },
  { key: 'doors', label: 'Doors', desc: 'Airlocks, firelocks, blast doors (+8 to +10)' },
  { key: 'markers', label: 'Markers', desc: 'Spawn points, mapping helpers' },
  { key: 'decals', label: 'Decals', desc: 'Floor markings, arrows, overlays' },
];

export const LayerPanel: React.FC<Props> = ({
  layers, onToggleLayer, showSubFloor, onToggleSubFloor,
  showConnections, onToggleConnections,
}) => {
  return (
    <div className="p-3">
      {LAYER_DEFS.map(def => (
        <label key={def.key} className="flex items-center gap-2 py-0.5 text-primary text-[11px] cursor-pointer select-none" title={def.desc}>
          <input
            type="checkbox"
            checked={layers[def.key]}
            onChange={() => onToggleLayer(def.key)}
            className="accent-accent w-3 h-3"
          />
          {def.label}
        </label>
      ))}

      <div className="h-px bg-subtle my-2" />

      <label className="flex items-center gap-2 py-0.5 text-primary text-[11px] cursor-pointer select-none" title="Show infrastructure under non-subfloor tiles (T-ray mode)">
        <input
          type="checkbox"
          checked={showSubFloor}
          onChange={onToggleSubFloor}
          className="accent-accent w-3 h-3"
        />
        T-Ray (SubFloor)
      </label>

      <label className="flex items-center gap-2 py-0.5 text-primary text-[11px] cursor-pointer select-none" title="Show device links and connections">
        <input
          type="checkbox"
          checked={showConnections}
          onChange={onToggleConnections}
          className="accent-accent w-3 h-3"
        />
        Connections
      </label>
    </div>
  );
};
