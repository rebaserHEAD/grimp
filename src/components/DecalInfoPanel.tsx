import React, { useMemo, useState } from 'react';
import type { DecalInstance } from '../import/decalParser';
import type { IPrototypeRegistry } from '../loaders/registryTypes';
import type { EditorAction } from '../state/actions';
import { getActiveProvider } from '../loaders/resourceProvider';

interface Props {
  selectedDecalIds: number[];
  decals: DecalInstance[];
  registry: IPrototypeRegistry | null;
  dispatch: (action: EditorAction) => void;
}

export const DecalInfoPanel: React.FC<Props> = ({ selectedDecalIds, decals, registry, dispatch }) => {
  const selectedDecals = useMemo(() => {
    const idSet = new Set(selectedDecalIds);
    return decals.filter(d => idSet.has(d.id));
  }, [selectedDecalIds, decals]);

  if (selectedDecals.length === 0) return null;

  const dispatchUpdate = (updated: DecalInstance, original: DecalInstance) => {
    dispatch({
      type: 'APPLY_COMMAND',
      command: {
        label: 'Edit decal',
        tileChanges: [],
        entityChanges: [],
        decalChanges: [{
          action: 'update',
          decal: updated,
          previousDecal: original,
        }],
      },
    });
  };

  const dispatchMultiUpdate = (updates: { updated: DecalInstance; original: DecalInstance }[]) => {
    dispatch({
      type: 'APPLY_COMMAND',
      command: {
        label: `Edit ${updates.length} decals`,
        tileChanges: [],
        entityChanges: [],
        decalChanges: updates.map(u => ({
          action: 'update' as const,
          decal: u.updated,
          previousDecal: u.original,
        })),
      },
    });
  };

  /** Recolor all decals in the grid that match a source color to a new color. */
  const recolorAllMatching = (sourceColor: string | null, newColor: string | null) => {
    const matching = decals.filter(d => d.color === sourceColor);
    if (matching.length === 0) return;
    dispatchMultiUpdate(matching.map(d => ({
      original: d,
      updated: { ...d, color: newColor },
    })));
  };

  /** Select all decals in the grid that match a color. */
  const selectAllMatchingColor = (color: string | null) => {
    const matching = decals.filter(d => d.color === color);
    if (matching.length === 0) return;
    dispatch({ type: 'SELECT_DECAL', ids: matching.map(d => d.id) });
  };

  /** Count how many decals share a given color in the grid. */
  const countMatchingColor = (color: string | null) => decals.filter(d => d.color === color).length;

  // Multi-select view
  if (selectedDecals.length > 1) {
    return (
      <MultiDecalView
        decals={selectedDecals}
        registry={registry}
        onUpdate={dispatchMultiUpdate}
        onDeselect={() => dispatch({ type: 'SELECT_DECAL', ids: [] })}
        onRecolorAll={recolorAllMatching}
        onSelectAllColor={selectAllMatchingColor}
        countMatchingColor={countMatchingColor}
      />
    );
  }

  // Single decal view
  const decal = selectedDecals[0];
  const proto = registry?.getDecal(decal.prototypeId) ?? null;

  return (
    <SingleDecalView
      decal={decal}
      proto={proto}
      onUpdate={(updated) => dispatchUpdate(updated, decal)}
      onDeselect={() => dispatch({ type: 'SELECT_DECAL', ids: [] })}
      onRecolorAll={recolorAllMatching}
      onSelectAllColor={selectAllMatchingColor}
      countMatchingColor={countMatchingColor}
    />
  );
};

// ---- Sub-components ----

interface SingleDecalViewProps {
  decal: DecalInstance;
  proto: { id: string; rsiPath: string; state: string; defaultCustomColor: boolean } | null;
  onUpdate: (updated: DecalInstance) => void;
  onDeselect: () => void;
  onRecolorAll: (sourceColor: string | null, newColor: string | null) => void;
  onSelectAllColor: (color: string | null) => void;
  countMatchingColor: (color: string | null) => number;
}

