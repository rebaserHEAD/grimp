import React, { useCallback } from 'react';
import type { ImportedEntity } from '../import/mapImporter';
import type { IPrototypeRegistry } from '../loaders/registryTypes';
import { extractLightInfo } from '../rendering/lightRenderer';

interface Props {
  entity: ImportedEntity;
  registry: IPrototypeRegistry | null;
  onUpdateEntity: (entity: ImportedEntity) => void;
}

/**
 * Check whether an entity has a PointLight (from instance or prototype).
 */
export function hasPointLight(
  entity: ImportedEntity,
  registry: IPrototypeRegistry | null,
): boolean {
  return extractLightInfo(entity, registry) !== null;
}

export const LightEditor: React.FC<Props> = ({ entity, registry, onUpdateEntity }) => {
  const lightInfo = extractLightInfo(entity, registry);
  if (!lightInfo) return null;

  const updatePointLight = useCallback((field: string, value: unknown) => {
    const comps = [...entity.components] as Record<string, unknown>[];
    const idx = comps.findIndex(c => c.type === 'PointLight');
    if (idx >= 0) {
      comps[idx] = { ...comps[idx], [field]: value };
    } else {
      // Create new PointLight override with just the changed field
      comps.push({ type: 'PointLight', [field]: value });
    }
    onUpdateEntity({ ...entity, components: comps });
  }, [entity, onUpdateEntity]);

  // Convert hex color for the color input (needs exactly #RRGGBB)
  const colorHex = lightInfo.color.length === 7 ? lightInfo.color : '#FFFFFF';

  return (
    <div className="mt-2">
      <div className="text-muted text-[10px] mb-1">Light</div>

      <div className="flex items-center gap-2 mb-1">
        <label className="text-[10px] text-muted w-12">Color</label>
        <input
          type="color"
          value={colorHex}
          onChange={e => updatePointLight('color', e.target.value)}
          className="w-6 h-5 border border-subtle rounded-sm cursor-pointer p-0"
        />
        <span className="text-[9px] text-muted">{colorHex}</span>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <label className="text-[10px] text-muted w-12">Radius</label>
        <input
          type="range"
          min="1" max="20" step="0.5"
          value={lightInfo.radius}
          onChange={e => updatePointLight('radius', parseFloat(e.target.value))}
          className="flex-1 h-3"
        />
        <span className="text-[9px] text-muted w-6 text-right">{lightInfo.radius}</span>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <label className="text-[10px] text-muted w-12">Energy</label>
        <input
          type="range"
          min="0.1" max="5.0" step="0.1"
          value={lightInfo.energy}
          onChange={e => updatePointLight('energy', parseFloat(e.target.value))}
          className="flex-1 h-3"
        />
        <span className="text-[9px] text-muted w-6 text-right">{lightInfo.energy.toFixed(1)}</span>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <label className="text-[10px] text-muted w-12">Falloff</label>
        <input
          type="range"
          min="0.5" max="15.0" step="0.1"
          value={lightInfo.falloff}
          onChange={e => updatePointLight('falloff', parseFloat(e.target.value))}
          className="flex-1 h-3"
        />
        <span className="text-[9px] text-muted w-6 text-right">{lightInfo.falloff.toFixed(1)}</span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[10px] text-muted w-12">Enabled</label>
        <input
          type="checkbox"
          checked={lightInfo.enabled}
          onChange={e => updatePointLight('enabled', e.target.checked)}
          className="cursor-pointer"
        />
      </div>
    </div>
  );
};
