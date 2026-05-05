import { test, expect } from '@playwright/test';
import { startTracing, stopTracing, parseTrace, formatMetrics } from '../helpers/perf-tracing';
import type { PerfMetrics } from '../helpers/perf-tracing';
import { injectFrameCounter, readFrameCounter, formatFrameCounter } from '../helpers/frame-counter';
import type { FrameCounterResult } from '../helpers/frame-counter';
import { searchAndPlay } from '../helpers/search-and-play';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------
// Initial lenient thresholds for baseline measurement.
// Tighten these after fixing the perf issues.

// Baseline (pre-fix, 2026-04-17):  Long tasks: 25-88, Layouts: 330-386, Dropped: ~7%
// Post-fix (rAF + isolated rendering): Long tasks: ~18, Layouts: ~9, Dropped: ~1.2%

const THRESHOLDS = {
  /** Minimum average FPS during playback */
  minAvgFps: 30,
  /** Maximum 95th-percentile frame time in ms */
  maxP95FrameTimeMs: 50,
  /** Maximum percentage of dropped frames (>33ms gap) */
  maxDroppedFramePct: 5,
  /** Maximum number of long tasks (>50ms) in the observation window */
  maxLongTaskCount: 20, // top-level tasks only; WS call ingestion adds some
  /** Maximum single long task duration in ms */
  maxSingleLongTaskMs: 600, // WS call ingestion (audio decode) can spike
  /** Maximum total long task time in ms */
  maxLongTaskTotalMs: 5000, // variable — WS call ingestion during busy traffic
  /** Maximum Layout events in the observation window */
  maxLayoutCount: 30,
  /** Maximum single Layout duration in ms */
  maxSingleLayoutMs: 10,
};

/** How long to observe playback in ms */
const OBSERVATION_WINDOW_MS = 8_000;
/** Minimum observation time to consider results valid */
const MIN_OBSERVATION_MS = 3_000;

// ---------------------------------------------------------------------------
// Shared state across tests in this suite
// ---------------------------------------------------------------------------

