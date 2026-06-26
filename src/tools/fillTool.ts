import type { ITool, ToolContext } from './toolTypes';
import type { TileChange } from '../types';
import { getCell, ensureGridContains, setCell } from '../state/editorState';

export class FillTool implements ITool {
  name = 'fill';
  cursor = 'crosshair';

  onMouseDown(ctx: ToolContext, tileX: number, tileY: number, button: number) {
    if (button !== 0) return;
    const { state, paletteItem } = ctx;
    if (!paletteItem || paletteItem.type !== 'tile') return;

    const cell = getCell(state.grid, tileX, tileY);
    if (!cell) return;

    const targetId = cell.tileId;
    if (targetId === paletteItem.id) return; // Already the same tile

    const changes: TileChange[] = [];
    const visited = new Set<string>();
    const queue: [number, number][] = [[tileX, tileY]];
    const MAX_FILL = 50_000; // Safety limit

    while (queue.length > 0 && changes.length < MAX_FILL) {
      const [x, y] = queue.shift()!;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const c = getCell(state.grid, x, y);
      if (!c || c.tileId !== targetId) continue;

      const before = { ...c };
      const after = { tileId: paletteItem.id };
      setCell(state.grid, x, y, after);
      changes.push({ x, y, before, after });

      // 4-directional neighbors
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    if (changes.length > 0) {
      ctx.dispatch({
        type: 'APPLY_COMMAND',
        command: {
          label: 'Fill tiles',
          tileChanges: changes,
          entityChanges: [],
        },
      });
    }
  }

  onMouseMove() {}
  onMouseUp() {}

  renderPreview(
    canvasCtx: CanvasRenderingContext2D,
    toolCtx: ToolContext,
    cursorTileX: number,
    cursorTileY: number,
  ) {
    if (!toolCtx.paletteItem || toolCtx.paletteItem.type !== 'tile') return;

    const { camera, canvasW, canvasH } = toolCtx;
    const tileScreenSize = camera.tileScreenSize;
    const drawX = camera.worldToScreenX(cursorTileX, canvasW);
    const drawY = camera.worldToScreenY(cursorTileY, canvasH);

    canvasCtx.fillStyle = 'rgba(0, 255, 0, 0.15)';
    canvasCtx.fillRect(drawX, drawY, tileScreenSize, tileScreenSize);
    canvasCtx.strokeStyle = '#00ff88';
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(drawX, drawY, tileScreenSize, tileScreenSize);
  }
}
