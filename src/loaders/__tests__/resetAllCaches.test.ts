import { describe, it, expect, vi } from 'vitest';
import { resetAllCaches } from '../resetAllCaches';
import * as entityRenderer from '../../rendering/entityRenderer';
import * as rsiLoader from '../rsiLoader';
import * as decalRenderer from '../../rendering/decalRenderer';
import * as gridRenderer from '../../rendering/gridRenderer';
import * as tilePalette from '../../components/TilePalette';
import * as decalPalette from '../../components/DecalPalette';
import * as spatialIndex from '../../rendering/spatialIndex';
import * as dirtyFlags from '../../rendering/dirtyFlags';

describe('resetAllCaches', () => {
  it('calls all cache clear functions', () => {
    const spies = [
      vi.spyOn(entityRenderer, 'clearEntitySpriteCache'),
      vi.spyOn(entityRenderer, 'clearExtraLayerCache'),
      vi.spyOn(entityRenderer, 'clearPrototypeFlags'),
      vi.spyOn(entityRenderer, 'clearSmoothInfoCache'),
      vi.spyOn(entityRenderer, 'clearCornerFillCache'),
      vi.spyOn(entityRenderer, 'clearCardinalMaskCache'),
      vi.spyOn(entityRenderer, 'clearNoRotCache'),
      vi.spyOn(entityRenderer, 'clearDrawDepthCache'),
      vi.spyOn(entityRenderer, 'clearSpriteColorCache'),
      vi.spyOn(entityRenderer, 'clearPipeColorCache'),
      vi.spyOn(rsiLoader, 'clearRsiCache'),
      vi.spyOn(decalRenderer, 'clearDecalSpriteCache'),
      vi.spyOn(gridRenderer, 'clearTileImageCache'),
      vi.spyOn(tilePalette, 'clearTileSwatchCache'),
      vi.spyOn(decalPalette, 'clearDecalThumbCache'),
      vi.spyOn(spatialIndex, 'rebuildSpatialIndex'),
      vi.spyOn(dirtyFlags, 'markAllDirty'),
    ];

    resetAllCaches();

    for (const spy of spies) {
      expect(spy).toHaveBeenCalled();
    }
    expect(spatialIndex.rebuildSpatialIndex).toHaveBeenCalledWith([]);
  });
});
