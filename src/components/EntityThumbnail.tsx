import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { IPrototypeRegistry } from '../loaders/registryTypes';
import { getEntitySprite } from '../rendering/entityRenderer';

const THUMB_SIZE = 24;
const PREVIEW_SIZE = 128;

// Global thumbnail cache: prototypeId → dataURL (persists across re-renders/unmounts)
const thumbnailCache = new Map<string, string | null>();
// Track which prototypes are currently being polled for async sprite loading
const pendingSet = new Set<string>();

/**
 * Try to generate a thumbnail dataURL for a prototype.
 * Returns the dataURL, null (no sprite), or undefined (still loading).
 */
function getThumbnail(prototypeId: string, registry: IPrototypeRegistry): string | null | undefined {
  if (thumbnailCache.has(prototypeId)) return thumbnailCache.get(prototypeId)!;

  const sprite = getEntitySprite(prototypeId, 'south', registry);
  if (sprite === null) {
    thumbnailCache.set(prototypeId, null);
    return null;
  }
  if (sprite === undefined) {
    // Still loading, will be available on next call
    return undefined;
  }

  // Sprite loaded, render to offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    thumbnailCache.set(prototypeId, null);
    return null;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sprite.image,
    sprite.sx, sprite.sy, sprite.sw, sprite.sh,
    0, 0, THUMB_SIZE, THUMB_SIZE,
  );
  const dataUrl = canvas.toDataURL();
  thumbnailCache.set(prototypeId, dataUrl);
  return dataUrl;
}

/**
 * Generate a larger preview dataURL for hover popup.
 * Uses a separate cache key suffix.
 */
function getPreview(prototypeId: string, registry: IPrototypeRegistry): string | null {
  const cacheKey = `${prototypeId}:preview`;
  if (thumbnailCache.has(cacheKey)) return thumbnailCache.get(cacheKey)!;

  const sprite = getEntitySprite(prototypeId, 'south', registry);
  if (!sprite) return null;

  const canvas = document.createElement('canvas');
  canvas.width = PREVIEW_SIZE;
  canvas.height = PREVIEW_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sprite.image,
    sprite.sx, sprite.sy, sprite.sw, sprite.sh,
    0, 0, PREVIEW_SIZE, PREVIEW_SIZE,
  );
  const dataUrl = canvas.toDataURL();
  thumbnailCache.set(cacheKey, dataUrl);
  return dataUrl;
}

interface EntityThumbnailProps {
  prototypeId: string;
  registry: IPrototypeRegistry;
}

/**
 * Lazy-loaded entity sprite thumbnail.
 * Uses IntersectionObserver to only load sprites when the element is visible.
 */
export const EntityThumbnail: React.FC<EntityThumbnailProps> = ({ prototypeId, registry }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(() => {
    // Check cache synchronously on mount
    const cached = thumbnailCache.get(prototypeId);
    return cached ?? null;
  });
  const [visible, setVisible] = useState(false);

  // IntersectionObserver: mark visible when scrolled into view
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect(); // Only need to detect first visibility
        }
      },
      { rootMargin: '100px' }, // Start loading slightly before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Once visible, attempt to load the thumbnail
  useEffect(() => {
    if (!visible || thumbnailCache.has(prototypeId)) {
      if (thumbnailCache.has(prototypeId)) {
        setThumbUrl(thumbnailCache.get(prototypeId)!);
      }
      return;
    }

    // Poll for sprite availability (getEntitySprite triggers async load)
    if (pendingSet.has(prototypeId)) return;
    pendingSet.add(prototypeId);

    let cancelled = false;
    const poll = () => {
      if (cancelled) return;
      const result = getThumbnail(prototypeId, registry);
      if (result === undefined) {
        // Still loading, retry
        requestAnimationFrame(poll);
      } else {
        pendingSet.delete(prototypeId);
        if (!cancelled) setThumbUrl(result);
      }
    };
    poll();

    return () => { cancelled = true; pendingSet.delete(prototypeId); };
  }, [visible, prototypeId, registry]);

  return (
    <div ref={ref} className="w-6 h-6 shrink-0 flex items-center justify-center">
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt=""
          className="w-6 h-6"
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      ) : (
        <div className="w-5 h-5 bg-surface rounded-sm" />
      )}
    </div>
  );
};

interface SpritePreviewPopupProps {
  prototypeId: string;
  entityName: string;
  registry: IPrototypeRegistry;
  anchorRect: DOMRect;
}

/**
 * Large sprite preview popup shown on hover.
 * Positioned to the left of the anchor element.
 */
export const SpritePreviewPopup: React.FC<SpritePreviewPopupProps> = ({
  prototypeId, entityName, registry, anchorRect,
}) => {
  const previewUrl = getPreview(prototypeId, registry);

  // Position to the left of the anchor, vertically centered
  const left = anchorRect.left - PREVIEW_SIZE - 20;
  const top = Math.max(8, anchorRect.top + anchorRect.height / 2 - (PREVIEW_SIZE + 40) / 2);

  return (
    <div
      className="fixed z-[200] bg-elevated border border-subtle rounded shadow-lg p-2 pointer-events-none"
      style={{ left, top }}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={entityName}
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
        {entityName}
      </div>
      <div className="text-muted text-[9px] text-center truncate" style={{ maxWidth: PREVIEW_SIZE }}>
        {prototypeId}
      </div>
    </div>
  );
};

/**
 * Hook for managing hover preview state with a delay.
 */
export function useHoverPreview(delay = 300) {
  const [hovered, setHovered] = useState<{
    prototypeId: string;
    entityName: string;
    rect: DOMRect;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const currentRef = useRef<string | null>(null);

  const onMouseEnter = useCallback((prototypeId: string, entityName: string, el: HTMLElement) => {
    currentRef.current = prototypeId;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (currentRef.current === prototypeId) {
        setHovered({ prototypeId, entityName, rect: el.getBoundingClientRect() });
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
