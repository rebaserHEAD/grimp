import type { DecalInstance } from '../import/decalParser';
import type { IPrototypeRegistry } from '../loaders/registryTypes';
import type { Camera } from './camera';
import { markSceneDirty } from './dirtyFlags';
import { getActiveProvider } from '../loaders/resourceProvider';

// --- Sprite cache ---

const cache = new Map<string, HTMLImageElement | null>();
const loading = new Set<string>();

// --- Tint cache ---

const tintCache = new Map<string, HTMLCanvasElement>();

/**
 * Sort decals by zIndex ascending, then by id ascending as tiebreaker.
 * Returns a new array (does not mutate input).
 */
export function sortDecals(decals: DecalInstance[]): DecalInstance[] {
  return decals.slice().sort((a, b) => {
    if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
    return a.id - b.id;
  });
}

/** Clear the sprite and tint caches. */
export function clearDecalSpriteCache(): void {
  cache.clear();
  loading.clear();
  tintCache.clear();
}

export function getDecalSprite(
  prototypeId: string,
  registry: IPrototypeRegistry,
): HTMLImageElement | null {
  if (cache.has(prototypeId)) return cache.get(prototypeId)!;
  if (loading.has(prototypeId)) return null;

  const proto = registry.getDecal(prototypeId);
  if (!proto) {
    cache.set(prototypeId, null);
    return null;
  }

  if (!proto.state) {
    cache.set(prototypeId, null);
    return null;
  }

  loading.add(prototypeId);
  const provider = getActiveProvider();
  const rsi = proto.rsiPath;
  const path = rsi.startsWith('Textures/') ? `/${rsi}/${proto.state}.png` : `/Textures/${rsi}/${proto.state}.png`;
  const url = provider.getImageUrl(path);
  if (!url) {
    cache.set(prototypeId, null);
    loading.delete(prototypeId);
    return null;
  }
  const img = new Image();
  img.onload = () => {
    cache.set(prototypeId, img);
    loading.delete(prototypeId);
    markSceneDirty();
  };
  img.onerror = () => {
    cache.set(prototypeId, null);
    loading.delete(prototypeId);
  };
  img.src = url;
  return null;
}

function getTintedDecal(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const key = `${img.src}:${color}`;
  if (tintCache.has(key)) return tintCache.get(key)!;

  const rgbColor = color.length === 9 ? color.slice(0, 7) : color;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const octx = c.getContext('2d')!;
  octx.drawImage(img, 0, 0);
  octx.globalCompositeOperation = 'multiply';
  octx.fillStyle = rgbColor;
  octx.fillRect(0, 0, c.width, c.height);
  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(img, 0, 0);

  tintCache.set(key, c);
  return c;
}

/**
 * Render decals onto the given canvas context.
 *
 * Decals are sorted by zIndex, viewport-culled, color-tinted, and rotation-applied.
 */
export function renderDecals(
  ctx: CanvasRenderingContext2D,
  decals: DecalInstance[],
  camera: Camera,
  canvasW: number,
  canvasH: number,
  registry: IPrototypeRegistry | null,
): void {
  if (!registry || decals.length === 0) return;

  const sorted = sortDecals(decals);

  // Compute viewport bounds for culling
  const topLeft = camera.screenToTile(0, 0, canvasW, canvasH);
  const bottomRight = camera.screenToTile(canvasW, canvasH, canvasW, canvasH);
  const minX = Math.min(topLeft.x, bottomRight.x) - 1;
  const maxX = Math.max(topLeft.x, bottomRight.x) + 1;
  const minY = Math.min(topLeft.y, bottomRight.y) - 1;
  const maxY = Math.max(topLeft.y, bottomRight.y) + 1;

  const tileSize = camera.tileScreenSize;

  for (const decal of sorted) {
    const { position, prototypeId, color, angle } = decal;

    // Viewport culling
    if (position.x < minX || position.x > maxX || position.y < minY || position.y > maxY) {
      continue;
    }

    // Get sprite image
    const img = getDecalSprite(prototypeId, registry);
    if (!img) continue;

    // Determine what to draw (original or tinted)
    const drawable: HTMLImageElement | HTMLCanvasElement =
      color != null ? getTintedDecal(img, color) : img;

    // Apply alpha from color (#RRGGBBAA, last 2 hex chars)
    const hasAlpha = color != null && color.length === 9;
    if (hasAlpha) {
      const alpha = parseInt(color!.slice(7, 9), 16) / 255;
      ctx.save();
      ctx.globalAlpha = alpha;
    }

    // Screen position, decal coordinates are raw world positions (often integers
    // for snapped decals like "50,48"). Unlike entities whose positions are tile-center
    // (x.5, y.5), decal coordinates map directly to tile positions.
    // worldToScreenX/Y expect tile-origin coordinates, which is what decals use.
    const sx = camera.worldToScreenX(position.x, canvasW);
    const sy = camera.worldToScreenY(position.y, canvasH);

    if (angle !== 0) {
      // Rotation: save/translate/rotate/draw/restore
      ctx.save();
      ctx.translate(sx + tileSize / 2, sy + tileSize / 2);
      ctx.rotate(-angle);
      ctx.translate(-tileSize / 2, -tileSize / 2);
      ctx.drawImage(drawable, 0, 0, tileSize, tileSize);
      ctx.restore();
    } else {
      ctx.drawImage(drawable, sx, sy, tileSize, tileSize);
    }

    if (hasAlpha) {
      ctx.restore();
    }
  }
}
