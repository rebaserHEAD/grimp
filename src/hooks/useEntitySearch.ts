import { useState, useMemo, useCallback } from 'react';
import type { ImportedEntity } from '../import/mapImporter';
import type { IPrototypeRegistry } from '../loaders/registryTypes';

export interface SearchResult {
  entity: ImportedEntity;
  displayName: string;
  prototypeId: string;
}

const MAX_RESULTS = 200;

/**
 * Filter placed entities by query matching prototype ID or display name.
 * Exported for direct testing; the hook wraps this with React state.
 */
export function filterEntities(
  entities: ImportedEntity[],
  query: string,
  registry: IPrototypeRegistry | null,
): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  const results: SearchResult[] = [];

  for (const entity of entities) {
    if (results.length >= MAX_RESULTS) break;

    const protoId = entity.prototype;
    const resolved = registry?.getEntity(protoId);
    const displayName = resolved?.name ?? protoId;

    if (
      protoId.toLowerCase().includes(lower) ||
      displayName.toLowerCase().includes(lower)
    ) {
      results.push({ entity, displayName, prototypeId: protoId });
    }
  }

  return results;
}

/**
 * Hook for searching placed entities on the active grid.
 */
export function useEntitySearch(
  entities: ImportedEntity[],
  registry: IPrototypeRegistry | null,
) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const results = useMemo(
    () => filterEntities(entities, query, registry),
    [entities, query, registry],
  );

  // Reset selected index when results change
  const updateQuery = useCallback((q: string) => {
    setQuery(q);
    setSelectedIndex(0);
  }, []);

  return { query, setQuery: updateQuery, results, selectedIndex, setSelectedIndex };
}
