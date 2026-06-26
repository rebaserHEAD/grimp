import type { ImportedEntity } from '../import/mapImporter';
import { Camera } from './camera';
import { spatialGetInRect, spatialGetByUid } from './spatialIndex';

/** Cached Set to avoid re-allocating per frame when selection hasn't changed. */
let cachedSelectedRef: number[] | null = null;
let cachedSelectedSet: Set<number> = new Set();

function getCachedSelectedSet(uids: number[]): Set<number> {
  if (uids !== cachedSelectedRef) {
    cachedSelectedRef = uids;
    cachedSelectedSet = new Set(uids);
  }
  return cachedSelectedSet;
}

/** A connection line segment to be batched. */
interface ConnectionLine {
  sx: number; sy: number;  // source screen coords
  tx: number; ty: number;  // target screen coords
}

/**
 * Render connection lines between linked entities.
 * Uses batched rendering, all lines of the same style drawn in a single canvas path.
 *
 * When selectedEntityUids is non-empty, connections from selected entities are
 * highlighted (thick, full opacity, arrows) and all others are dimmed.
 */
export function renderConnections(
  ctx: CanvasRenderingContext2D,
  entities: ImportedEntity[],
  camera: Camera,
  canvasW: number,
  canvasH: number,
  selectedEntityUids: number[] = [],
): void {
  const tileScreenSize = camera.tileScreenSize;

  // Skip connections entirely when zoomed out too far
  if (tileScreenSize < 4) return;

  // Viewport bounds for spatial query
  const topLeft = camera.screenToTile(0, 0, canvasW, canvasH);
  const bottomRight = camera.screenToTile(canvasW, canvasH, canvasW, canvasH);
  const visMinX = Math.floor(Math.min(topLeft.x, bottomRight.x)) - 1;
  const visMaxX = Math.ceil(Math.max(topLeft.x, bottomRight.x)) + 1;
  const visMinY = Math.floor(Math.min(topLeft.y, bottomRight.y)) - 1;
  const visMaxY = Math.ceil(Math.max(topLeft.y, bottomRight.y)) + 1;
  const visibleEntities = spatialGetInRect(visMinX, visMinY, visMaxX, visMaxY);

  const hasSelection = selectedEntityUids.length > 0;
  const selectedSet = getCachedSelectedSet(selectedEntityUids);

  // Pass 1: Collect all connection lines into batches
  const deviceListUnselected: ConnectionLine[] = [];
  const deviceListSelected: ConnectionLine[] = [];
  const deviceLinkUnselected: ConnectionLine[] = [];
  const deviceLinkSelected: ConnectionLine[] = [];

  // Track link counts per entity for badges
  const deviceListCounts = new Map<number, number>();
  const deviceLinkSourceCounts = new Map<number, number>();

  for (const entity of visibleEntities) {
    const sourcePos = entity.position;
    const sx = camera.worldToScreenX(Math.floor(sourcePos.x), canvasW) + tileScreenSize / 2;
    const sy = camera.worldToScreenY(Math.floor(sourcePos.y), canvasH) + tileScreenSize / 2;
    const isSelected = selectedSet.has(entity.uid);

    for (const comp of entity.components) {
      const c = comp as Record<string, unknown>;

      // DeviceList, air alarm → vents/scrubbers (cyan)
      if (c.type === 'DeviceList' && Array.isArray(c.devices)) {
        const count = c.devices.length;
        if (count > 0) {
          deviceListCounts.set(entity.uid, (deviceListCounts.get(entity.uid) ?? 0) + count);
        }

        const bucket = (hasSelection && isSelected) ? deviceListSelected : deviceListUnselected;
        for (const targetUid of c.devices) {
          const targetEntity = spatialGetByUid(targetUid as number);
          if (!targetEntity) continue;
          const tx = camera.worldToScreenX(Math.floor(targetEntity.position.x), canvasW) + tileScreenSize / 2;
          const ty = camera.worldToScreenY(Math.floor(targetEntity.position.y), canvasH) + tileScreenSize / 2;
          bucket.push({ sx, sy, tx, ty });
        }
      }

      // DeviceLinkSource, door pairs, buttons → shutters (orange)
      if (c.type === 'DeviceLinkSource' && c.linkedPorts && typeof c.linkedPorts === 'object') {
        const linkedPorts = c.linkedPorts as Record<string, unknown>;
        const portKeys = Object.keys(linkedPorts);
        if (portKeys.length > 0) {
          deviceLinkSourceCounts.set(entity.uid, (deviceLinkSourceCounts.get(entity.uid) ?? 0) + portKeys.length);
        }

        const bucket = (hasSelection && isSelected) ? deviceLinkSelected : deviceLinkUnselected;
        for (const targetUidStr of portKeys) {
          const targetUid = parseInt(targetUidStr, 10);
          if (isNaN(targetUid)) continue;
          const targetEntity = spatialGetByUid(targetUid);
          if (!targetEntity) continue;
          const tx = camera.worldToScreenX(Math.floor(targetEntity.position.x), canvasW) + tileScreenSize / 2;
          const ty = camera.worldToScreenY(Math.floor(targetEntity.position.y), canvasH) + tileScreenSize / 2;
          bucket.push({ sx, sy, tx, ty });
        }
      }
    }
  }

  ctx.save();

  // Pass 2: Draw unselected connections (thin, low alpha)
  if (!hasSelection) {
    // No selection, show all at medium visibility
    drawBatch(ctx, deviceListUnselected, '#00cccc', 1.5, 0.4);
    drawBatch(ctx, deviceLinkUnselected, '#ff8800', 1.5, 0.4);
  } else {
    // Has selection, dim unselected
    drawBatch(ctx, deviceListUnselected, '#00cccc', 1, 0.15);
    drawBatch(ctx, deviceLinkUnselected, '#ff8800', 1, 0.15);
  }

  // Pass 3: Draw selected connections (thick, full opacity, with arrows)
  if (deviceListSelected.length > 0) {
    drawBatch(ctx, deviceListSelected, '#00ffff', 3, 1.0);
    drawArrows(ctx, deviceListSelected, '#00ffff');
  }
  if (deviceLinkSelected.length > 0) {
    drawBatch(ctx, deviceLinkSelected, '#ffaa00', 3, 1.0);
    drawArrows(ctx, deviceLinkSelected, '#ffaa00');
  }

  // Pass 4: Connection count badges (only when zoomed in enough)
  if (tileScreenSize >= 16) {
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = tileScreenSize >= 24 ? 9 : 8;
    ctx.font = `bold ${fontSize}px sans-serif`;
    const badgeRadius = fontSize * 0.7;

    for (const [uid, count] of deviceListCounts) {
      drawBadge(ctx, uid, count, '#00cccc', badgeRadius, camera, canvasW, canvasH, tileScreenSize);
    }
    for (const [uid, count] of deviceLinkSourceCounts) {
      const hasDeviceList = deviceListCounts.has(uid);
      drawBadge(ctx, uid, count, '#ff8800', badgeRadius, camera, canvasW, canvasH, tileScreenSize, hasDeviceList ? badgeRadius * 2.2 : 0);
    }
  }

  ctx.restore();
}