let cdpMetrics: PerfMetrics;
let frameMetrics: FrameCounterResult;
let metricsCollected = false;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Playback performance', () => {
  // Auth + search + play + 8s observation = needs more than the default 60s
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser }) => {
    // Create a fresh context with performance-friendly settings
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    try {
      // 1. Search for a call and start playback
      const handle = await searchAndPlay(page, {
        preferMultipleSources: true,
      });

      // 2. Wait for playback to actually start
      await handle.waitForPlaybackStart();

      // 3. Warm-up: let residual activity settle (drawer close animation,
      //    WebSocket bursts, MUI transitions) before measuring steady state
      await handle.waitForDuration(3_000);

      // 4. Start both measurement methods
      const cdpSession = await startTracing(page);
      await injectFrameCounter(page);

      // 4. Observe for the specified window
      await handle.waitForDuration(OBSERVATION_WINDOW_MS);

      // 5. Collect results
      frameMetrics = await readFrameCounter(page);
      const traceBuffer = await stopTracing(cdpSession);
      cdpMetrics = parseTrace(traceBuffer);

      // 6. Save raw trace for manual inspection
      const artifactDir = path.join(__dirname, '..', 'test-results');
      if (!fs.existsSync(artifactDir)) {
        fs.mkdirSync(artifactDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(artifactDir, 'playback-trace.json'),
        traceBuffer,
      );

      // 7. Print metrics to console
      console.log('\n' + formatMetrics(cdpMetrics));
      console.log('\n' + formatFrameCounter(frameMetrics));

      metricsCollected = true;
    } finally {
      await context.close();
    }
  });

  test.beforeEach(() => {
    test.skip(!metricsCollected, 'Metrics collection failed — skipping assertions');
  });

  // -----------------------------------------------------------------------
  // Frame rate
  // -----------------------------------------------------------------------

  test('maintains acceptable frame rate during playback', () => {
    // Check we have enough data
    if (cdpMetrics.traceDurationMs < MIN_OBSERVATION_MS) {
      test.skip(true, `Trace too short: ${cdpMetrics.traceDurationMs.toFixed(0)}ms < ${MIN_OBSERVATION_MS}ms`);
    }

    console.log(
      `FPS: avg=${cdpMetrics.avgFps.toFixed(1)}, p95 frame=${cdpMetrics.p95FrameTimeMs.toFixed(1)}ms, ` +
        `rAF dropped=${frameMetrics.droppedFramePct.toFixed(1)}%`,
    );

    expect(
      cdpMetrics.avgFps,
      `Average FPS ${cdpMetrics.avgFps.toFixed(1)} < threshold ${THRESHOLDS.minAvgFps}`,
    ).toBeGreaterThanOrEqual(THRESHOLDS.minAvgFps);

    expect(
      cdpMetrics.p95FrameTimeMs,
      `P95 frame time ${cdpMetrics.p95FrameTimeMs.toFixed(1)}ms > threshold ${THRESHOLDS.maxP95FrameTimeMs}ms`,
    ).toBeLessThanOrEqual(THRESHOLDS.maxP95FrameTimeMs);

    expect(
      frameMetrics.droppedFramePct,
      `Dropped frames ${frameMetrics.droppedFramePct.toFixed(1)}% > threshold ${THRESHOLDS.maxDroppedFramePct}%`,
    ).toBeLessThanOrEqual(THRESHOLDS.maxDroppedFramePct);
  });

  // -----------------------------------------------------------------------
  // Long tasks
  // -----------------------------------------------------------------------

  test('no excessive long tasks during playback', () => {
    console.log(
      `Long tasks: count=${cdpMetrics.longTaskCount}, max=${cdpMetrics.maxLongTaskMs.toFixed(1)}ms, ` +
        `total=${cdpMetrics.longTaskTotalMs.toFixed(1)}ms`,
    );

    expect(
      cdpMetrics.longTaskCount,
      `Long task count ${cdpMetrics.longTaskCount} > threshold ${THRESHOLDS.maxLongTaskCount}`,
    ).toBeLessThanOrEqual(THRESHOLDS.maxLongTaskCount);

    expect(
      cdpMetrics.maxLongTaskMs,
      `Max long task ${cdpMetrics.maxLongTaskMs.toFixed(1)}ms > threshold ${THRESHOLDS.maxSingleLongTaskMs}ms`,
    ).toBeLessThanOrEqual(THRESHOLDS.maxSingleLongTaskMs);

    expect(
      cdpMetrics.longTaskTotalMs,
      `Total long task time ${cdpMetrics.longTaskTotalMs.toFixed(1)}ms > threshold ${THRESHOLDS.maxLongTaskTotalMs}ms`,
    ).toBeLessThanOrEqual(THRESHOLDS.maxLongTaskTotalMs);
  });

  // -----------------------------------------------------------------------
  // Layout thrashing
  // -----------------------------------------------------------------------

  test('no layout thrashing during playback', () => {
    console.log(
      `Layouts: count=${cdpMetrics.layoutCount}, max=${cdpMetrics.maxLayoutMs.toFixed(1)}ms, ` +
        `total=${cdpMetrics.layoutTotalMs.toFixed(1)}ms`,
    );

    expect(
      cdpMetrics.layoutCount,
      `Layout count ${cdpMetrics.layoutCount} > threshold ${THRESHOLDS.maxLayoutCount}`,
    ).toBeLessThanOrEqual(THRESHOLDS.maxLayoutCount);

    expect(
      cdpMetrics.maxLayoutMs,
      `Max layout ${cdpMetrics.maxLayoutMs.toFixed(1)}ms > threshold ${THRESHOLDS.maxSingleLayoutMs}ms`,
    ).toBeLessThanOrEqual(THRESHOLDS.maxSingleLayoutMs);
  });
});
