import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { PaletteItem } from '../types';
import type { IPrototypeRegistry, DecalPrototypeInfo } from '../loaders/registryTypes';
import { getActiveProvider } from '../loaders/resourceProvider';

export interface DecalPlacementSettings {
  color: string | null;  // "#RRGGBBAA" or null
  angle: number;         // radians
  zIndex: number;
  snap: boolean;
  cleanable: boolean;
}

export const DEFAULT_DECAL_PLACEMENT_SETTINGS: DecalPlacementSettings = {
  color: null,
  angle: 0,
  zIndex: 0,
  snap: true,
  cleanable: false,
};

interface Props {
  registry: IPrototypeRegistry | null;
  selectedItem: PaletteItem | null;
  onSelect: (item: PaletteItem) => void;
  placementSettingsRef: React.MutableRefObject<DecalPlacementSettings>;
}

// Thumbnail cache: decalId → dataURL
const thumbCache = new Map<string, string | null>();
const pendingLoads = new Set<string>();

/** Clear the decal thumbnail cache (called on fork switch). */
export function clearDecalThumbCache(): void {
  thumbCache.clear();
  pendingLoads.clear();
}

function getDecalThumbUrl(decal: DecalPrototypeInfo): string | null {
  if (!decal.state) return null;
  const rsi = decal.rsiPath.replace(/\.rsi$/, '.rsi');
  // rsiPath may or may not include Textures/ prefix depending on the prototype data
  const path = rsi.startsWith('Textures/') ? `/${rsi}/${decal.state}.png` : `/Textures/${rsi}/${decal.state}.png`;
  try {
    return getActiveProvider().getImageUrl(path);
  } catch {
    return null;
  }
}

const THUMB_SIZE = 24;

function getDecalThumbnail(decal: DecalPrototypeInfo): string | null | undefined {
  if (thumbCache.has(decal.id)) return thumbCache.get(decal.id)!;
  if (pendingLoads.has(decal.id)) return undefined; // still loading

  const url = getDecalThumbUrl(decal);
  if (!url) {
    thumbCache.set(decal.id, null);
    return null;
  }
  pendingLoads.add(decal.id);
  const img = new Image();
  img.src = url;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, THUMB_SIZE, THUMB_SIZE);
      thumbCache.set(decal.id, canvas.toDataURL());
    } else {
      thumbCache.set(decal.id, null);
    }
    pendingLoads.delete(decal.id);
  };
  img.onerror = () => {
    thumbCache.set(decal.id, null);
    pendingLoads.delete(decal.id);
  };

  return undefined;
}

