import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrameCounterResult {
  /** Total frames recorded */
  frameCount: number;
  /** Average inter-frame interval in ms */
  avgIntervalMs: number;
  /** 95th percentile inter-frame interval in ms */
  p95IntervalMs: number;
  /** Frames with gap > 33ms (~30fps threshold) */
  droppedFrames: number;
  /** Percentage of dropped frames */
  droppedFramePct: number;
  /** Raw inter-frame intervals for inspection */
  intervals: number[];
}

// ---------------------------------------------------------------------------
// Inject / Read
// ---------------------------------------------------------------------------

/**
 * Inject a rAF loop into the page that records frame timestamps.
 * Call this BEFORE starting the activity you want to measure.
 */
export async function injectFrameCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Reset any previous counter
    (window as any).__perfFrames = [] as number[];
    (window as any).__perfFrameRunning = true;

    const loop = () => {
      if (!(window as any).__perfFrameRunning) return;
      (window as any).__perfFrames.push(performance.now());
      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  });
}

/**
 * Stop the rAF loop and read back frame timing data.
 */
export async function readFrameCounter(page: Page): Promise<FrameCounterResult> {
  const timestamps: number[] = await page.evaluate(() => {
    (window as any).__perfFrameRunning = false;
    return (window as any).__perfFrames as number[];
  });

  if (timestamps.length < 2) {
    return {
      frameCount: timestamps.length,
      avgIntervalMs: 0,
      p95IntervalMs: 0,
      droppedFrames: 0,
      droppedFramePct: 0,
      intervals: [],
    };
  }

  // Compute inter-frame intervals
  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }

  const sorted = [...intervals].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Index] ?? sorted[sorted.length - 1];

  // Dropped = gaps exceeding 33ms (below 30fps)
  const dropped = intervals.filter((dt) => dt > 33).length;
  const droppedPct = (dropped / intervals.length) * 100;

  return {
    frameCount: timestamps.length,
    avgIntervalMs: avg,
    p95IntervalMs: p95,
    droppedFrames: dropped,
    droppedFramePct: droppedPct,
    intervals,
  };
}

// ---------------------------------------------------------------------------
// Pretty-print
// ---------------------------------------------------------------------------

export function formatFrameCounter(result: FrameCounterResult): string {
  const lines = [
    `\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510`,
    `\u2502        rAF Frame Counter Results         \u2502`,
    `\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524`,
    `\u2502 Frame count           \u2502 ${pad(String(result.frameCount))} \u2502`,
    `\u2502 Avg interval          \u2502 ${pad(result.avgIntervalMs.toFixed(1) + ' ms')} \u2502`,
    `\u2502 P95 interval          \u2502 ${pad(result.p95IntervalMs.toFixed(1) + ' ms')} \u2502`,
    `\u2502 Dropped frames        \u2502 ${pad(String(result.droppedFrames))} \u2502`,
    `\u2502 Dropped %             \u2502 ${pad(result.droppedFramePct.toFixed(1) + '%')} \u2502`,
    `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`,
  ];
  return lines.join('\n');
}

function pad(s: string, width = 15): string {
  return s.padStart(width);
}
