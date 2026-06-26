import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useEntitySearch } from '../hooks/useEntitySearch';
import { EntityThumbnail } from './EntityThumbnail';
import type { ImportedEntity } from '../import/mapImporter';
import type { IPrototypeRegistry } from '../loaders/registryTypes';

interface Props {
  entities: ImportedEntity[];
  registry: IPrototypeRegistry | null;
  onNavigate: (entity: ImportedEntity) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export const EntitySearchBar: React.FC<Props> = ({
  entities, registry, onNavigate, searchInputRef,
}) => {
  const { query, setQuery, results, selectedIndex, setSelectedIndex } = useEntitySearch(entities, registry);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const showDropdown = dropdownOpen && query.trim().length > 0;

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  // Scroll selected item into view
  useEffect(() => {
    if (!showDropdown || !listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, showDropdown]);

  const handleNavigate = useCallback((entity: ImportedEntity) => {
    onNavigate(entity);
    setDropdownOpen(false);
  }, [onNavigate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown && query.trim().length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setDropdownOpen(true);
      e.preventDefault();
      return;
    }

    if (!showDropdown) {
      if (e.key === 'Escape') {
        setQuery('');
        (e.target as HTMLInputElement).blur();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((selectedIndex + 1) % results.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((selectedIndex - 1 + results.length) % results.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          handleNavigate(results[selectedIndex].entity);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setDropdownOpen(false);
        break;
    }
  }, [showDropdown, query, results, selectedIndex, setSelectedIndex, setQuery, handleNavigate]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setDropdownOpen(true);
  }, [setQuery]);

  const handleClear = useCallback(() => {
    setQuery('');
    setDropdownOpen(false);
    searchInputRef?.current?.focus();
  }, [setQuery, searchInputRef]);

  return (
    <div ref={containerRef} className="relative flex items-center">
      <div className="flex items-center bg-surface border border-subtle rounded-sm">
        <input
          ref={searchInputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query.trim()) setDropdownOpen(true); }}
          placeholder="Search entities..."
          className="w-[200px] px-2 py-1 bg-transparent border-none text-primary text-xs outline-none placeholder:text-muted"
        />
        {query && (
          <>
            <span className="text-[10px] text-muted px-1 whitespace-nowrap">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={handleClear}
              className="px-1.5 py-0.5 bg-transparent border-none text-muted hover:text-primary cursor-pointer text-xs leading-none"
              title="Clear search"
            >
              ×
            </button>
          </>
        )}
      </div>

      {showDropdown && (
        <div
          ref={listRef}
          className="absolute top-full right-0 mt-0.5 w-[320px] max-h-[280px] overflow-y-auto bg-elevated border border-subtle rounded-sm shadow-lg z-50"
        >
          {results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted italic">No results</div>
          ) : (
            results.map((result, i) => (
              <button
                key={`${result.entity.uid}-${i}`}
                onClick={() => handleNavigate(result.entity)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-left border-none cursor-pointer text-xs ${
                  i === selectedIndex
                    ? 'bg-active text-accent'
                    : 'bg-transparent text-primary hover:bg-hover'
                }`}
              >
                {registry && (
                  <EntityThumbnail prototypeId={result.prototypeId} registry={registry} />
                )}
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{result.displayName}</span>
                  {result.displayName !== result.prototypeId && (
                    <span className="text-muted ml-1 text-[10px]">{result.prototypeId}</span>
                  )}
                </div>
                <span className="text-muted text-[10px] whitespace-nowrap">
                  ({Math.floor(result.entity.position.x)}, {Math.floor(result.entity.position.y)})
                </span>
                <span className="text-muted text-[10px]">
                  #{result.entity.uid}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
