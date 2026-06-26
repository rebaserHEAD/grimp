import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ImportedEntity } from '../import/mapImporter';
import type { IPrototypeRegistry, ResolvedEntity } from '../loaders/registryTypes';
import { EntityThumbnail } from './EntityThumbnail';

// ---- Exported helpers (tested) ----

export function hasContainerComponent(components: Record<string, unknown>[]): boolean {
  return components.some(c => c.type === 'ContainerContainer');
}

/** Check if an entity or its prototype defines a ContainerContainer component */
export function isContainerEntity(
  entity: ImportedEntity,
  registry: IPrototypeRegistry | null,
): boolean {
  if (hasContainerComponent(entity.components)) return true;
  if (!registry) return false;
  const resolved = registry.getEntity(entity.prototype);
  if (!resolved) return false;
  return resolved.components.some(c => c.type === 'ContainerContainer');
}

export function getContainedEntityUids(components: Record<string, unknown>[]): number[] {
  const cc = components.find(c => c.type === 'ContainerContainer') as any;
  if (!cc?.containers?.entity_storage?.ents) return [];
  return [...cc.containers.entity_storage.ents];
}

function hasEntityTableFill(components: Record<string, unknown>[]): boolean {
  return components.some(c => c.type === 'EntityTableContainerFill');
}

// ---- Component ----

interface Props {
  entity: ImportedEntity;
  containedEntities: ImportedEntity[];
  registry: IPrototypeRegistry | null;
  onAdd: (parentUid: number, prototypeId: string) => void;
  onRemove: (parentUid: number, entityUid: number) => void;
}

export const ContainerContentsEditor: React.FC<Props> = ({
  entity, containedEntities, registry, onAdd, onRemove,
}) => {
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<ResolvedEntity[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Search the registry when text changes
  useEffect(() => {
    if (!searchText.trim() || !registry) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const lower = searchText.toLowerCase();
    const results: ResolvedEntity[] = [];
    for (const cat of registry.getCategories()) {
      for (const e of registry.getEntitiesByCategory(cat)) {
        if (e.abstract) continue;
        if (
          e.id.toLowerCase().includes(lower) ||
          e.name.toLowerCase().includes(lower)
        ) {
          results.push(e);
          if (results.length >= 20) break;
        }
      }
      if (results.length >= 20) break;
    }
    results.sort((a, b) => a.name.localeCompare(b.name));
    setSearchResults(results);
    setShowDropdown(results.length > 0);
  }, [searchText, registry]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const handleAdd = useCallback((protoId: string) => {
    onAdd(entity.uid, protoId);
    setSearchText('');
    setShowDropdown(false);
  }, [entity.uid, onAdd]);

  const isRuntimeFilled = hasEntityTableFill(entity.components);

  return (
    <div className="mt-2">
      <div className="text-muted text-[10px] mb-1">
        Contents ({containedEntities.length} item{containedEntities.length !== 1 ? 's' : ''})
      </div>

      {isRuntimeFilled && (
        <div className="text-[9px] text-muted italic mb-1">
          Runtime-filled, items below are hand-placed additions
        </div>
      )}

      {/* Item list */}
      <div className="max-h-[150px] overflow-y-auto">
        {containedEntities.map(child => (
          <div
            key={child.uid}
            className="flex items-center gap-1.5 px-1 py-0.5 rounded-sm hover:bg-hover group"
          >
            {registry && (
              <EntityThumbnail prototypeId={child.prototype} registry={registry} />
            )}
            <span className="text-primary text-[11px] truncate flex-1">{child.prototype}</span>
            <button
              onClick={() => onRemove(entity.uid, child.uid)}
              className="bg-transparent border-none text-red-500 text-[11px] cursor-pointer px-1 opacity-0 group-hover:opacity-100"
              title="Remove from container"
            >
              &times;
            </button>
          </div>
        ))}
        {containedEntities.length === 0 && !isRuntimeFilled && (
          <div className="text-muted text-[9px] italic px-1">Empty</div>
        )}
      </div>

      {/* Add item search */}
      <div className="relative mt-1" ref={dropdownRef}>
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Search to add item..."
          className="w-full px-2 py-1 bg-surface border border-subtle rounded-sm text-primary text-[10px] outline-none focus:border-accent"
        />
        {showDropdown && (
          <div className="absolute left-0 right-0 top-full z-[100] bg-elevated border border-subtle rounded-sm max-h-[160px] overflow-y-auto shadow-lg">
            {searchResults.map(e => (
              <button
                key={e.id}
                onClick={() => handleAdd(e.id)}
                className="flex items-center gap-1.5 w-full px-2 py-1 text-left border-none bg-transparent text-primary text-[10px] cursor-pointer hover:bg-hover"
              >
                {registry && (
                  <EntityThumbnail prototypeId={e.id} registry={registry} />
                )}
                <span className="truncate">{e.name}</span>
                <span className="text-muted ml-auto text-[9px]">{e.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
