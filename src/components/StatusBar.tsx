import React from 'react';
import type { EditorState } from '../state/editorState';
import { getCell } from '../state/editorState';

interface Props {
  state: EditorState;
  cursorTileX: number;
  cursorTileY: number;
  statusMessage: string;
}

export const StatusBar: React.FC<Props> = ({ state, cursorTileX, cursorTileY, statusMessage }) => {
  const { grid, entities } = state;
  const cell = getCell(grid, cursorTileX, cursorTileY);
  const tileId = cell ? cell.tileId : '--';

  return (
    <div className="flex items-center h-6 bg-surface border-t border-subtle px-3 text-[10px] text-muted gap-4">
      <span>Tile: (<span className="text-primary">{cursorTileX}</span>, <span className="text-primary">{cursorTileY}</span>)</span>
      <span>{tileId}</span>
      {grid.width > 0 && <span>Grid: {grid.width} x {grid.height}</span>}
      <span>Entities: {entities.length}</span>
      <span className="ml-auto text-accent">{statusMessage}</span>
    </div>
  );
};