const SingleDecalView: React.FC<SingleDecalViewProps> = ({ decal, proto, onUpdate, onDeselect, onRecolorAll, onSelectAllColor, countMatchingColor }) => {
  const angleDeg = Math.round(decal.angle * 180 / Math.PI);
  const colorHex = decal.color ? colorToHex(decal.color) : '#ffffff';
  const colorAlpha = decal.color ? colorToAlpha(decal.color) : 255;
  // Always allow color editing, defaultCustomColor is just a placement UI hint,
  // not a restriction. Imported decals may already have custom colors set.

  const thumbnailSrc = (() => {
    if (!proto || !proto.state) return null;
    const rsi = proto.rsiPath;
    const path = rsi.startsWith('Textures/') ? `/${rsi}/${proto.state}.png` : `/Textures/${rsi}/${proto.state}.png`;
    try { return getActiveProvider().getImageUrl(path); } catch { return null; }
  })();

  return (
    <div className="p-3 flex flex-col gap-2 text-xs">
      <div className="flex justify-between items-center">
        <span className="font-bold text-xs">Decal Info</span>
        <button
          onClick={onDeselect}
          className="bg-transparent border-none text-muted text-[16px] cursor-pointer px-1 leading-none"
          title="Deselect"
        >
          &times;
        </button>
      </div>

      {/* Prototype name */}
      <span className="text-primary text-[11px] font-medium overflow-hidden text-ellipsis whitespace-nowrap" title={String(decal.prototypeId)}>
        {String(decal.prototypeId)}
      </span>

      {/* Large sprite preview with color tint */}
      {thumbnailSrc && (
        <div
          className="flex items-center justify-center bg-surface border border-subtle rounded-sm p-2"
          style={{ minHeight: 80 }}
        >
          <img
            src={thumbnailSrc}
            alt={String(decal.prototypeId)}
            className="w-16 h-16"
            style={{
              imageRendering: 'pixelated',
              transform: decal.angle !== 0 ? `rotate(${-decal.angle}rad)` : undefined,
              filter: decal.color ? undefined : undefined,
            }}
          />
        </div>
      )}
      {decal.color && (
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 border border-subtle rounded-sm shrink-0"
            style={{ backgroundColor: colorHex, opacity: colorAlpha / 255 }}
          />
          <span className="text-[10px] text-muted">{decal.color}</span>
        </div>
      )}

      {/* Position (read-only) */}
      <InfoRow label="Position" value={`${decal.position.x.toFixed(2)}, ${decal.position.y.toFixed(2)}`} />
      <InfoRow label="ID" value={String(decal.id)} />

      {/* Color */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted">Color</span>
        <div className="flex items-center gap-1">
          <input
            type="color"
            value={colorHex}
            onChange={(e) => {
              const newColor = hexAlphaToColor(e.target.value, colorAlpha);
              onUpdate({ ...decal, color: newColor });
            }}
            className="w-6 h-6 p-0 border border-subtle rounded-sm cursor-pointer"
          />
          <span className="text-[10px] text-muted">A:</span>
          <input
            type="number"
            min={0}
            max={255}
            value={colorAlpha}
            onChange={(e) => {
              const a = Math.max(0, Math.min(255, parseInt(e.target.value) || 0));
              const newColor = hexAlphaToColor(colorHex, a);
              onUpdate({ ...decal, color: newColor });
            }}
            className="bg-elevated border border-subtle rounded-sm text-primary text-[11px] px-2 py-1 w-14"
          />
          {decal.color && (
            <button
              onClick={() => onUpdate({ ...decal, color: null })}
              className="text-[10px] text-muted hover:text-primary cursor-pointer px-1"
              title="Reset to default (no custom color)"
            >
              ✕
            </button>
          )}
        </div>
        <ColorBulkActions
          color={decal.color}
          matchCount={countMatchingColor(decal.color)}
          onSelectAll={() => onSelectAllColor(decal.color)}
          onRecolorAll={(newColor) => onRecolorAll(decal.color, newColor)}
        />
      </div>

      {/* Angle */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted">Angle</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={360}
            value={angleDeg}
            onChange={(e) => {
              const deg = parseFloat(e.target.value) || 0;
              onUpdate({ ...decal, angle: deg * Math.PI / 180 });
            }}
            className="bg-elevated border border-subtle rounded-sm text-primary text-[11px] px-2 py-1 w-16"
          />
          <span className="text-[10px] text-muted">&deg;</span>
        </div>
      </div>

      {/* Z-Index */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted">Z-Index</span>
        <input
          type="number"
          value={decal.zIndex}
          onChange={(e) => {
            const z = parseInt(e.target.value) || 0;
            onUpdate({ ...decal, zIndex: z });
          }}
          className="bg-elevated border border-subtle rounded-sm text-primary text-[11px] px-2 py-1 w-16"
        />
      </div>

      {/* Cleanable */}
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={decal.cleanable}
          onChange={(e) => onUpdate({ ...decal, cleanable: e.target.checked })}
          className="accent-accent w-3 h-3"
        />
        <span className="text-[11px] text-primary">Cleanable</span>
      </label>
    </div>
  );
};

// ---- Multi-select view ----

interface MultiDecalViewProps {
  decals: DecalInstance[];
  registry: IPrototypeRegistry | null;
  onUpdate: (updates: { updated: DecalInstance; original: DecalInstance }[]) => void;
  onDeselect: () => void;
  onRecolorAll: (sourceColor: string | null, newColor: string | null) => void;
  onSelectAllColor: (color: string | null) => void;
  countMatchingColor: (color: string | null) => number;
}

const MultiDecalView: React.FC<MultiDecalViewProps> = ({ decals, registry, onUpdate, onDeselect, onRecolorAll, onSelectAllColor, countMatchingColor }) => {
  // Compute shared values
  const sharedColor = allSame(decals, d => d.color);
  const sharedAngle = allSame(decals, d => d.angle);
  const sharedZIndex = allSame(decals, d => d.zIndex);
  const sharedCleanable = allSame(decals, d => d.cleanable);

  // Check if all selected decals support custom color
  const allSupportColor = decals.every(d => {
    const p = registry?.getDecal(d.prototypeId);
    return p?.defaultCustomColor ?? true;
  });

  const angleDeg = sharedAngle !== undefined ? Math.round(sharedAngle * 180 / Math.PI) : undefined;
  const colorHex = sharedColor !== undefined && sharedColor !== null ? colorToHex(sharedColor) : '#ffffff';
  const colorAlpha = sharedColor !== undefined && sharedColor !== null ? colorToAlpha(sharedColor) : 255;

  const applyToAll = (field: keyof DecalInstance, value: unknown) => {
    onUpdate(decals.map(d => ({
      original: d,
      updated: { ...d, [field]: value },
    })));
  };

  return (
    <div className="p-3 flex flex-col gap-2 text-xs">
      <div className="flex justify-between items-center">
        <span className="font-bold text-xs">{decals.length} Decals Selected</span>
        <button
          onClick={onDeselect}
          className="bg-transparent border-none text-muted text-[16px] cursor-pointer px-1 leading-none"
          title="Deselect all"
        >
          &times;
        </button>
      </div>

      <div className="text-muted text-[10px]">
        {summarizeDecalPrototypes(decals)}
      </div>

      {/* Color */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted">Color</span>
        {allSupportColor ? (
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={sharedColor !== undefined ? colorHex : '#ffffff'}
              onChange={(e) => {
                const a = sharedColor !== undefined && sharedColor !== null ? colorToAlpha(sharedColor) : 255;
                applyToAll('color', hexAlphaToColor(e.target.value, a));
              }}
              className="w-6 h-6 p-0 border border-subtle rounded-sm cursor-pointer"
            />
            <span className="text-[10px] text-muted">A:</span>
            <input
              type="number"
              min={0}
              max={255}
              value={sharedColor !== undefined ? colorAlpha : ''}
              placeholder={sharedColor === undefined ? '\u2014' : ''}
              onChange={(e) => {
                const a = Math.max(0, Math.min(255, parseInt(e.target.value) || 0));
                const hex = sharedColor !== undefined && sharedColor !== null ? colorToHex(sharedColor) : '#ffffff';
                applyToAll('color', hexAlphaToColor(hex, a));
              }}
              className="bg-elevated border border-subtle rounded-sm text-primary text-[11px] px-2 py-1 w-14"
            />
          </div>
        ) : (
          <span className="text-[10px] text-muted italic">Mixed color support</span>
        )}
        {sharedColor !== undefined && (
          <ColorBulkActions
            color={sharedColor}
            matchCount={countMatchingColor(sharedColor)}
            onSelectAll={() => onSelectAllColor(sharedColor!)}
            onRecolorAll={(newColor) => onRecolorAll(sharedColor!, newColor)}
          />
        )}
      </div>

      {/* Angle */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted">Angle</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={360}
            value={angleDeg ?? ''}
            placeholder={sharedAngle === undefined ? '\u2014' : ''}
            onChange={(e) => {
              const deg = parseFloat(e.target.value) || 0;
              applyToAll('angle', deg * Math.PI / 180);
            }}
            className="bg-elevated border border-subtle rounded-sm text-primary text-[11px] px-2 py-1 w-16"
          />
          <span className="text-[10px] text-muted">&deg;</span>
        </div>
      </div>

      {/* Z-Index */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted">Z-Index</span>
        <input
          type="number"
          value={sharedZIndex ?? ''}
          placeholder={sharedZIndex === undefined ? '\u2014' : ''}
          onChange={(e) => {
            const z = parseInt(e.target.value) || 0;
            applyToAll('zIndex', z);
          }}
          className="bg-elevated border border-subtle rounded-sm text-primary text-[11px] px-2 py-1 w-16"
        />
      </div>

      {/* Cleanable */}
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={sharedCleanable ?? false}
          ref={(el) => {
            if (el) el.indeterminate = sharedCleanable === undefined;
          }}
          onChange={(e) => applyToAll('cleanable', e.target.checked)}
          className="accent-accent w-3 h-3"
        />
        <span className="text-[11px] text-primary">
          Cleanable{sharedCleanable === undefined ? ' (mixed)' : ''}
        </span>
      </label>
    </div>
  );
};

// ---- Color bulk actions ----

interface ColorBulkActionsProps {
  color: string | null;
  matchCount: number;
  onSelectAll: () => void;
  onRecolorAll: (newColor: string | null) => void;
}

const ColorBulkActions: React.FC<ColorBulkActionsProps> = ({ color, matchCount, onSelectAll, onRecolorAll }) => {
  const [showRecolor, setShowRecolor] = useState(false);
  const [newColor, setNewColor] = useState(color ? colorToHex(color) : '#ffffff');
  const [newAlpha, setNewAlpha] = useState(color ? colorToAlpha(color) : 255);

  if (matchCount <= 1) return null;

  return (
    <div className="flex flex-col gap-1 mt-1">
      <div className="flex items-center gap-1">
        <button
          onClick={onSelectAll}
          className="bg-transparent border border-subtle rounded-sm text-muted text-[10px] cursor-pointer px-1.5 py-0.5 hover:text-primary hover:border-primary"
          title={`Select all ${matchCount} decals with this color`}
        >
          Select All ({matchCount})
        </button>
        <button
          onClick={() => setShowRecolor(!showRecolor)}
          className="bg-transparent border border-subtle rounded-sm text-muted text-[10px] cursor-pointer px-1.5 py-0.5 hover:text-primary hover:border-primary"
          title={`Recolor all ${matchCount} decals with this color`}
        >
          Recolor All
        </button>
      </div>
      {showRecolor && (
        <div className="flex items-center gap-1 bg-surface rounded-sm p-1.5 border border-subtle">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-5 h-5 p-0 border border-subtle rounded-sm cursor-pointer"
          />
          <span className="text-[9px] text-muted">A:</span>
          <input
            type="number"
            min={0}
            max={255}
            value={newAlpha}
            onChange={(e) => setNewAlpha(Math.max(0, Math.min(255, parseInt(e.target.value) || 0)))}
            className="bg-elevated border border-subtle rounded-sm text-primary text-[10px] px-1 py-0.5 w-10"
          />
          <button
            onClick={() => {
              onRecolorAll(hexAlphaToColor(newColor, newAlpha));
              setShowRecolor(false);
            }}
            className="bg-accent text-white border-none rounded-sm text-[10px] cursor-pointer px-1.5 py-0.5 hover:opacity-90"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
};

// ---- Shared helpers ----

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between py-px">
    <span className="text-muted">{label}:</span>
    <span className="text-primary max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap text-right" title={value}>
      {value}
    </span>
  </div>
);

/** Returns the shared value if all items have the same value for a field, otherwise undefined. */
function allSame<T, V>(items: T[], getter: (item: T) => V): V | undefined {
  if (items.length === 0) return undefined;
  const first = getter(items[0]);
  for (let i = 1; i < items.length; i++) {
    if (getter(items[i]) !== first) return undefined;
  }
  return first;
}

function summarizeDecalPrototypes(decals: DecalInstance[]): string {
  const counts = new Map<string, number>();
  for (const d of decals) {
    counts.set(d.prototypeId, (counts.get(d.prototypeId) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top3 = sorted.slice(0, 3).map(([proto, count]) => `${proto} x${count}`);
  if (sorted.length > 3) top3.push(`+${sorted.length - 3} more types`);
  return top3.join(', ');
}

/** Extract hex color (#RRGGBB) from a color string like "#RRGGBBAA" or "#RRGGBB". */
function colorToHex(color: string): string {
  if (color.startsWith('#') && color.length >= 7) {
    return color.substring(0, 7).toLowerCase();
  }
  return '#ffffff';
}

/** Extract alpha (0-255) from a color string like "#RRGGBBAA". */
function colorToAlpha(color: string): number {
  if (color.startsWith('#') && color.length >= 9) {
    return parseInt(color.substring(7, 9), 16);
  }
  return 255;
}

/** Combine hex (#RRGGBB) and alpha (0-255) into "#RRGGBBAA". */
function hexAlphaToColor(hex: string, alpha: number): string {
  const rgb = hex.startsWith('#') ? hex.substring(1, 7) : hex;
  const a = Math.max(0, Math.min(255, alpha)).toString(16).padStart(2, '0');
  return `#${rgb}${a}`.toUpperCase();
}
