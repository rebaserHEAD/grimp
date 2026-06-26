import type { ITool, ToolContext } from './toolTypes';
import type { ImportedEntity } from '../import/mapImporter';
import type { IPrototypeRegistry } from '../loaders/registryTypes';
import { getEntitiesAtTile } from '../rendering/entityRenderer';

type LinkMode = 'idle' | 'linking';

export class DeviceLinkTool implements ITool {
  name = 'deviceLink';
  cursor = 'crosshair';

  private mode: LinkMode = 'idle';
  private sourceEntity: ImportedEntity | null = null;
  private linkType: 'DeviceList' | 'DeviceLinkSource' | null = null;
  private cursorX = 0;
  private cursorY = 0;

  // ---- Component helpers ----

  /** Check entity instance components, then fall back to prototype definition. */
  private getDeviceListComponent(entity: ImportedEntity, registry?: IPrototypeRegistry | null): Record<string, unknown> | null {
    for (const comp of entity.components) {
      const c = comp as Record<string, unknown>;
      if (c.type === 'DeviceList') return c;
    }
    // Check prototype, entity may not have the component on its instance
    if (registry) {
      const resolved = registry.getEntity(entity.prototype);
      if (resolved?.components.some(c => c.type === 'DeviceList')) {
        // Return a stub so the caller knows the prototype has it
        return { type: 'DeviceList', devices: [] };
      }
    }
    return null;
  }

  /** Check entity instance components, then fall back to prototype definition. */
  private getDeviceLinkSourceComponent(entity: ImportedEntity, registry?: IPrototypeRegistry | null): Record<string, unknown> | null {
    for (const comp of entity.components) {
      const c = comp as Record<string, unknown>;
      if (c.type === 'DeviceLinkSource') return c;
    }
    // Check prototype
    if (registry) {
      const resolved = registry.getEntity(entity.prototype);
      if (resolved?.components.some(c => c.type === 'DeviceLinkSource')) {
        return { type: 'DeviceLinkSource', linkedPorts: {} };
      }
    }
    return null;
  }

  private isLinkableSource(entity: ImportedEntity, registry?: IPrototypeRegistry | null): boolean {
    return this.getDeviceListComponent(entity, registry) !== null
      || this.getDeviceLinkSourceComponent(entity, registry) !== null;
  }

  private addToDeviceList(source: ImportedEntity, targetUid: number): ImportedEntity {
    const hasComp = source.components.some(c => (c as Record<string, unknown>).type === 'DeviceList');
    if (hasComp) {
      const newComponents = source.components.map(comp => {
        const c = comp as Record<string, unknown>;
        if (c.type !== 'DeviceList') return comp;
        const devices = Array.isArray(c.devices) ? [...c.devices] : [];
        if (!devices.includes(targetUid)) devices.push(targetUid);
        return { ...c, devices } as Record<string, unknown>;
      });
      return { ...source, components: newComponents };
    }
    // Component exists on prototype but not on instance, add it
    return {
      ...source,
      components: [...source.components, { type: 'DeviceList', devices: [targetUid] }],
    };
  }

  private removeFromDeviceList(source: ImportedEntity, targetUid: number): ImportedEntity {
    const newComponents = source.components.map(comp => {
      const c = comp as Record<string, unknown>;
      if (c.type !== 'DeviceList') return comp;
      const devices = Array.isArray(c.devices)
        ? c.devices.filter((uid: unknown) => uid !== targetUid)
        : [];
      return { ...c, devices } as Record<string, unknown>;
    });
    return { ...source, components: newComponents };
  }

  private addToDeviceLinkSource(source: ImportedEntity, targetUid: number): ImportedEntity {
    const hasComp = source.components.some(c => (c as Record<string, unknown>).type === 'DeviceLinkSource');
    if (hasComp) {
      const newComponents = source.components.map(comp => {
        const c = comp as Record<string, unknown>;
        if (c.type !== 'DeviceLinkSource') return comp;
        const linkedPorts = (c.linkedPorts && typeof c.linkedPorts === 'object')
          ? { ...(c.linkedPorts as Record<string, [string, string][]>) }
          : {} as Record<string, [string, string][]>;
        const key = String(targetUid);
        if (!linkedPorts[key]) {
          linkedPorts[key] = [['Pressed', 'Toggle']];
        }
        return { ...c, linkedPorts } as Record<string, unknown>;
      });
      return { ...source, components: newComponents };
    }
    // Component exists on prototype but not on instance, add it
    return {
      ...source,
      components: [...source.components, {
        type: 'DeviceLinkSource',
        linkedPorts: { [String(targetUid)]: [['Pressed', 'Toggle']] },
      }],
    };
  }

