import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { PaletteItem } from '../types';
import type { IPrototypeRegistry } from '../loaders/registryTypes';
import { loadImage } from '../loaders/rsiLoader';
import { getActiveProvider } from '../loaders/resourceProvider';

interface Props {
  registry: IPrototypeRegistry | null;
  selectedItem: PaletteItem | null;
  onSelect: (item: PaletteItem) => void;
}

// Common structural tiles to always show at top
const STRUCTURAL_TILES = [
  'Plating', 'FloorSteel', 'FloorDark', 'FloorWhite', 'FloorWood',
  'WallSolid', 'WallReinforced', 'Lattice',
];

const PREVIEW_SIZE = 128;

export const TilePalette: React.FC<Props> = ({ registry, selectedItem, onSelect }) => {
  const [search, setSearch] = useState('');
  const { hovered, onHoverEnter, onHoverLeave } = useTileHoverPreview(250);

  const tileIds = useMemo(() => {
    if (!registry) return [];
    const all = registry.getAllTiles().map(t => t.id).sort();
    const structural = STRUCTURAL_TILES.filter(id => all.includes(id));
    const rest = all.filter(id => !STRUCTURAL_TILES.includes(id));
    return [...structural, ...rest];
  }, [registry]);

  const filtered = useMemo(() => {
    if (!search) return tileIds;
    const lower = search.toLowerCase();
    return tileIds.filter(id => id.toLowerCase().includes(lower));
  }, [tileIds, search]);

  return (
    <div className="flex-1 bg-surface flex flex-col overflow-hidden">
      <div className="px-2 pt-2 pb-1 text-xs text-muted">Tiles</div>

      {selectedItem && selectedItem.type === 'tile' && (
        <div className="px-2 pb-2 border-b border-subtle text-[11px] text-primary">
          Selected: <strong>{selectedItem.id}</strong>
        </div>
      )}

      <div className="px-2 py-1">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tiles..."
          className="w-full px-2 py-1 bg-surface border border-subtle rounded-sm text-primary text-xs outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 p-2 overflow-y-auto flex-1 content-start">
        {filtered.map(id => {
          const isSelected = selectedItem?.type === 'tile' && selectedItem.id === id;
          return (
            <TileButton
              key={id}
              id={id}
              isSelected={isSelected}
              registry={registry}
              onSelect={onSelect}
              onHoverEnter={onHoverEnter}
              onHoverLeave={onHoverLeave}
            />
          );
        })}
      </div>

      {hovered && registry && (
        <TilePreviewPopup tileId={hovered.id} registry={registry} anchorRect={hovered.rect} />
      )}

      <div className="px-2 py-1 text-[10px] text-muted border-t border-subtle">
        {filtered.length} tiles
      </div>
    </div>
  );
};

/** Cache: tile ID -> image URL (data URL or resource URL) */
const swatchUrlCache = new Map<string, string | null>();

/** Clear the tile swatch cache (called on fork switch). */
export function clearTileSwatchCache(): void {
  swatchUrlCache.clear();
}

const TileSwatch: React.FC<{ id: string; registry: IPrototypeRegistry | null }> = ({ id, registry }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(0);

  // Start loading the tile image
  useEffect(() => {
    if (swatchUrlCache.has(id)) return; // already loaded or loading

    const tile = registry?.getTile(id);
    if (!tile?.sprite) {
      swatchUrlCache.set(id, null);
      return;
    }

    swatchUrlCache.set(id, null); // mark as loading
    const url = getActiveProvider().getImageUrl(tile.sprite);
    if (!url) return;
    loadImage(url)
      .then((img) => {
        // Draw first variant onto a small canvas to get a data URL
        const variants = tile.variants ?? 1;
        const srcSize = img.width / variants;
        const offscreen = document.createElement('canvas');
        offscreen.width = 32;
        offscreen.height = 32;
        const octx = offscreen.getContext('2d')!;
        octx.drawImage(img, 0, 0, srcSize, img.height, 0, 0, 32, 32);
        swatchUrlCache.set(id, offscreen.toDataURL());
        setLoaded(n => n + 1);
      })
      .catch(() => {
        swatchUrlCache.set(id, null);
        setLoaded(n => n + 1);
      });
  }, [id, registry]);

  // Draw onto canvas whenever loaded changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cachedUrl = swatchUrlCache.get(id);
    if (cachedUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, 32, 32);
        ctx.drawImage(img, 0, 0, 32, 32);
      };
      img.src = cachedUrl;
    } else {
      drawFallback(ctx, id);
    }
  }, [id, loaded]);

  return <canvas ref={canvasRef} width={32} height={32} style={{ width: '100%', height: '100%' }} />;
};

