import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  isBenchmarkCapturing,
  startBenchmark,
  stopBenchmark,
  getBenchmarkRemaining,
} from '../rendering/benchmarkCapture';
import type { BenchmarkResult } from '../rendering/benchmarkCapture';

export const BenchmarkOverlay: React.FC = () => {
  const [capturing, setCapturing] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [remaining, setRemaining] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up countdown interval on unmount
  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const finishCapture = useCallback(() => {
    const r = stopBenchmark();
    setResult(r);
    setCapturing(false);
    setRemaining(0);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  const handleToggle = useCallback(() => {
    if (isBenchmarkCapturing()) {
      finishCapture();
    } else {
      setResult(null);
      startBenchmark(() => finishCapture());
      setCapturing(true);
      setRemaining(15);
      // Update countdown every second
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        const r = getBenchmarkRemaining();
        setRemaining(r);
      }, 200);
    }
  }, [finishCapture]);

  const handleCopy = useCallback(() => {
    if (!result) return;
    const text = formatResultText(result);
    navigator.clipboard.writeText(text);
  }, [result]);

  return (
    <div style={{
      position: 'absolute',
      top: 44,
      right: 8,
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 6,
      pointerEvents: 'auto',
    }}>
      {/* Start / Stop button */}
      <button
        onClick={handleToggle}
        style={{
          padding: '6px 16px',
          fontSize: 12,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          color: '#fff',
          backgroundColor: capturing ? '#c62828' : '#2e7d32',
          boxShadow: capturing
            ? '0 0 12px rgba(198, 40, 40, 0.6)'
            : '0 0 8px rgba(46, 125, 50, 0.4)',
        }}
      >
        {capturing ? `⏹ Stop (${remaining}s)` : '▶ Benchmark (15s)'}
      </button>

      {/* Recording indicator */}
      {capturing && (
        <div style={{
          padding: '4px 10px',
          fontSize: 11,
          fontFamily: 'monospace',
          backgroundColor: 'rgba(198, 40, 40, 0.85)',
          color: '#fff',
          borderRadius: 4,
          animation: 'benchPulse 1.5s ease-in-out infinite',
        }}>
          ● Recording... {remaining}s remaining
        </div>
      )}

      {/* Results panel */}
      {result && !capturing && (
        <div style={{
          backgroundColor: 'rgba(0, 0, 0, 0.88)',
          color: '#ccc',
          padding: '10px 14px',
          borderRadius: 6,
          fontSize: 11,
          fontFamily: 'monospace',
          lineHeight: 1.7,
          minWidth: 260,
          maxWidth: 320,
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ color: '#90caf9', fontWeight: 'bold', marginBottom: 4, fontSize: 12 }}>
            Benchmark Results
          </div>

          <Section title="Timing">
            <Row label="Duration" value={`${(result.durationMs / 1000).toFixed(1)}s`} />
            <Row label="Total Frames" value={String(result.totalFrames)} />
            <Row label="Rendered" value={String(result.renderedFrames)} />
            <Row label="Skipped (idle)" value={String(result.skippedFrames)} />
          </Section>

          <Section title="FPS">
            <Row label="Average" value={String(result.avgFps)} color={fpsColor(result.avgFps)} />
            <Row label="1% Low" value={String(result.p1Fps)} color={fpsColor(result.p1Fps)} />
            <Row label="Minimum" value={String(result.minFps)} color={fpsColor(result.minFps)} />
          </Section>

          <Section title="Frame Time (rendered)">
            <Row label="Average" value={`${result.avgFrameTime} ms`} color={ftColor(result.avgFrameTime)} />
            <Row label="Median" value={`${result.medianFrameTime} ms`} />
            <Row label="P95" value={`${result.p95FrameTime} ms`} color={ftColor(result.p95FrameTime)} />
            <Row label="P99" value={`${result.p99FrameTime} ms`} color={ftColor(result.p99FrameTime)} />
            <Row label="Max" value={`${result.maxFrameTime} ms`} color={ftColor(result.maxFrameTime)} />
          </Section>

          <Section title="Draw Calls">
            <Row label="Average" value={String(result.avgDrawCalls)} />
            <Row label="Max" value={String(result.maxDrawCalls)} />
          </Section>

          <Section title="Scene">
            <Row label="Total Entities" value={result.totalEntities.toLocaleString()} />
            <Row label="Avg Visible" value={result.avgVisibleEntities.toLocaleString()} />
            <Row label="Zoom" value={`${result.zoom}x`} />
            <Row label="px/tile" value={String(result.pxPerTile)} />
          </Section>

          <Section title="Cache Efficiency">
            <Row
              label="Tile Redraws"
              value={`${result.tileRedrawRate}%`}
              color={result.tileRedrawRate < 20 ? '#4caf50' : result.tileRedrawRate < 50 ? '#ff9800' : '#f44336'}
            />
            <Row
              label="Entity Redraws"
              value={`${result.entityRedrawRate}%`}
              color={result.entityRedrawRate < 20 ? '#4caf50' : result.entityRedrawRate < 50 ? '#ff9800' : '#f44336'}
            />
          </Section>

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={handleCopy}
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: 10,
                fontFamily: 'monospace',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 3,
                cursor: 'pointer',
                color: '#ccc',
                backgroundColor: 'rgba(255,255,255,0.08)',
              }}
            >
              Copy to Clipboard
            </button>
            <button
              onClick={() => setResult(null)}
              style={{
                padding: '4px 8px',
                fontSize: 10,
                fontFamily: 'monospace',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 3,
                cursor: 'pointer',
                color: '#888',
                backgroundColor: 'rgba(255,255,255,0.05)',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Pulse animation for recording indicator */}
      <style>{`
        @keyframes benchPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: '#666', fontWeight: 'bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: color ?? '#e0e0e0' }}>{value}</span>
    </div>
  );
}

function fpsColor(fps: number): string {
  if (fps >= 55) return '#4caf50';
  if (fps >= 30) return '#ff9800';
  return '#f44336';
}

function ftColor(ms: number): string {
  if (ms <= 8) return '#4caf50';
  if (ms <= 16) return '#ff9800';
  return '#f44336';
}

function formatResultText(r: BenchmarkResult): string {
  return [
    `=== Benchmark Results ===`,
    `Date: ${r.startTime}`,
    `Duration: ${(r.durationMs / 1000).toFixed(1)}s`,
    ``,
    `--- FPS ---`,
    `Average: ${r.avgFps}`,
    `1% Low:  ${r.p1Fps}`,
    `Minimum: ${r.minFps}`,
    ``,
    `--- Frame Time ---`,
    `Average: ${r.avgFrameTime} ms`,
    `Median:  ${r.medianFrameTime} ms`,
    `P95:     ${r.p95FrameTime} ms`,
    `P99:     ${r.p99FrameTime} ms`,
    `Max:     ${r.maxFrameTime} ms`,
    ``,
    `--- Scene ---`,
    `Total Entities:  ${r.totalEntities}`,
    `Avg Visible:     ${r.avgVisibleEntities}`,
    `Zoom: ${r.zoom}x (${r.pxPerTile} px/tile)`,
    ``,
    `--- Frames ---`,
    `Total:    ${r.totalFrames}`,
    `Rendered: ${r.renderedFrames}`,
    `Skipped:  ${r.skippedFrames}`,
    ``,
    `--- Cache Efficiency ---`,
    `Tile Redraws:   ${r.tileRedrawRate}%`,
    `Entity Redraws: ${r.entityRedrawRate}%`,
    `Draw Calls: avg ${r.avgDrawCalls}, max ${r.maxDrawCalls}`,
  ].join('\n');
}
