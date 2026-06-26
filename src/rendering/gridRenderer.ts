import type { TileGrid } from '../types';
import type { IPrototypeRegistry } from '../loaders/registryTypes';
import { loadImage } from '../loaders/rsiLoader';
import { getActiveProvider } from '../loaders/resourceProvider';
import { Camera } from './camera';
import { markSceneDirty } from './dirtyFlags';

const TILE_SIZE = 32;

/** Minimal fallback colors when no texture is available. */
const FALLBACK_COLORS: Record<string, string> = {
  Space: '#111122',
  fallback: '#555566',
  wall: '#3a3a4a',
};

/**
 * Space background cache.
 *
 * Pre-bakes dust and tinted star layers into offscreen canvases with blur
 * already applied. Each frame just does drawImage calls, zero ctx.filter ops.
 */

export const STAR_TINTS = [
  { r: 100, g: 150, b: 255 }, // deep blue
  { r: 255, g: 170, b: 80 },  // orange-gold
  { r: 220, g: 100, b: 255 }, // bright violet
];

export const STAR_DEPTH_LAYERS = [
  { tint: 0, scale: 0.4, parallax: 0.02, opacity: 0.4, blur: 4 },
  { tint: 1, scale: 0.5, parallax: 0.08, opacity: 0.6, blur: 2.5 },
  { tint: 2, scale: 0.65, parallax: 0.22, opacity: 0.9, blur: 1 },
];

interface SpaceBgCache {
  dustCanvas: HTMLCanvasElement | null;
  starCanvases: HTMLCanvasElement[];  // pre-blurred, tiled, one per depth layer
  cachedW: number;
  cachedH: number;
}

let spaceBgLoading = false;
let spaceDustImg: HTMLImageElement | null = null;
let spaceStarsImg: HTMLImageElement | null = null;
let spaceBgCache: SpaceBgCache = { dustCanvas: null, starCanvases: [], cachedW: 0, cachedH: 0 };

/** Reset space background state (for testing). */
export function resetSpaceBg(): void {
  spaceBgLoading = false;
  spaceDustImg = null;
  spaceStarsImg = null;
  spaceBgCache = { dustCanvas: null, starCanvases: [], cachedW: 0, cachedH: 0 };
}

export function bakeTintedStars(src: HTMLImageElement): void {
  spaceStarsImg = src;
}

/** Bake a tiled+blurred pattern fill into an offscreen canvas. */
function bakePatternLayer(
  src: HTMLImageElement | HTMLCanvasElement,
  w: number, h: number,
  scale: number, blur: number,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const pat = ctx.createPattern(src, 'repeat');
  if (pat) {
    pat.setTransform(new DOMMatrix().scaleSelf(scale, scale));
    ctx.filter = `blur(${blur}px)`;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
  }
  return c;
}

