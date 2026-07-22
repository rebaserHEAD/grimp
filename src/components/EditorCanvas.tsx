import React, { useRef, useCallback, useEffect, useState } from 'react';
import type { EditorState } from '../state/editorState';
import type { EditorAction } from '../state/actions';
import type { ITool, ToolContext } from '../tools/toolTypes';
import { Camera } from '../rendering/camera';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';
import { renderGrid, getSpaceBgCache, STAR_DEPTH_LAYERS } from '../rendering/gridRenderer';
import { renderSpaceClown, isClownActive } from '../rendering/spaceClown';
import { renderEntities, getEntitiesAtTile, isLayerVisible, getCachedDrawDepth } from '../rendering/entityRenderer';
import { EntitySelectTool } from '../tools/entitySelectTool';
import { EntityPlaceTool } from '../tools/entityPlaceTool';
import type { LayerVisibility } from '../rendering/entityRenderer';
import { renderConnections } from '../rendering/connectionRenderer';
import { renderDecals, getDecalSprite } from '../rendering/decalRenderer';
import { renderLightmap } from '../rendering/lightRenderer';
import { buildWallSegmentCache } from '../rendering/wallSegments';
import type { WallSegmentCache } from '../rendering/wallSegments';
import { LayerCompositor } from '../rendering/layerCompositor';
import { useAnimationFrame } from '../hooks/useAnimationFrame';
import { needsRedraw, markClean, markOverlayDirty, markAllDirty, markSceneDirty, isSceneDirty, isConnectionsDirty as isConnDirty } from '../rendering/dirtyFlags';
import { spatialGeneration } from '../rendering/spatialIndex';
import {
  statsFrameTick, statsFrameSkipped, statsFrameStart, statsFrameEnd,
  statsSetTotalEntities, statsSetSelectedCount, statsSetCamera,
  statsSetLayerRedraws, statsSetZoomDeferred,
} from '../rendering/renderStats';
import { benchmarkSample } from '../rendering/benchmarkCapture';
import type { DecalInstance } from '../import/decalParser';
import type { DecalPlacementSettings } from './DecalPalette';

interface Props {
  state: EditorState;
  dispatch: (action: EditorAction) => void;
  camera: Camera;
  activeTool: ITool | null;
  showEntities: boolean;
  showGrid: boolean;
  showSpaceBackground: boolean;
  isSpaceHeld: boolean;
  isRHeld: boolean;
  showSubFloor: boolean;
  layerVisibility: LayerVisibility;
  showConnections: boolean;
  lightingEnabled: boolean;
  decalPlacementSettingsRef: React.MutableRefObject<DecalPlacementSettings>;
  highlightTile?: { x: number; y: number; startTime: number } | null;
}

const TILE_SIZE = 32;

