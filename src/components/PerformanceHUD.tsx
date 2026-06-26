import React, { useRef, useEffect, useState } from 'react';
import { getStats } from '../rendering/renderStats';

export const PerformanceHUD: React.FC = () => {
  const [, forceUpdate] = useState(0);
  const rafRef = useRef(0);

  // Update HUD at ~4 Hz (every 250ms) to avoid DOM thrashing
  useEffect(() => {
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 250) {
        last = now;
        forceUpdate(n => n + 1);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const s = getStats();

  const fpsColor = s.fps >= 55 ? '#4caf50' : s.fps >= 30 ? '#ff9800' : '#f44336';
  const ftColor = s.frameTime <= 8 ? '#4caf50' : s.frameTime <= 16 ? '#ff9800' : '#f44336';

  return (
    <div style={{
      position: 'absolute',
      bottom: 8,
      left: 8,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      color: '#ccc',
      padding: '6px 10px',
      borderRadius: 4,
      fontSize: 11,
      fontFamily: 'monospace',
      lineHeight: 1.6,
      pointerEvents: 'none',
      zIndex: 100,
      minWidth: 140,
      userSelect: 'none',
    }}>
      <div style={{ color: '#888', fontWeight: 'bold', marginBottom: 2 }}>Performance</div>
      <Row label="FPS" value={String(s.fps)} color={fpsColor} />
      <Row label="Frame" value={s.frameTime > 0 ? `${s.frameTime} ms` : 'skip'} color={ftColor} />
      <Row label="Draws" value={s.drawCalls.toLocaleString()} />

      <div style={{ color: '#888', fontWeight: 'bold', marginTop: 4, marginBottom: 2 }}>Scene</div>
      <Row label="Total" value={s.totalEntities.toLocaleString()} />
      <Row label="Visible" value={s.visibleEntities.toLocaleString()} />
      <Row label="Selected" value={String(s.selectedCount)} />
      {s.lodActive && <Row label="LOD" value="dots" color="#ff9800" />}

      <div style={{ color: '#888', fontWeight: 'bold', marginTop: 4, marginBottom: 2 }}>Camera</div>
      <Row label="Zoom" value={`${s.zoom.toFixed(2)}x`} />
      <Row label="px/tile" value={s.pxPerTile.toFixed(1)} />

      <div style={{ color: '#888', fontWeight: 'bold', marginTop: 4, marginBottom: 2 }}>Layers</div>
      <Row label="Tiles" value={s.tilesRedrawn ? 'redraw' : 'cache'} color={s.tilesRedrawn ? '#ff4' : '#4f4'} />
      <Row label="Entities" value={s.entitiesRedrawn ? 'redraw' : 'cache'} color={s.entitiesRedrawn ? '#ff4' : '#4f4'} />
      <Row label="Mode" value={s.zoomDeferred ? 'zoom-defer' : 'composite'} color={s.zoomDeferred ? '#f80' : '#4f4'} />
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
    <span style={{ color: '#888' }}>{label}</span>
    <span style={{ color: color ?? '#e0e0e0' }}>{value}</span>
  </div>
);
