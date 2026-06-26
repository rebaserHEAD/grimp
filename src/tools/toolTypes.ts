import type { EditorState } from '../state/editorState';
import type { EditorAction } from '../state/actions';
import type { Camera } from '../rendering/camera';
import type { PaletteItem } from '../types';
import type { ContextMenuItem } from '../components/ContextMenu';
import type { DecalPlacementOptions } from './decalBrushHelper';
import type { LayerVisibility } from '../rendering/entityRenderer';

export interface ToolContext {
  state: EditorState;
  dispatch: (action: EditorAction) => void;
  camera: Camera;
  canvasW: number;
  canvasH: number;
  paletteItem: PaletteItem | null;
  shiftHeld: boolean;
  ctrlHeld: boolean;
  decalSettings?: DecalPlacementOptions;
  /** Update the decal placement color (used by eyedropper to pick decal colors). */
  setDecalColor?: (color: string | null) => void;
  /** Current layer visibility, tools should respect this for selection/interaction. */
  layerVisibility?: LayerVisibility;
}

export interface ITool {
  name: string;
  cursor: string;
  onMouseDown(ctx: ToolContext, tileX: number, tileY: number, button: number): void;
  onMouseMove(ctx: ToolContext, tileX: number, tileY: number): void;
  onMouseUp(ctx: ToolContext, tileX: number, tileY: number): void;
  renderPreview?(
    canvasCtx: CanvasRenderingContext2D,
    toolCtx: ToolContext,
    cursorTileX: number,
    cursorTileY: number,
  ): void;
  /** Handle scroll wheel. Return true to suppress default zoom behavior. */
  onWheel?(ctx: ToolContext, tileX: number, tileY: number, deltaY: number): boolean;
  deactivate?(): void;
  getContextMenuItems?(ctx: ToolContext, tileX: number, tileY: number): ContextMenuItem[];
}
