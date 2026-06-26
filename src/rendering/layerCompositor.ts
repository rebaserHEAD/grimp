/**
 * Manages oversized offscreen canvases for layered compositing.
 *
 * Three layers (tiles, entities, connections) are rendered to offscreen
 * canvases larger than the viewport. During pan, cached layers are
 * composited with pixel offset. During zoom, cached layers are composited
 * with scale transform. Layers only re-render when dirty or when pan
 * exceeds the buffer margin.
 */

/** Factory function for creating canvas elements. Defaults to document.createElement. */
export type CanvasFactory = () => HTMLCanvasElement;

const defaultCanvasFactory: CanvasFactory = () => document.createElement('canvas');

export class LayerCompositor {
  readonly margin: number;

  private _bufferW = 0;
  private _bufferH = 0;
  private _physicalW = 0;
  private _physicalH = 0;
  private _dpr = 1;

  private tileCanvas: HTMLCanvasElement | null = null;
  private entityCanvas: HTMLCanvasElement | null = null;
  private connectionCanvas: HTMLCanvasElement | null = null;
  private lightCanvas: HTMLCanvasElement | null = null;
  private decalCanvas: HTMLCanvasElement | null = null;

  private _tilesDirty = true;
  private _entitiesDirty = true;
  private _connectionsDirty = true;
  private _lightDirty = true;
  private _decalsDirty = true;

  private snapX = 0;
  private snapY = 0;
  private snapZoom = 1;

  private canvasFactory: CanvasFactory;

  constructor(margin = 0.5, canvasFactory?: CanvasFactory) {
    this.margin = margin;
    this.canvasFactory = canvasFactory ?? defaultCanvasFactory;
  }

  get bufferWidth(): number { return this._bufferW; }
  get bufferHeight(): number { return this._bufferH; }
  get physicalWidth(): number { return this._physicalW; }
  get physicalHeight(): number { return this._physicalH; }
  get isTilesDirty(): boolean { return this._tilesDirty; }
  get isEntitiesDirty(): boolean { return this._entitiesDirty; }
  get isConnectionsDirty(): boolean { return this._connectionsDirty; }
  get isLightDirty(): boolean { return this._lightDirty; }
  get isDecalsDirty(): boolean { return this._decalsDirty; }

  resize(viewportW: number, viewportH: number, dpr: number): void {
    this._dpr = dpr;
    this._bufferW = Math.ceil(viewportW * (1 + 2 * this.margin));
    this._bufferH = Math.ceil(viewportH * (1 + 2 * this.margin));
    this._physicalW = this._bufferW * dpr;
    this._physicalH = this._bufferH * dpr;

    this.tileCanvas = this.allocCanvas(this.tileCanvas);
    this.entityCanvas = this.allocCanvas(this.entityCanvas);
    this.decalCanvas = this.allocCanvas(this.decalCanvas);
    this.connectionCanvas = this.allocCanvas(this.connectionCanvas);
    this.lightCanvas = this.allocCanvas(this.lightCanvas);

    this._tilesDirty = true;
    this._entitiesDirty = true;
    this._connectionsDirty = true;
    this._lightDirty = true;
    this._decalsDirty = true;
  }

  private allocCanvas(existing: HTMLCanvasElement | null): HTMLCanvasElement {
    const c = existing ?? this.canvasFactory();
    c.width = this._physicalW;
    c.height = this._physicalH;
    const ctx = c.getContext('2d');
    if (ctx) ctx.imageSmoothingEnabled = false;
    return c;
  }

  invalidateTiles(): void { this._tilesDirty = true; }
  invalidateEntities(): void { this._entitiesDirty = true; this._lightDirty = true; this._decalsDirty = true; }
  invalidateConnections(): void { this._connectionsDirty = true; }
  invalidateLight(): void { this._lightDirty = true; }
  invalidateDecals(): void { this._decalsDirty = true; }

  invalidateAll(): void {
    this._tilesDirty = true;
    this._entitiesDirty = true;
    this._connectionsDirty = true;
    this._lightDirty = true;
    this._decalsDirty = true;
  }

  markAllClean(): void {
    this._tilesDirty = false;
    this._entitiesDirty = false;
    this._connectionsDirty = false;
    this._lightDirty = false;
    this._decalsDirty = false;
  }

  needsLayerRender(): boolean {
    return this._tilesDirty || this._entitiesDirty || this._connectionsDirty || this._lightDirty || this._decalsDirty;
  }

  setCameraSnapshot(x: number, y: number, zoom: number): void {
    this.snapX = x;
    this.snapY = y;
    this.snapZoom = zoom;
  }

  get snapshotX(): number { return this.snapX; }
  get snapshotY(): number { return this.snapY; }
  get snapshotZoom(): number { return this.snapZoom; }

  panExceedsMargin(
    offsetX: number, offsetY: number,
    viewportW: number, viewportH: number,
  ): boolean {
    const marginPxX = viewportW * this.margin;
    const marginPxY = viewportH * this.margin;
    return Math.abs(offsetX) > marginPxX || Math.abs(offsetY) > marginPxY;
  }

  zoomChanged(currentZoom: number): boolean {
    return currentZoom !== this.snapZoom;
  }

  getTileCtx(): CanvasRenderingContext2D | null {
    return this.tileCanvas?.getContext('2d') ?? null;
  }

  getEntityCtx(): CanvasRenderingContext2D | null {
    return this.entityCanvas?.getContext('2d') ?? null;
  }

  getConnectionCtx(): CanvasRenderingContext2D | null {
    return this.connectionCanvas?.getContext('2d') ?? null;
  }

  getLightCtx(): CanvasRenderingContext2D | null {
    return this.lightCanvas?.getContext('2d') ?? null;
  }

  getDecalCtx(): CanvasRenderingContext2D | null {
    return this.decalCanvas?.getContext('2d') ?? null;
  }

  getDecalCanvas(): HTMLCanvasElement | null { return this.decalCanvas; }

  getTileCanvas(): HTMLCanvasElement | null { return this.tileCanvas; }
  getEntityCanvas(): HTMLCanvasElement | null { return this.entityCanvas; }
  getConnectionCanvas(): HTMLCanvasElement | null { return this.connectionCanvas; }
  getLightCanvas(): HTMLCanvasElement | null { return this.lightCanvas; }
}