function drawFallback(ctx: CanvasRenderingContext2D, id: string): void {
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#666';
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = id.replace(/^Floor/, '').replace(/^Wall/, 'W:').substring(0, 6);
  ctx.fillText(label, 16, 16);
}

// ---- Tile button (extracted for ref-based hover) ----

const TileButton: React.FC<{
  id: string;
  isSelected: boolean;
  registry: IPrototypeRegistry | null;
  onSelect: (item: PaletteItem) => void;
  onHoverEnter: (id: string, el: HTMLElement) => void;
  onHoverLeave: () => void;
}> = ({ id, isSelected, registry, onSelect, onHoverEnter, onHoverLeave }) => {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      onClick={() => onSelect({ type: 'tile', id })}
      onMouseEnter={() => ref.current && onHoverEnter(id, ref.current)}
      onMouseLeave={onHoverLeave}
      title={id}
      className={`w-12 h-12 rounded-sm border cursor-pointer p-0 overflow-hidden relative bg-panel shrink-0
                  ${isSelected
                    ? 'border-accent ring-1 ring-accent'
                    : 'border-subtle hover:border-accent'}`}
    >
      <TileSwatch id={id} registry={registry} />
    </button>
  );
};

// ---- Hover preview ----

function useTileHoverPreview(delay = 300) {
  const [hovered, setHovered] = useState<{ id: string; rect: DOMRect } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const currentRef = useRef<string | null>(null);

  const onHoverEnter = useCallback((id: string, el: HTMLElement) => {
    currentRef.current = id;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (currentRef.current === id) {
        setHovered({ id, rect: el.getBoundingClientRect() });
      }
    }, delay);
  }, [delay]);

  const onHoverLeave = useCallback(() => {
    currentRef.current = null;
    clearTimeout(timerRef.current);
    setHovered(null);
  }, []);

  return { hovered, onHoverEnter, onHoverLeave };
}

const TilePreviewPopup: React.FC<{
  tileId: string;
  registry: IPrototypeRegistry;
  anchorRect: DOMRect;
}> = ({ tileId, registry, anchorRect }) => {
  const tile = registry.getTile(tileId);
  const imgSrc = (() => {
    if (!tile?.sprite) return null;
    try { return getActiveProvider().getImageUrl(tile.sprite); } catch { return null; }
  })();

  const left = anchorRect.left - PREVIEW_SIZE - 20;
  const top = Math.max(8, anchorRect.top + anchorRect.height / 2 - (PREVIEW_SIZE + 30) / 2);

  return (
    <div
      className="fixed z-[200] bg-elevated border border-subtle rounded shadow-lg p-2 pointer-events-none"
      style={{ left, top }}
    >
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={tileId}
          width={PREVIEW_SIZE}
          height={PREVIEW_SIZE}
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      ) : (
        <div
          className="bg-surface rounded flex items-center justify-center text-muted text-xs"
          style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
        >
          No sprite
        </div>
      )}
      <div className="text-primary text-[11px] text-center mt-1 truncate" style={{ maxWidth: PREVIEW_SIZE }}>
        {tileId}
      </div>
    </div>
  );
};
