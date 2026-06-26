import type { ImportedEntity } from '../import/mapImporter';
import type { IPrototypeRegistry } from '../loaders/registryTypes';
import type { WallSegmentCache } from './wallSegments';
import { excludeTileEdges } from './wallSegments';
import { computeVisibilityPolygon } from './visibility';
import { spatialGetInRect } from './spatialIndex';

export interface GradientStop {
  offset: number; // 0-1
  color: string;  // rgba() string
}

export interface LightInfo {
  color: string;
  radius: number;
  energy: number;
  softness: number;
  falloff: number;
  offset: { x: number; y: number };
  enabled: boolean;
}

const DEFAULTS: LightInfo = {
  color: '#FFFFFF',
  radius: 5,
  energy: 1.0,
  softness: 1.0,
  falloff: 6.8,
  offset: { x: 0, y: 0 },
  enabled: true,
};

function parseOffset(raw: unknown): { x: number; y: number } {
  if (typeof raw === 'string') {
    const parts = raw.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { x: parts[0], y: parts[1] };
    }
  }
  if (raw && typeof raw === 'object' && 'x' in raw && 'y' in raw) {
    return { x: Number((raw as any).x), y: Number((raw as any).y) };
  }
  return { x: 0, y: 0 };
}

/**
 * Extract merged light info from an entity's PointLight component.
 * Instance component fields override prototype fields; missing fields
 * fall back to defaults.
 * Returns null if neither instance nor prototype has PointLight.
 */
export function extractLightInfo(
  entity: ImportedEntity,
  registry: IPrototypeRegistry | null,
): LightInfo | null {
  const instanceComp = entity.components.find(
    c => (c as Record<string, unknown>).type === 'PointLight',
  ) as Record<string, unknown> | undefined;

  let protoComp: Record<string, unknown> | undefined;
  if (registry) {
    const resolved = registry.getEntity(entity.prototype);
    if (resolved) {
      protoComp = resolved.components.find(c => c.type === 'PointLight') as
        Record<string, unknown> | undefined;
    }
  }

  if (!instanceComp && !protoComp) return null;

  // Merge: instance overrides prototype overrides defaults
  const merged = { ...protoComp, ...instanceComp };

  return {
    color: typeof merged.color === 'string' ? merged.color : DEFAULTS.color,
    radius: typeof merged.radius === 'number' ? merged.radius : DEFAULTS.radius,
    energy: typeof merged.energy === 'number' ? merged.energy : DEFAULTS.energy,
    softness: typeof merged.softness === 'number' ? merged.softness : DEFAULTS.softness,
    falloff: typeof merged.falloff === 'number' ? merged.falloff : DEFAULTS.falloff,
    offset: merged.offset !== undefined ? parseOffset(merged.offset) : DEFAULTS.offset,
    enabled: typeof merged.enabled === 'boolean' ? merged.enabled : DEFAULTS.enabled,
  };
}

/**
 * SS14 light attenuation formula from light_shared.swsl:
 *   sqr_dist = dot(diff, diff) + 1.0  (LIGHTING_HEIGHT prevents singularity)
 *   s = clamp(sqrt(sqr_dist) / range, 0, 1)
 *   val = ((1 - s²)²) / (1 + falloff * s)   [when curveFactor = 0]
 *   val *= energy
 *
 * We sample this at multiple points to build a radial gradient approximation.
 */
function ss14Attenuation(s: number, falloff: number): number {
  // s is normalized distance [0, 1] where 0 = light center, 1 = light radius edge
  // Add LIGHTING_HEIGHT effect: at s=0 the actual distance isn't 0 but sqrt(1)/range
  // For simplicity we approximate the center value as ~1.0 (the height offset has minimal visual impact)
  const s2 = s * s;
  const numerator = (1 - s2) * (1 - s2);
  const denominator = 1 + falloff * s; // curveFactor=0 default
  return Math.max(numerator / denominator, 0);
}

/** Number of gradient stops to approximate the SS14 attenuation curve */
const GRADIENT_SAMPLES = 8;

/**
 * Compute radial gradient color stops for a point light.
 * Approximates SS14's attenuation curve using sampled gradient stops.
 * Energy scales brightness. Falloff controls curve steepness (default 6.8).
 */
