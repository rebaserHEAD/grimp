import {
  clearEntitySpriteCache, clearExtraLayerCache, clearPrototypeFlags,
  clearSmoothInfoCache, clearCornerFillCache, clearCardinalMaskCache,
  clearNoRotCache, clearDrawDepthCache, clearSpriteColorCache, clearPipeColorCache,
} from '../rendering/entityRenderer';
import { clearRsiCache } from './rsiLoader';
import { clearDecalSpriteCache } from '../rendering/decalRenderer';
import { clearTileImageCache } from '../rendering/gridRenderer';
import { clearTileSwatchCache } from '../components/TilePalette';
import { clearDecalThumbCache } from '../components/DecalPalette';
import { rebuildSpatialIndex } from '../rendering/spatialIndex';
import { markAllDirty } from '../rendering/dirtyFlags';

/**
 * Clear every cached resource. Called when switching forks to ensure
 * no stale data from the previous fork persists.
 */
export function resetAllCaches(): void {
  // Entity rendering caches
  clearEntitySpriteCache();
  clearExtraLayerCache();
  clearPrototypeFlags();
  clearSmoothInfoCache();
  clearCornerFillCache();
  clearCardinalMaskCache();
  clearNoRotCache();
  clearDrawDepthCache();
  clearSpriteColorCache();
  clearPipeColorCache();
  // RSI sprite/meta caches
  clearRsiCache();
  // Decal rendering + thumbnail caches
  clearDecalSpriteCache();
  clearDecalThumbCache();
  // Tile rendering + thumbnail caches
  clearTileImageCache();
  clearTileSwatchCache();
  // Spatial index
  rebuildSpatialIndex([]);
  // Force full re-render
  markAllDirty();
}