  private removeFromDeviceLinkSource(source: ImportedEntity, targetUid: number): ImportedEntity {
    const newComponents = source.components.map(comp => {
      const c = comp as Record<string, unknown>;
      if (c.type !== 'DeviceLinkSource') return comp;
      if (!c.linkedPorts || typeof c.linkedPorts !== 'object') return comp;
      const linkedPorts = { ...(c.linkedPorts as Record<string, [string, string][]>) };
      delete linkedPorts[String(targetUid)];
      return { ...c, linkedPorts } as Record<string, unknown>;
    });
    return { ...source, components: newComponents };
  }

  private getLinkedTargetUids(entity: ImportedEntity, type: 'DeviceList' | 'DeviceLinkSource'): Set<number> {
    const uids = new Set<number>();
    if (type === 'DeviceList') {
      const comp = this.getDeviceListComponent(entity);
      if (comp && Array.isArray(comp.devices)) {
        for (const uid of comp.devices) {
          if (typeof uid === 'number') uids.add(uid);
        }
      }
    } else {
      const comp = this.getDeviceLinkSourceComponent(entity);
      if (comp && comp.linkedPorts && typeof comp.linkedPorts === 'object') {
        for (const key of Object.keys(comp.linkedPorts as Record<string, unknown>)) {
          const uid = parseInt(key, 10);
          if (!isNaN(uid)) uids.add(uid);
        }
      }
    }
    return uids;
  }

  /** Refresh the stored sourceEntity from current state (after a command mutates it). */
  private refreshSource(ctx: ToolContext): void {
    if (!this.sourceEntity) return;
    const fresh = ctx.state.entities.find(e => e.uid === this.sourceEntity!.uid);
    if (fresh) {
      this.sourceEntity = fresh;
    }
  }

  // ---- ITool interface ----

  onMouseDown(ctx: ToolContext, tileX: number, tileY: number, button: number): void {
    if (!ctx.state.registry) return;

    const entitiesAtTile = getEntitiesAtTile(tileX, tileY, ctx.state.entities, ctx.state.registry);

    if (this.mode === 'idle') {
      if (button === 0) {
        // Left click in idle: try to pick a source entity
        for (const entity of entitiesAtTile) {
          const dlComp = this.getDeviceListComponent(entity, ctx.state.registry);
          const dlsComp = this.getDeviceLinkSourceComponent(entity, ctx.state.registry);
          if (dlComp || dlsComp) {
            this.sourceEntity = entity;
            // Prefer DeviceList if both present
            this.linkType = dlComp ? 'DeviceList' : 'DeviceLinkSource';
            this.mode = 'linking';
            ctx.dispatch({ type: 'SELECT_ENTITY', uids: [entity.uid] });
            return;
          }
        }
      }
      if (button === 2) {
        ctx.dispatch({ type: 'SELECT_ENTITY', uids: [] });
      }
      return;
    }

    // mode === 'linking'
    if (button === 0) {
      if (entitiesAtTile.length === 0) {
        // Click empty space: cancel linking
        this.cancelLinking();
        ctx.dispatch({ type: 'SELECT_ENTITY', uids: [] });
        return;
      }

      // Add target link
      const target = entitiesAtTile[0];
      if (target.uid === this.sourceEntity!.uid) return; // can't link to self

      this.refreshSource(ctx);
      const source = this.sourceEntity!;

      // Check if already linked
      const existing = this.getLinkedTargetUids(source, this.linkType!);
      if (existing.has(target.uid)) return; // already linked

      const modified = this.linkType === 'DeviceList'
        ? this.addToDeviceList(source, target.uid)
        : this.addToDeviceLinkSource(source, target.uid);

      const label = this.linkType === 'DeviceList'
        ? `Link ${source.prototype} -> ${target.prototype} (DeviceList)`
        : `Link ${source.prototype} -> ${target.prototype} (DeviceLinkSource)`;

      ctx.dispatch({
        type: 'APPLY_COMMAND',
        command: {
          label,
          tileChanges: [],
          entityChanges: [
            { action: 'remove', entity: source },
            { action: 'add', entity: modified },
          ],
        },
      });

      // Update stored source with the modified version
      this.sourceEntity = modified;
      return;
    }

    if (button === 2) {
      if (entitiesAtTile.length === 0) {
        this.cancelLinking();
        ctx.dispatch({ type: 'SELECT_ENTITY', uids: [] });
        return;
      }

      // Right click on entity: remove link
      const target = entitiesAtTile[0];
      this.refreshSource(ctx);
      const source = this.sourceEntity!;

      const existing = this.getLinkedTargetUids(source, this.linkType!);
      if (!existing.has(target.uid)) return; // not linked

      const modified = this.linkType === 'DeviceList'
        ? this.removeFromDeviceList(source, target.uid)
        : this.removeFromDeviceLinkSource(source, target.uid);

      const label = this.linkType === 'DeviceList'
        ? `Unlink ${source.prototype} -x- ${target.prototype} (DeviceList)`
        : `Unlink ${source.prototype} -x- ${target.prototype} (DeviceLinkSource)`;

      ctx.dispatch({
        type: 'APPLY_COMMAND',
        command: {
          label,
          tileChanges: [],
          entityChanges: [
            { action: 'remove', entity: source },
            { action: 'add', entity: modified },
          ],
        },
      });

      this.sourceEntity = modified;
    }
  }

