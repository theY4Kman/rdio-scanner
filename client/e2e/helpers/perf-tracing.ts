import type { Page, CDPSession } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PerfMetrics {
  /** Average frames per second during the trace window */
  avgFps: number;
  /** 95th percentile frame time in milliseconds */
  p95FrameTimeMs: number;
  /** Number of main-thread tasks exceeding 50ms */
  longTaskCount: number;
  /** Duration of the longest single task in ms */
  maxLongTaskMs: number;
  /** Total time spent in long tasks in ms */
  longTaskTotalMs: number;
  /** Number of Layout events during the trace */
  layoutCount: number;
  /** Total time spent in Layout in ms */
  layoutTotalMs: number;
  /** Duration of the longest single Layout event in ms */
  maxLayoutMs: number;
  /** Raw frame durations for inspection */
  frameDurationsMs: number[];
  /** Trace duration in ms */
  traceDurationMs: number;
}

// ---------------------------------------------------------------------------
// Trace event types (subset of Chrome Trace Event Format)
// ---------------------------------------------------------------------------

interface TraceEvent {
  name: string;
  cat: string;
  ph: string; // phase: 'X' (complete), 'B' (begin), 'E' (end), 'I' (instant)
  ts: number; // microseconds
  dur?: number; // microseconds (for 'X' events)
  pid: number;
  tid: number;
  args?: Record<string, unknown>;
}

interface TraceData {
  traceEvents: TraceEvent[];
}

// ---------------------------------------------------------------------------
// Start / Stop
// ---------------------------------------------------------------------------

export async function startTracing(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);

  await client.send('Tracing.start', {
    categories: [
      'devtools.timeline',
      'v8.execute',
      'blink.user_timing',
      'toplevel',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
    ].join(','),
    options: 'sampling-frequency=10000', // 10kHz sampling
  });

  return client;
}