const DecalThumbnail: React.FC<{ decal: DecalPrototypeInfo }> = ({ decal }) => {
  const [src, setSrc] = useState<string | null | undefined>(() => getDecalThumbnail(decal));

  useEffect(() => {
    if (src !== undefined) return;
    // Poll until loaded
    const interval = setInterval(() => {
      const result = getDecalThumbnail(decal);
      if (result !== undefined) {
        setSrc(result);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [src, decal]);

  if (!src) {
    return (
      <span
        className="inline-block bg-surface border border-subtle rounded-sm flex-shrink-0"
        style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
      />
    );
  }

  return (
    <img
      src={src}
      width={THUMB_SIZE}
      height={THUMB_SIZE}
      className="flex-shrink-0 rounded-sm"
      style={{ imageRendering: 'pixelated' }}
      alt={decal.id}
    />
  );
};

/** Priority tags for grouping, shown first */
const PRIORITY_TAGS = ['station', 'markings', 'flora', 'dirty'];

const PREVIEW_SIZE = 128;

export const DecalPalette: React.FC<Props> = ({ registry, selectedItem, onSelect, placementSettingsRef }) => {
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const { hovered, onMouseEnter, onMouseLeave } = useDecalHoverPreview(250);

  // Placement settings as local state, synced to ref
  const [colorHex, setColorHex] = useState('#FFFFFF');
  const [colorAlpha, setColorAlpha] = useState(255);
  const [angleDeg, setAngleDeg] = useState(0);
  const [zIndex, setZIndex] = useState(0);
  const [snap, setSnap] = useState(true);
  const [cleanable, setCleanable] = useState(false);

  // Sync local state to ref
  useEffect(() => {
    const alphaHex = colorAlpha.toString(16).padStart(2, '0').toUpperCase();
    placementSettingsRef.current = {
      color: `${colorHex}${alphaHex}`,
      angle: (angleDeg * Math.PI) / 180,
      zIndex,
      snap,
      cleanable,
    };
  }, [colorHex, colorAlpha, angleDeg, zIndex, snap, cleanable, placementSettingsRef]);

  const { groups, groupOrder, allDecals } = useMemo(() => {
    if (!registry) return { groups: new Map<string, DecalPrototypeInfo[]>(), groupOrder: [], allDecals: [] };

    const decals = registry.getAllDecals();
    const map = new Map<string, DecalPrototypeInfo[]>();

    for (const d of decals) {
      const tag = d.tags.length > 0 ? d.tags[0] : 'other';
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag)!.push(d);
    }

    // Sort within groups
    for (const arr of map.values()) {
      arr.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }

    // Order: priority tags first, then alphabetical
    const allTags = Array.from(map.keys());
    const prioritySet = new Set(PRIORITY_TAGS);
    const priority = PRIORITY_TAGS.filter(t => allTags.includes(t));
    const rest = allTags.filter(t => !prioritySet.has(t)).sort();

    return { groups: map, groupOrder: [...priority, ...rest], allDecals: decals };
  }, [registry]);

  const filteredDecals = useMemo(() => {
    if (!search) return null;
    const lower = search.toLowerCase();
    const results = allDecals.filter(d => String(d.id).toLowerCase().includes(lower));
    results.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return results.slice(0, 200);
  }, [search, allDecals]);

  const toggleGroup = useCallback((tag: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const isSelected = (id: string) =>
    selectedItem?.type === 'decal' && selectedItem.id === id;

  // Check if selected decal supports custom color
  const selectedDecal = useMemo(() => {
    if (selectedItem?.type !== 'decal' || !registry) return null;
    return registry.getDecal(selectedItem.id);
  }, [selectedItem, registry]);

  // Always show color picker, defaultCustomColor is just a UI hint, not a restriction
  const showColorPicker = selectedDecal != null;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-2 pt-2 pb-1 text-xs text-muted">Decals</div>

      {selectedItem?.type === 'decal' && (
        <div className="px-2 pb-2 border-b border-subtle text-[11px] text-primary">
          Selected: <strong>{selectedItem.id}</strong>
        </div>
      )}

      <div className="m-1">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search decals..."
          className="w-full px-2 py-1 bg-surface border border-subtle rounded-sm text-primary text-xs outline-none focus:border-accent"
        />
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filteredDecals ? (
          <div className="px-2">
            {filteredDecals.length === 0 && (
              <div className="text-muted text-xs p-3 italic text-center">No results</div>
            )}
            {filteredDecals.map(d => (
              <DecalRow
                key={d.id}
                decal={d}
                selected={isSelected(d.id)}
                onSelect={() => onSelect({ type: 'decal', id: d.id })}
                onHoverEnter={onMouseEnter}
                onHoverLeave={onMouseLeave}
              />
            ))}
          </div>
        ) : (
          groupOrder.map(tag => {
            const decals = groups.get(tag);
            if (!decals) return null;
            const expanded = expandedGroups.has(tag);

            return (
              <div key={tag}>
                <button
                  onClick={() => toggleGroup(tag)}
                  className="flex items-center px-2 py-1 text-[10px] uppercase tracking-wider text-muted bg-surface cursor-pointer hover:bg-hover select-none w-full text-left border-none"
                  title={tag}
                >
                  <span className="text-muted mr-1 text-[10px]">{expanded ? '▾' : '▸'}</span>
                  {tag} <span className="text-muted ml-1">({decals.length})</span>
                </button>
                {expanded && (
                  <div className="pl-2 pr-2">
                    {decals.map(d => (
                      <DecalRow
                        key={d.id}
                        decal={d}
                        selected={isSelected(d.id)}
                        onSelect={() => onSelect({ type: 'decal', id: d.id })}
                        onHoverEnter={onMouseEnter}
                        onHoverLeave={onMouseLeave}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Placement controls */}
      <div className="border-t border-subtle px-2 py-2 space-y-1.5">
        <div className="text-[10px] text-muted uppercase tracking-wider">Placement</div>

        {showColorPicker && (
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-primary w-12">Color</label>
            <input
              type="color"
              value={colorHex}
              onChange={e => setColorHex(e.target.value)}
              className="w-6 h-6 border border-subtle rounded-sm cursor-pointer bg-transparent p-0"
            />
            <label className="text-[10px] text-muted">A</label>
            <input
              type="range"
              min={0}
              max={255}
              value={colorAlpha}
              onChange={e => setColorAlpha(Number(e.target.value))}
              className="flex-1 h-3"
            />
            <span className="text-[10px] text-muted w-6 text-right">{colorAlpha}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="text-[11px] text-primary w-12">Angle</label>
          <input
            type="number"
            min={0}
            max={360}
            value={angleDeg}
            onChange={e => setAngleDeg(Number(e.target.value))}
            className="flex-1 px-1 py-0.5 bg-surface border border-subtle rounded-sm text-primary text-[11px] outline-none focus:border-accent w-16"
          />
          <span className="text-[10px] text-muted">deg</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[11px] text-primary w-12">Z-Index</label>
          <input
            type="number"
            value={zIndex}
            onChange={e => setZIndex(Number(e.target.value))}
            className="flex-1 px-1 py-0.5 bg-surface border border-subtle rounded-sm text-primary text-[11px] outline-none focus:border-accent w-16"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1 text-[11px] text-primary cursor-pointer">
            <input
              type="checkbox"
              checked={snap}
              onChange={e => setSnap(e.target.checked)}
              className="accent-accent"
            />
            Snap
          </label>
          <label className="flex items-center gap-1 text-[11px] text-primary cursor-pointer">
            <input
              type="checkbox"
              checked={cleanable}
              onChange={e => setCleanable(e.target.checked)}
              className="accent-accent"
            />
            Cleanable
          </label>
        </div>
      </div>

      <div className="px-2 py-1 text-[10px] text-muted border-t border-subtle">
        {registry?.decalCount ?? 0} decals
      </div>

      {/* Hover preview popup */}
      {hovered && registry && (
        <DecalPreviewPopup
          decalId={hovered.id}
          registry={registry}
          anchorRect={hovered.rect}
        />
      )}
    </div>
  );
};

const DecalRow: React.FC<{
  decal: DecalPrototypeInfo;
  selected: boolean;
  onSelect: () => void;
  onHoverEnter: (id: string, el: HTMLElement) => void;
  onHoverLeave: () => void;
}> = ({ decal, selected, onSelect, onHoverEnter, onHoverLeave }) => {
  const ref = React.useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      onClick={onSelect}
      onMouseEnter={() => ref.current && onHoverEnter(String(decal.id), ref.current)}
      onMouseLeave={onHoverLeave}
      className={`flex items-center gap-1.5 px-2 py-0.5 text-xs cursor-pointer w-full text-left border-none rounded-sm mb-px ${selected ? 'bg-active text-accent border border-accent' : 'text-primary hover:bg-hover bg-transparent border border-transparent'
        }`}
      title={`${decal.id}\nTags: ${decal.tags.join(', ')}`}
    >
      <DecalThumbnail decal={decal} />
      <span className="truncate">{decal.id}</span>
    </button>
  );
};

/** Hook for managing decal hover preview state with a delay. */
function useDecalHoverPreview(delay = 300) {
  const [hovered, setHovered] = useState<{ id: string; rect: DOMRect } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const currentRef = useRef<string | null>(null);

  const onMouseEnter = useCallback((id: string, el: HTMLElement) => {
    currentRef.current = id;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (currentRef.current === id) {
        setHovered({ id, rect: el.getBoundingClientRect() });
      }
    }, delay);
  }, [delay]);

  const onMouseLeave = useCallback(() => {
    currentRef.current = null;
    clearTimeout(timerRef.current);
    setHovered(null);
  }, []);

  return { hovered, onMouseEnter, onMouseLeave };
}

/** Large sprite preview popup shown on hover over a decal in the palette. */
const DecalPreviewPopup: React.FC<{
  decalId: string;
  registry: IPrototypeRegistry;
  anchorRect: DOMRect;
}> = ({ decalId, registry, anchorRect }) => {
  const proto = registry.getDecal(decalId);
  const imgSrc = (() => {
    if (!proto || !proto.state) return null;
    const rsi = proto.rsiPath;
    const path = rsi.startsWith('Textures/') ? `/${rsi}/${proto.state}.png` : `/Textures/${rsi}/${proto.state}.png`;
    try { return getActiveProvider().getImageUrl(path); } catch { return null; }
  })();

  const left = anchorRect.left - PREVIEW_SIZE - 20;
  const top = Math.max(8, anchorRect.top + anchorRect.height / 2 - (PREVIEW_SIZE + 40) / 2);

  return (
    <div
      className="fixed z-[200] bg-elevated border border-subtle rounded shadow-lg p-2 pointer-events-none"
      style={{ left, top }}
    >
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={decalId}
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
        {decalId}
      </div>
      {proto && proto.tags.length > 0 && (
        <div className="text-muted text-[9px] text-center truncate" style={{ maxWidth: PREVIEW_SIZE }}>
          {proto.tags.join(', ')}
        </div>
      )}
    </div>
  );
};
