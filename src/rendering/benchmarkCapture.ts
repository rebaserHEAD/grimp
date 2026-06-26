/**
 * Benchmark Capture, records per-frame metrics between start/stop,
 * then computes a summary for before/after optimization comparison.
 */

import { getStats } from './renderStats';

interface FrameSample {
  frameTime: number;    // ms
  drawCalls: number;
  visibleEntities: number;
  tilesRedrawn: boolean;
  entitiesRedrawn: boolean;
  skipped: boolean;     // frame was skipped (idle)
}

export interface BenchmarkResult {
  // Timing
  durationMs: number;
  totalFrames: number;
  renderedFrames: number;   // non-skipped
  skippedFrames: number;

  // FPS
  avgFps: number;
  minFps: number;           // 1-second window minimum
  p1Fps: number;            // 1% low (worst 1% of 1-second windows)

  // Frame time (rendered frames only)
  avgFrameTime: number;
  medianFrameTime: number;
  p95FrameTime: number;     // 95th percentile
  p99FrameTime: number;     // 99th percentile
  maxFrameTime: number;

  // Draw calls (rendered frames only)
  avgDrawCalls: number;
  maxDrawCalls: number;

  // Scene
  avgVisibleEntities: number;
  totalEntities: number;

  // Layer cache efficiency
  tileRedrawRate: number;    // % of rendered frames that redrew tiles
  entityRedrawRate: number;  // % of rendered frames that redrew entities

  // Meta
  startTime: string;         // ISO timestamp
  zoom: number;
  pxPerTile: number;
}

const BENCHMARK_DURATION_MS = 15_000; // 15 seconds

let capturing = false;
let samples: FrameSample[] = [];
let startTimestamp = 0;
let frameTimestamps: number[] = [];   // for computing FPS over time windows
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
let onAutoStop: (() => void) | null = null;

export function isBenchmarkCapturing(): boolean {
  return capturing;
}

/** Returns remaining seconds, or 0 if not capturing. */
export function getBenchmarkRemaining(): number {
  if (!capturing) return 0;
  const elapsed = performance.now() - startTimestamp;
  return Math.max(0, Math.ceil((BENCHMARK_DURATION_MS - elapsed) / 1000));
}

/**
 * Start a benchmark capture that auto-stops after 15 seconds.
 * @param onComplete, called when the timer expires (so the UI can update)
 */
export function startBenchmark(onComplete?: () => void): void {
  samples = [];
  frameTimestamps = [];
  startTimestamp = performance.now();
  capturing = true;
  onAutoStop = onComplete ?? null;

  if (autoStopTimer) clearTimeout(autoStopTimer);
  autoStopTimer = setTimeout(() => {
    autoStopTimer = null;
    if (capturing && onAutoStop) {
      onAutoStop();
    }
  }, BENCHMARK_DURATION_MS);
}

/** Call every animation frame (even skipped ones) while capturing. */
export function benchmarkSample(): void {
  if (!capturing) return;

  const s = getStats();
  const skipped = s.frameTime === 0;

  samples.push({
    frameTime: s.frameTime,
    drawCalls: s.drawCalls,
    visibleEntities: s.visibleEntities,
    tilesRedrawn: s.tilesRedrawn,
    entitiesRedrawn: s.entitiesRedrawn,
    skipped,
  });

  frameTimestamps.push(performance.now());
}

export function stopBenchmark(): BenchmarkResult | null {
  if (!capturing) return null;
  capturing = false;
  if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null; }
  onAutoStop = null;

  const endTimestamp = performance.now();
  const durationMs = endTimestamp - startTimestamp;
  const s = getStats();

  if (samples.length === 0) {
    return null;
  }

  const rendered = samples.filter(f => !f.skipped);
  const skipped = samples.length - rendered.length;

  // Frame times (rendered only)
  const frameTimes = rendered.map(f => f.frameTime).sort((a, b) => a - b);
  const avgFrameTime = frameTimes.length > 0
    ? frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length : 0;
  const medianFrameTime = percentile(frameTimes, 0.5);
  const p95FrameTime = percentile(frameTimes, 0.95);
  const p99FrameTime = percentile(frameTimes, 0.99);
  const maxFrameTime = frameTimes.length > 0 ? frameTimes[frameTimes.length - 1] : 0;

  // Draw calls
  const drawCalls = rendered.map(f => f.drawCalls);
  const avgDrawCalls = drawCalls.length > 0
    ? drawCalls.reduce((a, b) => a + b, 0) / drawCalls.length : 0;
  const maxDrawCalls = drawCalls.length > 0 ? Math.max(...drawCalls) : 0;

  // Visible entities
  const visibleEnts = rendered.map(f => f.visibleEntities);
  const avgVisibleEntities = visibleEnts.length > 0
    ? visibleEnts.reduce((a, b) => a + b, 0) / visibleEnts.length : 0;

  // Layer redraw rates
  const tileRedraws = rendered.filter(f => f.tilesRedrawn).length;
  const entityRedraws = rendered.filter(f => f.entitiesRedrawn).length;
  const tileRedrawRate = rendered.length > 0 ? tileRedraws / rendered.length : 0;
  const entityRedrawRate = rendered.length > 0 ? entityRedraws / rendered.length : 0;

  // FPS, compute over 1-second sliding windows
  const fpsWindows = computeFpsWindows(frameTimestamps, 1000);
  const avgFps = durationMs > 0 ? (samples.length * 1000) / durationMs : 0;
  const minFps = fpsWindows.length > 0 ? Math.min(...fpsWindows) : avgFps;
  const sortedFps = [...fpsWindows].sort((a, b) => a - b);
  const p1Fps = sortedFps.length > 0 ? percentile(sortedFps, 0.01) : minFps;

  return {
    durationMs,
    totalFrames: samples.length,
    renderedFrames: rendered.length,
    skippedFrames: skipped,
    avgFps: round2(avgFps),
    minFps: round2(minFps),
    p1Fps: round2(p1Fps),
    avgFrameTime: round2(avgFrameTime),
    medianFrameTime: round2(medianFrameTime),
    p95FrameTime: round2(p95FrameTime),
    p99FrameTime: round2(p99FrameTime),
    maxFrameTime: round2(maxFrameTime),
    avgDrawCalls: Math.round(avgDrawCalls),
    maxDrawCalls,
    avgVisibleEntities: Math.round(avgVisibleEntities),
    totalEntities: s.totalEntities,
    tileRedrawRate: round2(tileRedrawRate * 100),
    entityRedrawRate: round2(entityRedrawRate * 100),
    startTime: new Date(Date.now() - durationMs).toISOString(),
    zoom: round2(s.zoom),
    pxPerTile: round2(s.pxPerTile),
  };
}

/** Compute FPS for each 1-second window across the capture. */
function computeFpsWindows(timestamps: number[], windowMs: number): number[] {
  if (timestamps.length < 2) return [];
  const windows: number[] = [];
  let windowStart = 0;
  for (let i = 0; i < timestamps.length; i++) {
    while (timestamps[i] - timestamps[windowStart] > windowMs) {
      windowStart++;
    }
    // Only record a window once we have a full second of data
    if (timestamps[i] - timestamps[0] >= windowMs) {
      windows.push(i - windowStart + 1);
    }
  }
  return windows;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
