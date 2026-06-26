import React from 'react';
import type { GridData } from '../state/gridData';
import { EntitySearchBar } from './EntitySearchBar';
import type { ImportedEntity } from '../import/mapImporter';
import type { IPrototypeRegistry } from '../loaders/registryTypes';

interface Props {
  grids: GridData[];
  activeGridIndex: number;
  onSelectGrid: (index: number) => void;
  onAddGrid: () => void;
  onDeleteGrid: (gridUid: number) => void;
  onRenameGrid: (gridUid: number, newName: string) => void;
  onFocusGrid: (index: number) => void;
  entities: ImportedEntity[];
  registry: IPrototypeRegistry | null;
  onSearchNavigate: (entity: ImportedEntity) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onValidate?: () => void;
}

export const GridTabBar: React.FC<Props> = ({
  grids, activeGridIndex, onSelectGrid, onAddGrid, onDeleteGrid, onRenameGrid, onFocusGrid,
  entities, registry, onSearchNavigate, searchInputRef, onValidate,
}) => {
  return (
    <div className="flex items-end bg-panel border-b border-subtle shrink-0">
      <div className="flex items-end overflow-x-auto min-w-0">
        {grids.map((gd, idx) => {
          const isActive = idx === activeGridIndex;
          return (
            <div
              key={gd.gridUid}
              data-active={isActive ? 'true' : 'false'}
              className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer select-none border-r border-subtle whitespace-nowrap
                ${isActive
                  ? 'bg-surface text-primary border-b-2 border-b-accent'
                  : 'bg-panel text-muted hover:text-primary hover:bg-hover'
                }`}
              onClick={() => onSelectGrid(idx)}
              onDoubleClick={() => {
                const name = prompt('Rename grid:', gd.name);
                if (name && name !== gd.name) onRenameGrid(gd.gridUid, name);
              }}
              onAuxClick={(e) => {
                if (e.button === 1 && grids.length > 1) {
                  e.preventDefault();
                  onDeleteGrid(gd.gridUid);
                }
              }}
            >
              <span>{gd.name}</span>
              <span className="text-muted text-[10px]">({gd.gridUid})</span>
              {grids.length > 1 && (
                <button
                  className="ml-1 text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Close grid"
                  onClick={(e) => { e.stopPropagation(); onDeleteGrid(gd.gridUid); }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        <button
          className="px-2 py-1.5 text-xs text-muted hover:text-primary hover:bg-hover"
          title="Add new grid"
          onClick={onAddGrid}
        >
          +
        </button>
      </div>

      <div className="flex-1" />

      <button
        onClick={onValidate}
        className="flex items-center gap-1 self-center text-white bg-warning hover:brightness-110 cursor-pointer border-none rounded-sm text-[11px] px-2 py-0.5 mr-2 shrink-0"
        title="Validate Map"
      >
        <span className="text-[12px]">&#x26A0;</span>
        <span>Validate Map</span>
      </button>

      <div className="pr-2 py-0.5 shrink-0">
        <EntitySearchBar
          entities={entities}
          registry={registry}
          onNavigate={onSearchNavigate}
          searchInputRef={searchInputRef}
        />
      </div>
    </div>
  );
};