export const EditorCanvas: React.FC<Props> = ({
  state, dispatch, camera, activeTool, showEntities, showGrid, showSpaceBackground, isSpaceHeld, isRHeld,
  showSubFloor, layerVisibility, showConnections, lightingEnabled, decalPlacementSettingsRef, highlightTile,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const cursorTile = useRef({ x: 0, y: 0 });
  const cursorWorld = useRef({ x: 0, y: 0 });
  const prevCursorTile = useRef({ x: -9999, y: -9999 });
  const cachedHovered = useRef<import('../import/mapImporter').ImportedEntity[]>([]);
  const prevEntityRef = useRef<import('../import/mapImporter').ImportedEntity[]>([]);

  const compositorRef = useRef(new LayerCompositor());
  const zoomSettleTimer = useRef<number>(0);
  const lastZoom = useRef(camera.zoom);
  const lastRenderedSpatialGen = useRef(-1);

  const stateRef = useRef(state);
  stateRef.current = state;
  const toolRef = useRef(activeTool);
  toolRef.current = activeTool;
  const showEntitiesRef = useRef(showEntities);
  showEntitiesRef.current = showEntities;
  const showGridRef = useRef(showGrid);
  showGridRef.current = showGrid;
  const isSpaceHeldRef = useRef(isSpaceHeld);
  isSpaceHeldRef.current = isSpaceHeld;
  const isRHeldRef = useRef(isRHeld);
  isRHeldRef.current = isRHeld;
  const isShiftHeldRef = useRef(false);
  const isCtrlHeldRef = useRef(false);
  const showSubFloorRef = useRef(showSubFloor);
  showSubFloorRef.current = showSubFloor;
  const layerVisibilityRef = useRef(layerVisibility);
  layerVisibilityRef.current = layerVisibility;
  const showConnectionsRef = useRef(showConnections);
  showConnectionsRef.current = showConnections;
  const lightingRef = useRef(lightingEnabled);
  lightingRef.current = lightingEnabled;
  const highlightTileRef = useRef(highlightTile);
  highlightTileRef.current = highlightTile;
  const wallCacheRef = useRef<WallSegmentCache | null>(null);
  const wallCacheGenRef = useRef<number>(-1);
  const vignetteRef = useRef<{ gradient: CanvasGradient; w: number; h: number } | null>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  // Resize canvas to fill parent
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const obs = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
      compositorRef.current.resize(parent.clientWidth, parent.clientHeight, dpr);
      markAllDirty();
    });
    obs.observe(parent);
    return () => obs.disconnect();
  }, []);

  // Returns world tile coordinates (not grid-local)
  const screenToWorld = useCallback((screenX: number, screenY: number, precise = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cx = screenX - rect.left;
    const cy = screenY - rect.top;
    const tile = camera.screenToTile(cx, cy, canvas.clientWidth, canvas.clientHeight);
    if (precise) {
      return { x: tile.x, y: tile.y };
    }
    return {
      x: Math.floor(tile.x),
      y: Math.floor(tile.y),
    };
  }, [camera]);

  const getToolContext = useCallback((): ToolContext => {
    const canvas = canvasRef.current;
    return {
      state: stateRef.current,
      dispatch,
      camera,
      canvasW: canvas?.clientWidth ?? 0,
      canvasH: canvas?.clientHeight ?? 0,
      paletteItem: stateRef.current.selectedPaletteItem,
      shiftHeld: isShiftHeldRef.current,
      ctrlHeld: isCtrlHeldRef.current,
      decalSettings: decalPlacementSettingsRef.current,
      setDecalColor: (color: string | null) => {
        decalPlacementSettingsRef.current = { ...decalPlacementSettingsRef.current, color };
      },
      layerVisibility: layerVisibilityRef.current,
    };
  }, [dispatch, camera]);

  // Check if we should pan (middle button, space held, or pan tool active)
  const shouldPan = useCallback((button: number) => {
    return button === 1 || isSpaceHeldRef.current || toolRef.current?.name === 'pan';
  }, []);

  // Safety net: end panning on any release or focus loss anywhere, not just on
  // the canvas. A release over a side panel (or a pointer grab we didn't see)
  // would otherwise leave isPanning stuck on. Pan-only; tool drags are ended by
  // the canvas handlers.
  useEffect(() => {
    const endPan = () => { isPanning.current = false; };
    window.addEventListener('mouseup', endPan);
    window.addEventListener('blur', endPan);
    return () => {
      window.removeEventListener('mouseup', endPan);
      window.removeEventListener('blur', endPan);
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setContextMenu(null);
    if (shouldPan(e.button)) {
      // Middle-button mousedown otherwise triggers the browser's autoscroll,
      // which captures the pointer and swallows the matching mouseup, leaving
      // the pan stuck on (view drifts, clicks stop selecting).
      e.preventDefault();
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      return;
    }

    isShiftHeldRef.current = e.shiftKey;
    isCtrlHeldRef.current = e.ctrlKey || e.metaKey;
    markOverlayDirty();
    const tool = toolRef.current;

    // Snapped decal placement is handled by tools (paintTool, lineTool, etc.) via decalBrushHelper.
    // Free (non-snapped) decal placement is handled here since tools only receive integer coords.
    const s = stateRef.current;
    const decalSettings = decalPlacementSettingsRef.current;
    const decalFreePlace = !decalSettings.snap || e.shiftKey;
    if (s.selectedPaletteItem?.type === 'decal' && e.button === 0 && decalFreePlace) {
      const toolName = tool?.name ?? '';
      const canPlace = !['entitySelect', 'select', 'pan', 'pipeDraw', 'cableDraw', 'deviceLink'].includes(toolName);
      if (canPlace) {
        const world = screenToWorld(e.clientX, e.clientY, true);
        const activeGrid = s.grids[s.activeGridIndex];
        const decal: DecalInstance = {
          id: activeGrid.decals.nextDecalId,
          prototypeId: s.selectedPaletteItem.id,
          position: { x: world.x, y: world.y },
          color: decalSettings.color,
          angle: decalSettings.angle,
          zIndex: decalSettings.zIndex,
          cleanable: decalSettings.cleanable,
        };
        dispatch({
          type: 'APPLY_COMMAND',
          command: {
            label: `Place ${s.selectedPaletteItem.id}`,
            tileChanges: [],
            entityChanges: [],
            decalChanges: [{ action: 'add', decal }],
          },
        });
        markSceneDirty();
        return;
      }
    }

    // Free placement: fractional coords when Shift held + placement-compatible tool
    const usePrecise = e.shiftKey && (tool?.name === 'entityPlace' || tool?.name === 'entitySelect');
    const tile = screenToWorld(e.clientX, e.clientY, usePrecise);

    if (tool && tool instanceof EntitySelectTool) {
      if (e.shiftKey) {
        tool.onMouseDownWithShift(getToolContext(), tile.x, tile.y, e.button);
      } else if (e.ctrlKey || e.metaKey) {
        tool.onMouseDownWithCtrl(getToolContext(), tile.x, tile.y, e.button);
      } else {
        tool.onMouseDown(getToolContext(), tile.x, tile.y, e.button);
      }
    } else {
      tool?.onMouseDown(getToolContext(), tile.x, tile.y, e.button);
    }
  }, [screenToWorld, getToolContext, shouldPan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    isShiftHeldRef.current = e.shiftKey;
    isCtrlHeldRef.current = e.ctrlKey || e.metaKey;
    const tile = screenToWorld(e.clientX, e.clientY);
    const world = screenToWorld(e.clientX, e.clientY, true);
    cursorTile.current = tile;
    cursorWorld.current = world;
    markOverlayDirty();

    if (isPanning.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      camera.pan(dx, dy); // also marks cameraDirty
      lastMouse.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const moveTool = toolRef.current;
    const usePrecise = e.shiftKey && (moveTool?.name === 'entityPlace' || moveTool?.name === 'entitySelect');
    const moveCoord = usePrecise ? world : tile;
    moveTool?.onMouseMove(getToolContext(), moveCoord.x, moveCoord.y);
  }, [camera, screenToWorld, getToolContext]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    isShiftHeldRef.current = e.shiftKey;
    if (isPanning.current) {
      isPanning.current = false;
      return;
    }
    markOverlayDirty();
    const tool = toolRef.current;
    const usePrecise = e.shiftKey && (tool?.name === 'entityPlace' || tool?.name === 'entitySelect');
    const tile = screenToWorld(e.clientX, e.clientY, usePrecise);
    tool?.onMouseUp(getToolContext(), tile.x, tile.y);
  }, [screenToWorld, getToolContext]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // R + scroll: smooth fractional rotation
    if (isRHeldRef.current) {
      const tool = toolRef.current;
      const s = stateRef.current;
      // 5° per scroll notch (π/36), proportional for trackpads
      const deltaRadians = -(e.deltaY / 100) * (Math.PI / 36);

      // Rotate selected entities
      if (tool instanceof EntitySelectTool && s.selectedEntityUids.length > 0) {
        tool.smoothRotateSelected(getToolContext(), deltaRadians);
        markOverlayDirty();
        return;
      }

      // Rotate selected decals
      if (tool instanceof EntitySelectTool && s.selectedDecalIds.length > 0) {
        const activeGrid = s.grids[s.activeGridIndex];
        const selectedSet = new Set(s.selectedDecalIds);
        const decalChanges = activeGrid.decals.decals
          .filter(d => selectedSet.has(d.id))
          .map(d => ({
            action: 'update' as const,
            decal: { ...d, angle: d.angle + deltaRadians },
            previousDecal: d,
          }));
        if (decalChanges.length > 0) {
          dispatch({
            type: 'APPLY_COMMAND',
            command: { label: 'Rotate decals', tileChanges: [], entityChanges: [], decalChanges },
          });
        }
        markOverlayDirty();
        return;
      }

      // Rotate entity placement preview
      if (tool instanceof EntityPlaceTool) {
        tool.smoothRotate(deltaRadians);
        markOverlayDirty();
        return;
      }

      // Rotate decal placement angle
      if (s.selectedPaletteItem?.type === 'decal') {
        const settings = decalPlacementSettingsRef.current;
        decalPlacementSettingsRef.current = { ...settings, angle: settings.angle + deltaRadians };
        markOverlayDirty();
        return;
      }
    }

    // Let the active tool handle the wheel event first
    const tool = toolRef.current;
    if (tool?.onWheel) {
      const tile = screenToWorld(e.clientX, e.clientY);
      const handled = tool.onWheel(getToolContext(), tile.x, tile.y, e.deltaY);
      if (handled) return;
    }

    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    camera.zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
  }, [camera, screenToWorld, getToolContext]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const tile = screenToWorld(e.clientX, e.clientY);
    const tool = toolRef.current;
    if (tool?.getContextMenuItems) {
      const items = tool.getContextMenuItems(getToolContext(), tile.x, tile.y);
      if (items.length > 0) {
        setContextMenu({ x: e.clientX, y: e.clientY, items });
        return;
      }
    }
    setContextMenu(null);
  }, [screenToWorld, getToolContext]);

  // Determine cursor style
  const getCursor = () => {
    if (isSpaceHeld || activeTool?.name === 'pan') {
      return isPanning.current ? 'grabbing' : 'grab';
    }
    return activeTool?.cursor ?? 'default';
  };

  // Render loop
  useAnimationFrame((timestamp) => {
    statsFrameTick();

    const compositor = compositorRef.current;

    // Map global dirty flags to compositor layer invalidation.
    // NOTE: cameraDirty does NOT invalidate layers, camera changes are handled
    // by offset/scale compositing. Layers only re-render when content changes
    // (sceneDirty/connectionsDirty), pan exceeds margin, or zoom settles.
    if (isSceneDirty()) {
      compositor.invalidateTiles();
      compositor.invalidateDecals();
      compositor.invalidateEntities();
      compositor.invalidateLight();
      compositor.invalidateConnections();
    }
    if (isConnDirty()) {
      compositor.invalidateConnections();
    }

    // Safety: if the spatial index changed since last entity layer render,
    // force the entity layer to re-render.
    const curSpatialGen = spatialGeneration();
    if (curSpatialGen !== lastRenderedSpatialGen.current) {
      compositor.invalidateEntities();
      compositor.invalidateConnections();
      markSceneDirty();
    }

    const clownActive = isClownActive();
    if (!needsRedraw() && !clownActive) {
      statsFrameSkipped();
      benchmarkSample();
      return;
    }

    const frameStart = performance.now();
    statsFrameStart();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const s = stateRef.current;

    statsSetTotalEntities(s.entities.length);
    statsSetSelectedCount(s.selectedEntityUids.length);
    statsSetCamera(camera.zoom, camera.tileScreenSize);

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    // Ensure compositor is initialized (handles first frame before ResizeObserver fires)
    if (compositor.bufferWidth === 0) {
      compositor.resize(w, h, dpr);
      compositor.setCameraSnapshot(camera.x, camera.y, camera.zoom);
    }

    // Compute pan offset in the buffer's pixel space (using snapshot zoom, not current).
    // The cached layers were rendered at snapshotZoom, offsets must match that scale.
    const snapshotTileSize0 = 32 * compositor.snapshotZoom;
    const marginPxX = (compositor.bufferWidth - w) / 2;
    const marginPxY = (compositor.bufferHeight - h) / 2;

    // Check if pan exceeds margin → invalidate all layers
    const offsetX = (compositor.snapshotX - camera.x) * snapshotTileSize0;
    const offsetY = -(compositor.snapshotY - camera.y) * snapshotTileSize0; // Y-up → Y-down
    if (compositor.panExceedsMargin(offsetX, offsetY, w, h)) {
      compositor.invalidateAll();
    }

    // Zoom-settle debounce
    if (camera.zoom !== lastZoom.current) {
      clearTimeout(zoomSettleTimer.current);
      zoomSettleTimer.current = window.setTimeout(() => {
        compositorRef.current.invalidateAll();
        markOverlayDirty(); // trigger next frame
      }, 150);
      lastZoom.current = camera.zoom;
    }

    // Render dirty layers to offscreen canvases
    let tilesRedrawn = false;
    let entitiesRedrawn = false;
    if (compositor.isTilesDirty || compositor.isDecalsDirty || compositor.isEntitiesDirty || compositor.isConnectionsDirty || compositor.isLightDirty) {
      // Render at the CURRENT camera position (not the old snapshot).
      // The snapshot only matters for offset compositing of cached (clean) layers.
      // When re-rendering, we paint the world at where the camera IS now.
      const bufCam = new Camera();
      bufCam.x = camera.x;
      bufCam.y = camera.y;
      bufCam.zoom = camera.zoom;
      const bw = compositor.bufferWidth;
      const bh = compositor.bufferHeight;

      tilesRedrawn = compositor.isTilesDirty;
      entitiesRedrawn = compositor.isEntitiesDirty;

      if (compositor.isTilesDirty) {
        const tCtx = compositor.getTileCtx();
        if (tCtx) {
          tCtx.clearRect(0, 0, compositor.physicalWidth, compositor.physicalHeight);
          tCtx.save();
          tCtx.scale(dpr, dpr);
          renderGrid(tCtx, s.grid, bufCam, bw, bh, s.registry);
          tCtx.restore();
        }
      }

      if (compositor.isDecalsDirty) {
        const dCtx = compositor.getDecalCtx();
        if (dCtx) {
          dCtx.clearRect(0, 0, compositor.physicalWidth, compositor.physicalHeight);
          dCtx.save();
          dCtx.scale(dpr, dpr);
          if (layerVisibilityRef.current.decals && s.registry) {
            const activeGrid = s.grids[s.activeGridIndex];
            if (activeGrid?.decals?.decals?.length > 0) {
              renderDecals(dCtx, activeGrid.decals.decals, bufCam, bw, bh, s.registry);
            }
          }
          dCtx.restore();
        }
      }

      if (compositor.isEntitiesDirty) {
        const eCtx = compositor.getEntityCtx();
        if (eCtx) {
          eCtx.clearRect(0, 0, compositor.physicalWidth, compositor.physicalHeight);
          eCtx.save();
          eCtx.scale(dpr, dpr);
          if (showEntitiesRef.current && s.entities.length > 0) {
            renderEntities(eCtx, s.entities, bufCam, bw, bh, s.registry, s.grid, showSubFloorRef.current, layerVisibilityRef.current);
          }
          eCtx.restore();
        }
        lastRenderedSpatialGen.current = spatialGeneration();
      }

      if (compositor.isConnectionsDirty) {
        const cCtx = compositor.getConnectionCtx();
        if (cCtx) {
          cCtx.clearRect(0, 0, compositor.physicalWidth, compositor.physicalHeight);
          cCtx.save();
          cCtx.scale(dpr, dpr);
          if (showConnectionsRef.current && showEntitiesRef.current && s.entities.length > 0) {
            renderConnections(cCtx, s.entities, bufCam, bw, bh, s.selectedEntityUids);
          }
          cCtx.restore();
        }
      }

      // Rebuild wall segment cache when entities change (for shadow casting)
      if (lightingRef.current && s.registry) {
        const gen = spatialGeneration();
        if (gen !== wallCacheGenRef.current) {
          wallCacheRef.current = buildWallSegmentCache(s.entities, s.registry);
          wallCacheGenRef.current = gen;
          compositor.invalidateLight();
        }
      }

      if (compositor.isLightDirty) {
        const lCtx = compositor.getLightCtx();
        if (lCtx) {
          lCtx.clearRect(0, 0, compositor.physicalWidth, compositor.physicalHeight);
          if (lightingRef.current && s.entities.length > 0) {
            lCtx.save();
            lCtx.scale(dpr, dpr);
            renderLightmap(lCtx, s.entities, s.registry, bufCam, bw, bh, wallCacheRef.current ?? undefined);
            lCtx.restore();
          }
        }
      }

      compositor.markAllClean();
      compositor.setCameraSnapshot(camera.x, camera.y, camera.zoom);
    }
    statsSetLayerRedraws(tilesRedrawn, entitiesRedrawn);

    // Recompute draw offset after potential snapshot update (avoids stale offset on re-render frame).
    // Use the snapshot's tileScreenSize (not current) because the cached buffer was rendered
    // at the snapshot zoom, the scale transform handles the zoom difference.
    const snapshotTileSize = 32 * compositor.snapshotZoom;
    const curOffsetX = (compositor.snapshotX - camera.x) * snapshotTileSize;
    const curOffsetY = -(compositor.snapshotY - camera.y) * snapshotTileSize;
    const drawX = curOffsetX - marginPxX;
    const drawY = curOffsetY - marginPxY;

    // Composite to main canvas
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Space background, pre-baked dust + parallax star layers (zero filters per frame)
    if (showSpaceBackground) {
      const bgCache = getSpaceBgCache(w, h);
      if (bgCache?.dustCanvas) {
        ctx.drawImage(bgCache.dustCanvas, 0, 0);
        if (bgCache.starCanvases.length > 0) {
          const tss = camera.tileScreenSize;
          const margin = 200;
          ctx.globalCompositeOperation = 'screen';
          for (let i = 0; i < bgCache.starCanvases.length; i++) {
            const layer = STAR_DEPTH_LAYERS[i];
            const ox = (w / 2 - camera.x * tss) * layer.parallax;
            const oy = (h / 2 + camera.y * tss) * layer.parallax;
            const tileW = bgCache.starCanvases[i].width;
            const tileH = bgCache.starCanvases[i].height;
            const drawX = ((ox % tileW) + tileW) % tileW - margin;
            const drawY = ((oy % tileH) + tileH) % tileH - margin;
            ctx.globalAlpha = layer.opacity;
            ctx.drawImage(bgCache.starCanvases[i], drawX, drawY);
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      } else {
        ctx.fillStyle = '#111122';
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      ctx.fillStyle = '#111122';
      ctx.fillRect(0, 0, w, h);
    }

    // Vignette, darken edges for cinematic depth (cached, only recreated on resize)
    if (showSpaceBackground) {
      if (!vignetteRef.current || vignetteRef.current.w !== w || vignetteRef.current.h !== h) {
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.max(cx, cy);
        const gradient = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius * 1.1);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(0.6, 'rgba(0,0,0,0.3)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.85)');
        vignetteRef.current = { gradient, w, h };
      }
      ctx.fillStyle = vignetteRef.current.gradient;
      ctx.fillRect(0, 0, w, h);
    }

    // Space clown easter egg, floats in the space layer, behind the grid
    renderSpaceClown(ctx, timestamp, w, h);

    // Zoom-deferred: scale all cached layers when zoom changed but hasn't settled
    const zoomDiff = compositor.zoomChanged(camera.zoom);
    statsSetZoomDeferred(zoomDiff);
    if (zoomDiff) {
      const scale = camera.zoom / compositor.snapshotZoom;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-w / 2, -h / 2);
    }

    // Composite all cached layers
    const tileCanvas = compositor.getTileCanvas();
    if (tileCanvas) ctx.drawImage(tileCanvas, 0, 0, compositor.physicalWidth, compositor.physicalHeight, drawX, drawY, compositor.bufferWidth, compositor.bufferHeight);
    const decalCanvas = compositor.getDecalCanvas();
    if (decalCanvas) ctx.drawImage(decalCanvas, 0, 0, compositor.physicalWidth, compositor.physicalHeight, drawX, drawY, compositor.bufferWidth, compositor.bufferHeight);
    const entityCanvas = compositor.getEntityCanvas();
    if (entityCanvas) ctx.drawImage(entityCanvas, 0, 0, compositor.physicalWidth, compositor.physicalHeight, drawX, drawY, compositor.bufferWidth, compositor.bufferHeight);
    const connCanvas = compositor.getConnectionCanvas();
    if (connCanvas) ctx.drawImage(connCanvas, 0, 0, compositor.physicalWidth, compositor.physicalHeight, drawX, drawY, compositor.bufferWidth, compositor.bufferHeight);

    if (lightingRef.current) {
      const lightCanvas = compositor.getLightCanvas();
      if (lightCanvas) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(lightCanvas, 0, 0, compositor.physicalWidth, compositor.physicalHeight, drawX, drawY, compositor.bufferWidth, compositor.bufferHeight);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    if (zoomDiff) ctx.restore();

    // Overlay pass, drawn directly to main canvas every frame (always pixel-crisp)
    const tileScreenSize = camera.tileScreenSize;

    // Render grid lines
    if (showGridRef.current) {
      renderGridLines(ctx, s.grid, camera, w, h);
    }

    // Tool preview (only when not panning)
    if (!isSpaceHeldRef.current) {
      const tool = toolRef.current;
      if (tool?.renderPreview) {
        const toolCtx = {
          state: s,
          dispatch,
          camera,
          canvasW: w,
          canvasH: h,
          paletteItem: s.selectedPaletteItem,
          shiftHeld: isShiftHeldRef.current,
          ctrlHeld: isCtrlHeldRef.current,
          decalSettings: decalPlacementSettingsRef.current,
        };
        const usePreciseCursor = isShiftHeldRef.current && (tool.name === 'entityPlace' || tool.name === 'entitySelect');
        const cx = usePreciseCursor ? cursorWorld.current.x : cursorTile.current.x;
        const cy = usePreciseCursor ? cursorWorld.current.y : cursorTile.current.y;
        tool.renderPreview(ctx, toolCtx, cx, cy);
      }
    }

    // Decal ghost preview when a decal palette item is selected
    // Only show when in a placement-compatible tool (paint, erase, fill, rectangle, line, circle, entityPlace)
    const currentToolName = toolRef.current?.name ?? '';
    const isPlacementTool = !['entitySelect', 'select', 'pan', 'pipeDraw', 'cableDraw', 'deviceLink'].includes(currentToolName);
    if (!isSpaceHeldRef.current && isPlacementTool && s.selectedPaletteItem?.type === 'decal' && s.registry) {
      const settings = decalPlacementSettingsRef.current;
      const img = getDecalSprite(s.selectedPaletteItem.id, s.registry);
      if (img) {
        let px = cursorWorld.current.x;
        let py = cursorWorld.current.y;
        const shiftFreePlace = isShiftHeldRef.current;
        if (settings.snap && !shiftFreePlace) {
          px = Math.floor(px);
          py = Math.floor(py);
        }
        const sx = camera.worldToScreenX(px, w);
        const sy = camera.worldToScreenY(py, h);
        const ts = tileScreenSize;

        ctx.save();
        ctx.globalAlpha = 0.5;
        if (settings.angle !== 0) {
          ctx.translate(sx + ts / 2, sy + ts / 2);
          ctx.rotate(-settings.angle);
          ctx.translate(-ts / 2, -ts / 2);
          ctx.drawImage(img, 0, 0, ts, ts);
        } else {
          ctx.drawImage(img, sx, sy, ts, ts);
        }
        ctx.restore();
      }
    }

    // Entity + decal hover tooltip (only re-scan when cursor tile changes)
    if (showEntitiesRef.current && s.registry) {
      const cx = cursorTile.current.x;
      const cy = cursorTile.current.y;
      const entitiesChanged = s.entities !== prevEntityRef.current;
      if (entitiesChanged) prevEntityRef.current = s.entities;
      const layers = layerVisibilityRef.current;
      if (cx !== prevCursorTile.current.x || cy !== prevCursorTile.current.y || entitiesChanged) {
        prevCursorTile.current = { x: cx, y: cy };
        cachedHovered.current = getEntitiesAtTile(cx, cy, s.entities, s.registry);
      }
      const hovered = cachedHovered.current.filter(e => {
        const depth = getCachedDrawDepth(e.prototype, s.registry!);
        return isLayerVisible(depth, e.prototype, layers);
      });

      // Count decals at this tile
      const activeGrid = s.grids[s.activeGridIndex];
      const decalsAtTile = layers.decals
        ? activeGrid?.decals?.decals?.filter(d =>
          Math.floor(d.position.x) === cx && Math.floor(d.position.y) === cy
        ) ?? []
        : [];

      const totalCount = hovered.length + decalsAtTile.length;
      if (totalCount > 0) {
        const sx = camera.worldToScreenX(cursorTile.current.x, w);
        const sy = camera.worldToScreenY(cursorTile.current.y, h);

        // Highlight the tile with a subtle outline
        ctx.strokeStyle = 'rgba(255, 255, 100, 0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, tileScreenSize, tileScreenSize);

        // Draw tooltip above the tile
        let label: string;
        if (hovered.length > 0) {
          const topEntity = hovered[0];
          const name = s.registry.getEntity(topEntity.prototype)?.name ?? topEntity.prototype;
          const extraCount = totalCount - 1;
          label = extraCount > 0 ? `${name} (+${extraCount} more)` : name;
        } else {
          const topDecal = decalsAtTile[0];
          const extraCount = decalsAtTile.length - 1;
          label = extraCount > 0
            ? `${topDecal.prototypeId} (+${extraCount} more)`
            : topDecal.prototypeId;
        }

        const fontSize = 12;
        ctx.font = `${fontSize}px sans-serif`;
        const textWidth = ctx.measureText(label).width;
        const padding = 4;
        const tooltipX = sx + tileScreenSize / 2 - textWidth / 2 - padding;
        const tooltipY = sy - fontSize - padding * 2 - 4;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(tooltipX, tooltipY, textWidth + padding * 2, fontSize + padding * 2);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, tooltipX + padding, tooltipY + padding);
      }
    }

    // Pulsing validation highlight
    const hl = highlightTileRef.current;
    if (hl) {
      const elapsed = (performance.now() - hl.startTime) / 1000;
      if (elapsed < 3) {
        const pulse = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(elapsed * Math.PI / 0.3));
        const hx = camera.worldToScreenX(hl.x, w);
        const hy = camera.worldToScreenY(hl.y, h);
        ctx.strokeStyle = '#FF4444';
        ctx.lineWidth = 3;
        ctx.globalAlpha = pulse;
        ctx.strokeRect(hx + 1, hy + 1, tileScreenSize - 2, tileScreenSize - 2);
        ctx.globalAlpha = 1;
        markOverlayDirty(); // keep animating
      }
    }

    ctx.restore();

    markClean();
    statsFrameEnd(frameStart);
    benchmarkSample();
  });

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: getCursor(), imageRendering: 'pixelated' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
};