export async function stopTracing(client: CDPSession): Promise<Buffer> {
  const chunks: Buffer[] = [];

  // Tracing.tracingComplete fires when all data has been collected
  const done = new Promise<void>((resolve) => {
    client.on('Tracing.tracingComplete', () => resolve());
  });

  // Tracing.dataCollected fires with chunks of trace data
  client.on('Tracing.dataCollected', (data: { value: unknown[] }) => {
    chunks.push(Buffer.from(JSON.stringify(data.value)));
  });

  await client.send('Tracing.end');
  await done;

  // Reconstruct trace JSON: merge all chunks into a single array
  const merged = chunks.map((c) => JSON.parse(c.toString())).flat();
  return Buffer.from(JSON.stringify({ traceEvents: merged }));
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export function parseTrace(traceBuffer: Buffer): PerfMetrics {
  const data: TraceData = JSON.parse(traceBuffer.toString());
  const events = data.traceEvents;

  // --- Frame durations ---
  const frameTimes: number[] = [];
  const beginFrameEvents = events
    .filter(
      (e) =>
        e.name === 'BeginMainThreadFrame' ||
        e.name === 'DrawFrame' ||
        e.name === 'Commit',
    )
    .sort((a, b) => a.ts - b.ts);

  for (let i = 1; i < beginFrameEvents.length; i++) {
    const dt = (beginFrameEvents[i].ts - beginFrameEvents[i - 1].ts) / 1000;
    if (dt > 0 && dt < 1000) {
      frameTimes.push(dt);
    }
  }

  // Fallback: if no frame events, try CompositeLayers
  if (frameTimes.length === 0) {
    const compositeEvents = events
      .filter((e) => e.name === 'CompositeLayers')
      .sort((a, b) => a.ts - b.ts);

    for (let i = 1; i < compositeEvents.length; i++) {
      const dt = (compositeEvents[i].ts - compositeEvents[i - 1].ts) / 1000;
      if (dt > 0 && dt < 1000) {
        frameTimes.push(dt);
      }
    }
  }

  // --- Long tasks ---
  // Only count top-level task events (RunTask, RunMicrotasks, FireAnimationFrame)
  // to avoid double-counting nested events (a 500ms RunTask containing a 400ms
  // FunctionCall would otherwise count both, inflating the total).
  const mainThreadPid = findRendererPid(events);
  const topLevelTaskNames = new Set([
    'RunTask', 'RunMicrotasks', 'FireAnimationFrame',
    'FireIdleCallback', 'TimerFire',
  ]);
  const longTasks = events.filter(
    (e) =>
      e.ph === 'X' &&
      e.pid === mainThreadPid &&
      topLevelTaskNames.has(e.name) &&
      e.dur != null &&
      e.dur / 1000 > 50,
  );

  const longTaskDurations = longTasks.map((e) => (e.dur ?? 0) / 1000);
  const longTaskCount = longTaskDurations.length;
  const maxLongTaskMs =
    longTaskDurations.length > 0 ? Math.max(...longTaskDurations) : 0;
  const longTaskTotalMs = longTaskDurations.reduce((a, b) => a + b, 0);

  // --- Layout events ---
  const layoutEvents = events.filter(
    (e) =>
      (e.name === 'Layout' || e.name === 'UpdateLayoutTree') &&
      e.ph === 'X' &&
      e.dur != null,
  );

  const layoutDurations = layoutEvents.map((e) => (e.dur ?? 0) / 1000);
  const layoutCount = layoutDurations.length;
  const layoutTotalMs = layoutDurations.reduce((a, b) => a + b, 0);
  const maxLayoutMs =
    layoutDurations.length > 0 ? Math.max(...layoutDurations) : 0;

  // --- Compute FPS ---
  const sortedFrameTimes = [...frameTimes].sort((a, b) => a - b);
  const avgFrameTime =
    sortedFrameTimes.length > 0
      ? sortedFrameTimes.reduce((a, b) => a + b, 0) / sortedFrameTimes.length
      : 0;
  const avgFps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
  const p95Index = Math.floor(sortedFrameTimes.length * 0.95);
  const p95FrameTimeMs =
    sortedFrameTimes.length > 0 ? sortedFrameTimes[p95Index] : 0;

  // --- Trace duration ---
  const allTimestamps = events
    .filter((e) => e.ts > 0)
    .map((e) => e.ts);
  const traceDurationMs =
    allTimestamps.length > 1
      ? (Math.max(...allTimestamps) - Math.min(...allTimestamps)) / 1000
      : 0;

  return {
    avgFps,
    p95FrameTimeMs,
    longTaskCount,
    maxLongTaskMs,
    longTaskTotalMs,
    layoutCount,
    layoutTotalMs,
    maxLayoutMs,
    frameDurationsMs: frameTimes,
    traceDurationMs,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findRendererPid(events: TraceEvent[]): number {
  const pidCounts = new Map<number, number>();
  for (const e of events) {
    pidCounts.set(e.pid, (pidCounts.get(e.pid) ?? 0) + 1);
  }
  let maxPid = 0;
  let maxCount = 0;
  for (const [pid, count] of pidCounts) {
    if (count > maxCount) {
      maxPid = pid;
      maxCount = count;
    }
  }
  return maxPid;
}

// ---------------------------------------------------------------------------
// Pretty-print
// ---------------------------------------------------------------------------

export function formatMetrics(metrics: PerfMetrics): string {
  const lines = [
    `\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510`,
    `\u2502        Playback Performance Metrics      \u2502`,
    `\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524`,
    `\u2502 Trace duration        \u2502 ${pad(metrics.traceDurationMs.toFixed(0) + ' ms')} \u2502`,
    `\u2502 Avg FPS               \u2502 ${pad(metrics.avgFps.toFixed(1))} \u2502`,
    `\u2502 P95 frame time        \u2502 ${pad(metrics.p95FrameTimeMs.toFixed(1) + ' ms')} \u2502`,
    `\u2502 Frame count           \u2502 ${pad(String(metrics.frameDurationsMs.length))} \u2502`,
    `\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524`,
    `\u2502 Long task count       \u2502 ${pad(String(metrics.longTaskCount))} \u2502`,
    `\u2502 Max long task          \u2502 ${pad(metrics.maxLongTaskMs.toFixed(1) + ' ms')} \u2502`,
    `\u2502 Total long task time  \u2502 ${pad(metrics.longTaskTotalMs.toFixed(1) + ' ms')} \u2502`,
    `\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524`,
    `\u2502 Layout count          \u2502 ${pad(String(metrics.layoutCount))} \u2502`,
    `\u2502 Max layout            \u2502 ${pad(metrics.maxLayoutMs.toFixed(1) + ' ms')} \u2502`,
    `\u2502 Total layout time     \u2502 ${pad(metrics.layoutTotalMs.toFixed(1) + ' ms')} \u2502`,
    `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`,
  ];
  return lines.join('\n');
}

function pad(s: string, width = 15): string {
  return s.padStart(width);
}