  onMouseMove(_ctx: ToolContext, tileX: number, tileY: number): void {
    this.cursorX = tileX;
    this.cursorY = tileY;
  }

  onMouseUp(_ctx: ToolContext, _tileX: number, _tileY: number): void {
    // No drag behavior
  }

  renderPreview(
    canvasCtx: CanvasRenderingContext2D,
    toolCtx: ToolContext,
    cursorTileX: number,
    cursorTileY: number,
  ): void {
    const { state, camera, canvasW, canvasH } = toolCtx;
    const tileScreenSize = camera.tileScreenSize;

    if (this.mode === 'idle') {
      // Highlight all valid source entities with a subtle green outline
      for (const entity of state.entities) {
        if (!this.isLinkableSource(entity, state.registry)) continue;
        const ex = Math.floor(entity.position.x);
        const ey = Math.floor(entity.position.y);
        const sx = camera.worldToScreenX(ex, canvasW);
        const sy = camera.worldToScreenY(ey, canvasH);
        canvasCtx.strokeStyle = 'rgba(80, 200, 80, 0.4)';
        canvasCtx.lineWidth = 1;
        canvasCtx.strokeRect(sx + 1, sy + 1, tileScreenSize - 2, tileScreenSize - 2);
      }
      return;
    }

    // mode === 'linking'
    if (!this.sourceEntity) return;

    const sourceX = Math.floor(this.sourceEntity.position.x);
    const sourceY = Math.floor(this.sourceEntity.position.y);

    // Source entity: pulsing bright outline
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 200);
    const ssx = camera.worldToScreenX(sourceX, canvasW);
    const ssy = camera.worldToScreenY(sourceY, canvasH);
    canvasCtx.strokeStyle = `rgba(80, 255, 80, ${pulse})`;
    canvasCtx.lineWidth = 3;
    canvasCtx.strokeRect(ssx, ssy, tileScreenSize, tileScreenSize);

    // Get currently linked targets
    const linkedUids = this.getLinkedTargetUids(this.sourceEntity, this.linkType!);

    // Highlight entities: green for valid targets, cyan for already-linked
    for (const entity of state.entities) {
      if (entity.uid === this.sourceEntity.uid) continue;
      const ex = Math.floor(entity.position.x);
      const ey = Math.floor(entity.position.y);
      const sx = camera.worldToScreenX(ex, canvasW);
      const sy = camera.worldToScreenY(ey, canvasH);

      if (linkedUids.has(entity.uid)) {
        // Already linked: cyan outline
        canvasCtx.strokeStyle = 'rgba(0, 220, 220, 0.7)';
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeRect(sx + 1, sy + 1, tileScreenSize - 2, tileScreenSize - 2);
      }
    }

    // Dashed line from source to cursor
    const sourceCenterX = ssx + tileScreenSize / 2;
    const sourceCenterY = ssy + tileScreenSize / 2;
    const cursorScreenX = camera.worldToScreenX(cursorTileX, canvasW) + tileScreenSize / 2;
    const cursorScreenY = camera.worldToScreenY(cursorTileY, canvasH) + tileScreenSize / 2;

    const lineColor = this.linkType === 'DeviceList' ? '#00cccc' : '#ff8800';
    canvasCtx.strokeStyle = lineColor;
    canvasCtx.lineWidth = 2;
    canvasCtx.setLineDash([6, 4]);
    canvasCtx.beginPath();
    canvasCtx.moveTo(sourceCenterX, sourceCenterY);
    canvasCtx.lineTo(cursorScreenX, cursorScreenY);
    canvasCtx.stroke();
    canvasCtx.setLineDash([]);
  }

  cancelLinking(): void {
    this.mode = 'idle';
    this.sourceEntity = null;
    this.linkType = null;
  }

  deactivate(): void {
    this.cancelLinking();
  }
}
