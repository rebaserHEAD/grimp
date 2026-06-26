import React, { useState, useMemo, useRef, useCallback } from 'react';
import type { PaletteItem } from '../types';
import type { IPrototypeRegistry, ResolvedEntity } from '../loaders/registryTypes';
import { EntityThumbnail, SpritePreviewPopup, useHoverPreview } from './EntityThumbnail';

interface Props {
  registry: IPrototypeRegistry | null;
  selectedItem: PaletteItem | null;
  onSelect: (item: PaletteItem) => void;
}

/** Common entity categories to prioritize at top */
const PRIORITY_CATEGORIES = [
  'Structures',
  'Structures/Doors',
  'Structures/Machines',
  'Structures/Power',
  'Structures/Piping',
  'Structures/Wallmounts',
  'Structures/Lighting',
  'Structures/Storage',
  'Structures/Windows',
  'Markers',
];

export const EntityPalette: React.FC<Props> = ({ registry, selectedItem, onSelect }) => {
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const { hovered, onMouseEnter, onMouseLeave } = useHoverPreview(250);

  const { categories, entityMap } = useMemo(() => {
    if (!registry) return { categories: [], entityMap: new Map<string, ResolvedEntity[]>() };

    const map = new Map<string, ResolvedEntity[]>();
    for (const cat of registry.getCategories()) {
      const entities = registry.getEntitiesByCategory(cat)
        .filter(e => !e.abstract)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (entities.length > 0) {
        map.set(cat, entities);
      }
    }

    // Sort categories: priority first, then alphabetical
    const allCats = Array.from(map.keys());
    const prioritySet = new Set(PRIORITY_CATEGORIES);
    const priority = PRIORITY_CATEGORIES.filter(c => allCats.includes(c));
    const rest = allCats.filter(c => !prioritySet.has(c)).sort();

    return { categories: [...priority, ...rest], entityMap: map };
  }, [registry]);

  const filteredEntities = useMemo(() => {
    if (!search || !registry) return null;
    const lower = search.toLowerCase();
    const results: ResolvedEntity[] = [];
    for (const entities of entityMap.values()) {
      for (const e of entities) {
        if (
          e.id.toLowerCase().includes(lower) ||
          e.name.toLowerCase().includes(lower) ||
          (e.suffix && typeof e.suffix === 'string' && e.suffix.toLowerCase().includes(lower))
        ) {
          results.push(e);
        }
      }
    }
    results.sort((a, b) => a.name.localeCompare(b.name));
    return results.slice(0, 200); // cap results
  }, [search, registry, entityMap]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const isEntitySelected = (id: string) =>
    selectedItem?.type === 'entity' && selectedItem.id === id;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-2 pt-2 pb-1 text-xs text-muted">Entities</div>

      {selectedItem?.type === 'entity' && (
        <div className="px-2 pb-2 border-b border-subtle text-[11px] text-primary">
          Selected: <strong>{selectedItem.id}</strong>
        </div>
      )}

      <div className="m-1">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search entities..."
          className="w-full px-2 py-1 bg-surface border border-subtle rounded-sm text-primary text-xs outline-none focus:border-accent"
        />
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filteredEntities ? (
          // Search results (flat list)
          <div className="px-2">
            {filteredEntities.length === 0 && (
              <div className="text-muted text-xs p-3 italic text-center">No results</div>
            )}
            {filteredEntities.map(e => (
              <EntityRow
                key={e.id}
                entity={e}
                selected={isEntitySelected(e.id)}
                onSelect={() => onSelect({ type: 'entity', id: e.id })}
                registry={registry}
                onHoverEnter={onMouseEnter}
                onHoverLeave={onMouseLeave}
              />
            ))}
          </div>
        ) : (
          // Category tree
          categories.map(cat => {
            const entities = entityMap.get(cat);
            if (!entities) return null;
            const expanded = expandedCategories.has(cat);
            const shortName = cat.split('/').pop() ?? cat;

            return (
              <div key={cat}>
                <button
                  onClick={() => toggleCategory(cat)}
                  className="flex items-center px-2 py-1 text-[10px] uppercase tracking-wider text-muted bg-surface cursor-pointer hover:bg-hover select-none w-full text-left border-none"
                  title={cat}
                >
                  <span className="text-muted mr-1 text-[10px]">{expanded ? '▾' : '▸'}</span>
                  {shortName} <span className="text-muted ml-1">({entities.length})</span>
                </button>
                {expanded && (
                  <div className="pl-2 pr-2">
                    {entities.map(e => (
                      <EntityRow
                        key={e.id}
                        entity={e}
                        selected={isEntitySelected(e.id)}
                        onSelect={() => onSelect({ type: 'entity', id: e.id })}
                        registry={registry}
                        onHoverEnter={onMouseEnter}
                        onHoverLeave={onMouseLeave}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="px-2 py-1 text-[10px] text-muted border-t border-subtle">
        {registry?.entityCount ?? 0} entities
      </div>

      {/* Hover preview popup */}
      {hovered && registry && (
        <SpritePreviewPopup
          prototypeId={hovered.prototypeId}
          entityName={hovered.entityName}
          registry={registry}
          anchorRect={hovered.rect}
        />
      )}
    </div>
  );
};

const EntityRow: React.FC<{
  entity: ResolvedEntity;
  selected: boolean;
  onSelect: () => void;
  registry: IPrototypeRegistry | null;
  onHoverEnter: (prototypeId: string, entityName: string, el: HTMLElement) => void;
  onHoverLeave: () => void;
}> = ({ entity, selected, onSelect, registry, onHoverEnter, onHoverLeave }) => {
  const rowRef = useRef<HTMLButtonElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (rowRef.current) {
      onHoverEnter(entity.id, entity.name, rowRef.current);
    }
  }, [entity.id, entity.name, onHoverEnter]);

  return (
    <button
      ref={rowRef}
      onClick={onSelect}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onHoverLeave}
      className={`flex items-center gap-1.5 px-2 py-0.5 text-xs cursor-pointer w-full text-left border-none rounded-sm mb-px ${
        selected ? 'bg-active text-accent border border-accent' : 'text-primary hover:bg-hover bg-transparent border border-transparent'
      }`}
      title={`${entity.id}${entity.suffix ? ` (${String(entity.suffix)})` : ''}\n${entity.description || ''}`}
    >
      {registry && <EntityThumbnail prototypeId={entity.id} registry={registry} />}
      <span className="truncate">
        {entity.name}
        {entity.suffix && <span className="text-muted ml-1">({String(entity.suffix)})</span>}
      </span>
    </button>
  );
};