/** Tint a star image and return a canvas. */
function tintStars(src: HTMLImageElement, tint: { r: number; g: number; b: number }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgb(${tint.r},${tint.g},${tint.b})`;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(src, 0, 0);
  return c;
}

/** Start loading space background images if not already started. */
export function loadSpaceBg(): void {
  if (spaceBgLoading) return;
  spaceBgLoading = true;
  const dust = new Image();
  const stars = new Image();
  dust.onload = () => { spaceDustImg = dust; spaceBgCache.dustCanvas = null; markSceneDirty(); };
  stars.onload = () => { spaceStarsImg = stars; spaceBgCache.starCanvases = []; markSceneDirty(); };
  dust.onerror = () => { spaceBgLoading = false; };
  stars.onerror = () => { };
  dust.src = '/images/space-bg.png';
  stars.src = '/images/space-stars.png';
}

/**
 * Get pre-baked background canvases for the given viewport size.
 * Rebuilds cache only when viewport size changes or on first call.
 * Returns null if images haven't loaded yet.
 */
export function getSpaceBgCache(w: number, h: number): SpaceBgCache | null {
  loadSpaceBg();
  if (!spaceDustImg) return null;

  // Rebuild if viewport size changed
  if (spaceBgCache.cachedW !== w || spaceBgCache.cachedH !== h || !spaceBgCache.dustCanvas) {
    spaceBgCache.cachedW = w;
    spaceBgCache.cachedH = h;
    spaceBgCache.dustCanvas = bakePatternLayer(spaceDustImg, w, h, 0.5, 4);

    if (spaceStarsImg) {
      spaceBgCache.starCanvases = STAR_DEPTH_LAYERS.map(layer => {
        const tinted = tintStars(spaceStarsImg!, STAR_TINTS[layer.tint % STAR_TINTS.length]);
        // Bake at larger size to allow parallax offset without gaps
        const margin = 200;
        return bakePatternLayer(tinted, w + margin * 2, h + margin * 2, layer.scale, layer.blur);
      });
    }
  } else if (spaceStarsImg && spaceBgCache.starCanvases.length === 0) {
    // Stars loaded after dust, rebuild star layers only
    spaceBgCache.starCanvases = STAR_DEPTH_LAYERS.map(layer => {
      const tinted = tintStars(spaceStarsImg!, STAR_TINTS[layer.tint % STAR_TINTS.length]);
      const margin = 200;
      return bakePatternLayer(tinted, w + margin * 2, h + margin * 2, layer.scale, layer.blur);
    });
  }

  return spaceBgCache;
}

/** @deprecated Use getSpaceBgCache instead. Kept for test compatibility. */
export function getSpaceBgLayers(): { dust: HTMLImageElement | null; stars: HTMLCanvasElement[] } {
  loadSpaceBg();
  return { dust: spaceDustImg, stars: [] };
}

/**
 * Tile image cache. Maps tile ID to loaded HTMLImageElement, or null if
 * loading failed / no sprite exists for that tile.
 */
const tileImageCache = new Map<string, HTMLImageElement | null>();

/** Clear the tile image cache (e.g., when switching maps or reloading). */
export function clearTileImageCache(): void {
  tileImageCache.clear();
}

/**
 * Retrieve a cached tile image synchronously.
 * If the image hasn't been requested yet, kicks off an async load and
 * returns null (the next render frame will pick it up once loaded).
 */
function getTileImage(
  tileId: string,
  registry: IPrototypeRegistry,
): HTMLImageElement | null {
  if (tileImageCache.has(tileId)) return tileImageCache.get(tileId)!;

  const tile = registry.getTile(tileId);
  if (!tile || !tile.sprite) {
    tileImageCache.set(tileId, null);
    return null;
  }

  // Mark as loading (null placeholder) so we don't re-request
  tileImageCache.set(tileId, null);

  const provider = getActiveProvider();
  const url = provider.getImageUrl(tile.sprite);
  if (!url) {
    return null;
  }
  loadImage(url)
    .then((img) => {
      tileImageCache.set(tileId, img);
      markSceneDirty();
    })
    .catch(() => {
      tileImageCache.set(tileId, null);
    });

  return null;
}

/**
 * Get a simple fallback color for a tile when no texture is available.
 */
function getFallbackColor(tileId: string): string {
  if (tileId === 'Space') return FALLBACK_COLORS.Space;
  if (tileId.startsWith('Wall')) return FALLBACK_COLORS.wall;
  return FALLBACK_COLORS.fallback;
}

/**
 * Render the tile grid onto a canvas.
 */
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  grid: TileGrid,
  camera: Camera,
  canvasW: number,
  canvasH: number,
  registry: IPrototypeRegistry | null,
): void {
  // Clear tile layer (background drawn separately on main canvas)
  ctx.clearRect(0, 0, canvasW, canvasH);

  const tileScreenSize = camera.tileScreenSize;

  // Compute visible world-coordinate range for culling
  const topLeft = camera.screenToTile(0, 0, canvasW, canvasH);
  const bottomRight = camera.screenToTile(canvasW, canvasH, canvasW, canvasH);
  const visMinWorldX = Math.floor(Math.min(topLeft.x, bottomRight.x)) - 1;
  const visMaxWorldX = Math.ceil(Math.max(topLeft.x, bottomRight.x)) + 1;
  const visMinWorldY = Math.floor(Math.min(topLeft.y, bottomRight.y)) - 1;
  const visMaxWorldY = Math.ceil(Math.max(topLeft.y, bottomRight.y)) + 1;

  // Clamp to grid bounds (convert world to grid-local)
  const startX = Math.max(0, visMinWorldX - grid.offsetX);
  const endX = Math.min(grid.width, visMaxWorldX - grid.offsetX + 1);
  const startY = Math.max(0, visMinWorldY - grid.offsetY);
  const endY = Math.min(grid.height, visMaxWorldY - grid.offsetY + 1);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const cell = grid.cells[y * grid.width + x];
      if (!cell || cell.tileId === 'Space') continue;

      const worldX = x + grid.offsetX;
      const worldY = y + grid.offsetY;
      const drawX = camera.worldToScreenX(worldX, canvasW);
      const drawY = camera.worldToScreenY(worldY, canvasH);

      // Try to get a real texture from the registry
      const img = registry ? getTileImage(cell.tileId, registry) : null;

      if (img) {
        // Determine variant count from registry
        const tile = registry!.getTile(cell.tileId);
        const variants = tile ? tile.variants : 1;
        const variant = variants > 1
          ? ((x * 7 + y * 13) & 0x7fffffff) % variants
          : 0;
        const srcSize = img.width / variants;

        ctx.drawImage(
          img,
          variant * srcSize, 0, srcSize, img.height,
          drawX, drawY, tileScreenSize, tileScreenSize,
        );
      } else {
        // Fallback: solid color fill
        ctx.fillStyle = getFallbackColor(cell.tileId);
        ctx.fillRect(drawX, drawY, tileScreenSize, tileScreenSize);
      }
    }
  }
}
