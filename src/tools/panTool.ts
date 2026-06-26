import type { ITool, ToolContext } from './toolTypes';

export class PanTool implements ITool {
  name = 'pan';
  cursor = 'grab';

  private panning = false;
  private lastScreenX = 0;
  private lastScreenY = 0;

  onMouseDown(ctx: ToolContext, _tileX: number, _tileY: number, button: number) {
    if (button !== 0) return;
    this.panning = true;
    this.cursor = 'grabbing';
  }

  onMouseMove() {
    // Pan is handled directly by EditorCanvas via the isPanning ref
  }

  onMouseUp() {
    this.panning = false;
    this.cursor = 'grab';
  }

  deactivate() {
    this.panning = false;
    this.cursor = 'grab';
  }
}