function renderGridLines(
  ctx: CanvasRenderingContext2D,
  grid: { width: number; height: number; offsetX: number; offsetY: number },
  camera: Camera,
  canvasW: number,
  canvasH: number,
) {
  const tileScreenSize = camera.tileScreenSize;

  // Scale opacity: fully visible when zoomed in, subtler when zoomed out
  const alpha = Math.max(0.03, Math.min(0.2, 0.06 * camera.zoom + 0.02));
  ctx.lineWidth = 1;

  // Skip lines that are too close together (< 3px apart)
  const step = tileScreenSize < 3 ? Math.ceil(3 / tileScreenSize) : 1;

  // Visible world range
  const topLeft = camera.screenToTile(0, 0, canvasW, canvasH);
  const bottomRight = camera.screenToTile(canvasW, canvasH, canvasW, canvasH);
  const visMinX = Math.floor(Math.min(topLeft.x, bottomRight.x)) - 1;
  const visMaxX = Math.ceil(Math.max(topLeft.x, bottomRight.x)) + 1;
  const visMinY = Math.floor(Math.min(topLeft.y, bottomRight.y)) - 1;
  const visMaxY = Math.ceil(Math.max(topLeft.y, bottomRight.y)) + 1;

  const startX = Math.floor(visMinX / step) * step;
  const startY = Math.floor(visMinY / step) * step;

  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;

  // Vertical lines
  for (let x = startX; x <= visMaxX; x += step) {
    const sx = camera.worldToScreenX(x, canvasW);
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, canvasH);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = startY; y <= visMaxY; y += step) {
    // worldToScreenY gives top of tile; for grid lines we want the bottom edge (y itself)
    const sy = camera.worldToScreenY(y, canvasH) + tileScreenSize;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(canvasW, sy);
    ctx.stroke();
  }

  // Origin crosshair (slightly brighter)
  const ox = camera.worldToScreenX(0, canvasW);
  const oy = camera.worldToScreenY(0, canvasH) + tileScreenSize;
  ctx.strokeStyle = `rgba(100,150,255,${Math.min(0.4, alpha * 4)})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, 0);
  ctx.lineTo(ox, canvasH);
  ctx.moveTo(0, oy);
  ctx.lineTo(canvasW, oy);
  ctx.stroke();
}