/** Draw a batch of connection lines with a single beginPath/stroke call. */
function drawBatch(
  ctx: CanvasRenderingContext2D,
  lines: ConnectionLine[],
  color: string,
  lineWidth: number,
  alpha: number,
): void {
  if (lines.length === 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (const { sx, sy, tx, ty } of lines) {
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
  }
  ctx.stroke();
}

/** Draw directional arrows at midpoints of selected connection lines. */
function drawArrows(
  ctx: CanvasRenderingContext2D,
  lines: ConnectionLine[],
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1;
  const headLen = 8;

  ctx.beginPath();
  for (const { sx, sy, tx, ty } of lines) {
    const midX = (sx + tx) / 2;
    const midY = (sy + ty) / 2;
    const angle = Math.atan2(ty - sy, tx - sx);

    ctx.moveTo(midX - headLen * Math.cos(angle - Math.PI / 6), midY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(midX, midY);
    ctx.lineTo(midX - headLen * Math.cos(angle + Math.PI / 6), midY - headLen * Math.sin(angle + Math.PI / 6));
  }
  ctx.stroke();
}

/** Draw a connection count badge on an entity. */
function drawBadge(
  ctx: CanvasRenderingContext2D,
  uid: number, count: number, color: string,
  badgeRadius: number,
  camera: Camera, canvasW: number, canvasH: number,
  tileScreenSize: number,
  yOffset: number = 0,
): void {
  const ent = spatialGetByUid(uid);
  if (!ent) return;
  const pos = ent.position;
  const bx = camera.worldToScreenX(Math.floor(pos.x), canvasW) + tileScreenSize - badgeRadius;
  const by = camera.worldToScreenY(Math.floor(pos.y), canvasH) + badgeRadius + yOffset;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(bx, by, badgeRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(count), bx, by);
}