export function computeGradientStops(
  hexColor: string,
  energy: number,
  falloff: number,
): GradientStop[] {
  const r = parseInt(hexColor.slice(1, 3), 16) || 0;
  const g = parseInt(hexColor.slice(3, 5), 16) || 0;
  const b = parseInt(hexColor.slice(5, 7), 16) || 0;

  const stops: GradientStop[] = [];
  for (let i = 0; i < GRADIENT_SAMPLES; i++) {
    const s = i / (GRADIENT_SAMPLES - 1); // 0 to 1
    const attenuation = ss14Attenuation(s, falloff);
    const alpha = Math.min(attenuation * energy, 1.0);
    stops.push({
      offset: s,
      color: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(4)})`,
    });
  }
  return stops;
}

/** Ambient darkness opacity (how dark unlit areas appear) */
const AMBIENT_DARKNESS = 0.6;

/** Maximum light radius margin (tiles) for spatial query expansion */
const MAX_LIGHT_RADIUS_MARGIN = 30;

export interface VisibleLight {
  lx: number;
  ly: number;
  radiusPx: number;
  light: LightInfo;
  worldX: number;
  worldY: number;
  entityTileX: number;
  entityTileY: number;
}

/**
 * Collect lights visible in the current viewport using the spatial index.
 * Uses spatialGetInRect() to avoid iterating all entities.
 */
export function collectVisibleLights(
  registry: IPrototypeRegistry | null,
  camera: { x: number; y: number; tileScreenSize: number },
  canvasW: number,
  canvasH: number,
): VisibleLight[] {
  const tileSize = camera.tileScreenSize;

  // Compute viewport bounds in world coordinates
  const vpHalfW = canvasW / tileSize / 2;
  const vpHalfH = canvasH / tileSize / 2;
  const minX = Math.floor(camera.x - vpHalfW - MAX_LIGHT_RADIUS_MARGIN);
  const maxX = Math.ceil(camera.x + vpHalfW + MAX_LIGHT_RADIUS_MARGIN);
  const minY = Math.floor(camera.y - vpHalfH - MAX_LIGHT_RADIUS_MARGIN);
  const maxY = Math.ceil(camera.y + vpHalfH + MAX_LIGHT_RADIUS_MARGIN);

  const candidates = spatialGetInRect(minX, minY, maxX, maxY);

  const visibleLights: VisibleLight[] = [];

  for (const entity of candidates) {
    const light = extractLightInfo(entity, registry);
    if (!light || !light.enabled) continue;

    const radiusPx = light.radius * tileSize;
    if (radiusPx < 1) continue;

    // Convert entity world pos to screen pos (matches Camera.worldToScreenX/Y)
    // worldToScreenX(wx, W) = (wx - camX) * tileSize + W/2
    // worldToScreenY(wy, H) = -(wy + 1 - camY) * tileSize + H/2
    const cx = (entity.position.x - camera.x) * tileSize + canvasW / 2 + tileSize / 2;
    const cy = -(entity.position.y + 1 - camera.y) * tileSize + canvasH / 2 + tileSize / 2;

    const cos = Math.cos(-entity.rotation);
    const sin = Math.sin(-entity.rotation);
    const worldOffX = light.offset.x * cos - light.offset.y * sin;
    const worldOffY = light.offset.x * sin + light.offset.y * cos;
    const lx = cx + worldOffX * tileSize;
    const ly = cy + worldOffY * tileSize;

    // Frustum cull: skip if light circle is fully outside canvas
    if (lx + radiusPx < 0 || lx - radiusPx > canvasW ||
      ly + radiusPx < 0 || ly - radiusPx > canvasH) continue;

    visibleLights.push({
      lx, ly, radiusPx, light,
      worldX: entity.position.x + 0.5 + worldOffX,
      worldY: entity.position.y + 0.5 + worldOffY,
      entityTileX: Math.floor(entity.position.x),
      entityTileY: Math.floor(entity.position.y),
    });
  }

  return visibleLights;
}

/**
 * Clip the canvas rendering to the visibility polygon for a light source.
 * This prevents light from bleeding through walls.
 */
function clipToVisibility(
  ctx: CanvasRenderingContext2D,
  worldX: number, worldY: number,
  radius: number,
  wallCache: WallSegmentCache,
  camera: { worldToScreenX(wx: number, w: number): number; worldToScreenY(wy: number, h: number): number; zoom: number },
  canvasW: number, canvasH: number,
  tileSize: number,
  entityTileX: number, entityTileY: number,
): void {
  const nearbySegments = wallCache.getSegmentsInRadius(worldX, worldY, radius);
  if (nearbySegments.length === 0) return; // No clip needed, no nearby walls

  // Exclude wall edges belonging to the light's own tile to prevent self-shadowing.
  // Wall-mounted lights (e.g. PoweredLight) sit on the same tile as the wall,
  // without this exclusion, the light's own wall would block all its output.
  const filtered = excludeTileEdges(nearbySegments, entityTileX, entityTileY);
  if (filtered.length === 0) return; // Only the light's own wall was nearby

  const poly = computeVisibilityPolygon(worldX, worldY, radius, filtered);
  if (poly.length < 3) return;

  ctx.beginPath();
  const first = poly[0];
  ctx.moveTo(
    camera.worldToScreenX(first.x - 0.5, canvasW) + tileSize / 2,
    camera.worldToScreenY(first.y - 0.5, canvasH) + tileSize / 2,
  );
  for (let i = 1; i < poly.length; i++) {
    ctx.lineTo(
      camera.worldToScreenX(poly[i].x - 0.5, canvasW) + tileSize / 2,
      camera.worldToScreenY(poly[i].y - 0.5, canvasH) + tileSize / 2,
    );
  }
  ctx.closePath();
  ctx.clip();
}

/**
 * Render the lightmap onto the provided canvas context.
 *
 * Two-pass approach:
 * Pass 1, Darkness: Semi-transparent black overlay + destination-out to cut light holes
 * Pass 2, Color tint: Additive ('lighter') colored gradients for light color
 *
 * Composited onto scene via 'multiply' by the caller (EditorCanvas).
 */
export function renderLightmap(
  ctx: CanvasRenderingContext2D,
  entities: readonly ImportedEntity[],
  registry: IPrototypeRegistry | null,
  camera: { x: number; y: number; worldToScreenX(wx: number, w: number): number; worldToScreenY(wy: number, h: number): number; zoom: number },
  canvasW: number,
  canvasH: number,
  wallCache?: WallSegmentCache,
): void {
  const tileSize = 32 * camera.zoom;

  // Collect visible lights using spatial index
  const visibleLights = collectVisibleLights(
    registry,
    { x: camera.x, y: camera.y, tileScreenSize: tileSize },
    canvasW, canvasH,
  );

  // === Pass 1: Darkness overlay ===
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(0, 0, 0, ${AMBIENT_DARKNESS})`;
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.globalCompositeOperation = 'destination-out';
  for (const { lx, ly, radiusPx, light, worldX, worldY, entityTileX, entityTileY } of visibleLights) {
    ctx.save();
    if (wallCache && wallCache.segments.length > 0) {
      clipToVisibility(ctx, worldX, worldY, light.radius, wallCache, camera, canvasW, canvasH, tileSize, entityTileX, entityTileY);
    }
    const stops = computeGradientStops('#FFFFFF', light.energy, light.falloff);
    const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, radiusPx);
    for (const stop of stops) {
      grad.addColorStop(stop.offset, stop.color);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(lx - radiusPx, ly - radiusPx, radiusPx * 2, radiusPx * 2);
    ctx.restore();
  }

  // === Pass 2: Color tint ===
  ctx.globalCompositeOperation = 'lighter';
  for (const { lx, ly, radiusPx, light, worldX, worldY, entityTileX, entityTileY } of visibleLights) {
    ctx.save();
    if (wallCache && wallCache.segments.length > 0) {
      clipToVisibility(ctx, worldX, worldY, light.radius, wallCache, camera, canvasW, canvasH, tileSize, entityTileX, entityTileY);
    }
    const stops = computeGradientStops(light.color, light.energy * 0.4, light.falloff);
    const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, radiusPx);
    for (const stop of stops) {
      grad.addColorStop(stop.offset, stop.color);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(lx - radiusPx, ly - radiusPx, radiusPx * 2, radiusPx * 2);
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'source-over';
}
