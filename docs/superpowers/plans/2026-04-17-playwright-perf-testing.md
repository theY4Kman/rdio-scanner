# Playwright Playback Performance Testing — Implementation Plan

> **Note (2026-05-05):** Inline paths below reference the historical `client-react/` directory, which has since been renamed to `client/`. Paths are preserved verbatim as a record of the work as it was carried out.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Playwright-based performance regression tests that measure frame rate, long tasks, and layout thrash during call playback in the React scanner client.

**Architecture:** Playwright launches a local Vite dev server (proxied to `radio.home.y4k.dev`), opens Chromium, navigates to search, plays a call, and collects CDP trace + rAF frame counter data during playback. Assertions check perf thresholds.

**Tech Stack:** `@playwright/test`, Vite (existing), Chrome DevTools Protocol, `requestAnimationFrame`

**Spec:** `docs/superpowers/specs/2026-04-17-playwright-perf-testing-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `client-react/package.json` | Modify | Add `@playwright/test` devDep + npm scripts |
| `client-react/e2e/playwright.config.ts` | Create | Playwright config: Chromium-only, webServer, timeouts |
| `client-react/e2e/tsconfig.json` | Create | TS config for e2e directory |
| `client-react/e2e/helpers/perf-tracing.ts` | Create | CDP trace start/stop/parse utilities |
| `client-react/e2e/helpers/frame-counter.ts` | Create | rAF injection + readback utilities |
| `client-react/e2e/helpers/search-and-play.ts` | Create | Page object for search → play flow |
| `client-react/e2e/tests/playback-perf.spec.ts` | Create | Main perf regression test suite |
| `client-react/.gitignore` | Modify | Add e2e artifacts (test-results/, playwright-report/) |

---

### Task 1: Install Playwright and scaffold config

**Files:**
- Modify: `client-react/package.json`
- Create: `client-react/e2e/playwright.config.ts`
- Create: `client-react/e2e/tsconfig.json`
- Modify: `client-react/.gitignore` (create if needed)

- [ ] **Step 1: Install @playwright/test**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npm install --save-dev @playwright/test
```

- [ ] **Step 2: Install Chromium browser**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npx playwright install chromium
```

- [ ] **Step 3: Add npm scripts to package.json**

Add these scripts to `client-react/package.json` in the `"scripts"` block:

```json
"e2e": "playwright test --config e2e/playwright.config.ts",
"e2e:ui": "playwright test --ui --config e2e/playwright.config.ts",
"e2e:trace": "playwright test --config e2e/playwright.config.ts --trace on"
```

The full scripts block should be:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "e2e": "playwright test --config e2e/playwright.config.ts",
  "e2e:ui": "playwright test --ui --config e2e/playwright.config.ts",
  "e2e:trace": "playwright test --config e2e/playwright.config.ts --trace on"
}
```

- [ ] **Step 4: Create Playwright config**

Create `client-react/e2e/playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const API_URL = process.env.API_URL || 'https://radio.home.y4k.dev';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  workers: 1, // Serial execution — perf tests shouldn't compete for CPU
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
          ],
        },
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
    cwd: path.resolve(__dirname, '..'),
    env: {
      API_URL,
    },
  },
});
```

- [ ] **Step 5: Create e2e tsconfig**

Create `client-react/e2e/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": ".",
    "baseUrl": "."
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 6: Add gitignore entries**

Create or append to `client-react/.gitignore`:

```
# Playwright
e2e/test-results/
e2e/playwright-report/
e2e/dist/
```

- [ ] **Step 7: Verify Playwright picks up the config**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npx playwright test --config e2e/playwright.config.ts --list
```

Expected: no test files found (we haven't created any yet), but no config errors.

---

### Task 2: CDP Tracing Helper

**Files:**
- Create: `client-react/e2e/helpers/perf-tracing.ts`

- [ ] **Step 1: Create the perf-tracing helper**

Create `client-react/e2e/helpers/perf-tracing.ts`:

```typescript
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
  // Look for BeginMainFrame / DrawFrame / commit events to find frame boundaries
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
    const dt = (beginFrameEvents[i].ts - beginFrameEvents[i - 1].ts) / 1000; // μs → ms
    if (dt > 0 && dt < 1000) {
      // Filter out gaps > 1s (likely idle periods)
      frameTimes.push(dt);
    }
  }

  // Fallback: if no frame events, try using 'UpdateCounters' or
  // 'CompositeLayers' events as frame proxies
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
  // Complete events ('X' phase) on the main thread with dur > 50ms
  const mainThreadPid = findRendererPid(events);
  const longTasks = events.filter(
    (e) =>
      e.ph === 'X' &&
      e.pid === mainThreadPid &&
      e.dur != null &&
      e.dur / 1000 > 50, // > 50ms
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

/** Find the renderer process PID (the one that has the most events) */
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
// Pretty-print for test output
// ---------------------------------------------------------------------------

export function formatMetrics(metrics: PerfMetrics): string {
  const lines = [
    `┌─────────────────────────────────────────┐`,
    `│        Playback Performance Metrics      │`,
    `├───────────────────────┬─────────────────┤`,
    `│ Trace duration        │ ${pad(metrics.traceDurationMs.toFixed(0) + ' ms')} │`,
    `│ Avg FPS               │ ${pad(metrics.avgFps.toFixed(1))} │`,
    `│ P95 frame time        │ ${pad(metrics.p95FrameTimeMs.toFixed(1) + ' ms')} │`,
    `│ Frame count           │ ${pad(String(metrics.frameDurationsMs.length))} │`,
    `├───────────────────────┼─────────────────┤`,
    `│ Long task count       │ ${pad(String(metrics.longTaskCount))} │`,
    `│ Max long task          │ ${pad(metrics.maxLongTaskMs.toFixed(1) + ' ms')} │`,
    `│ Total long task time  │ ${pad(metrics.longTaskTotalMs.toFixed(1) + ' ms')} │`,
    `├───────────────────────┼─────────────────┤`,
    `│ Layout count          │ ${pad(String(metrics.layoutCount))} │`,
    `│ Max layout            │ ${pad(metrics.maxLayoutMs.toFixed(1) + ' ms')} │`,
    `│ Total layout time     │ ${pad(metrics.layoutTotalMs.toFixed(1) + ' ms')} │`,
    `└───────────────────────┴─────────────────┘`,
  ];
  return lines.join('\n');
}

function pad(s: string, width = 15): string {
  return s.padStart(width);
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npx tsc --noEmit --project e2e/tsconfig.json
```

Expected: no errors (or only about missing test files — the helper itself should be clean).

---

### Task 3: rAF Frame Counter Helper

**Files:**
- Create: `client-react/e2e/helpers/frame-counter.ts`

- [ ] **Step 1: Create the frame-counter helper**

Create `client-react/e2e/helpers/frame-counter.ts`:

```typescript
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
    `┌─────────────────────────────────────────┐`,
    `│        rAF Frame Counter Results         │`,
    `├───────────────────────┬─────────────────┤`,
    `│ Frame count           │ ${pad(String(result.frameCount))} │`,
    `│ Avg interval          │ ${pad(result.avgIntervalMs.toFixed(1) + ' ms')} │`,
    `│ P95 interval          │ ${pad(result.p95IntervalMs.toFixed(1) + ' ms')} │`,
    `│ Dropped frames        │ ${pad(String(result.droppedFrames))} │`,
    `│ Dropped %             │ ${pad(result.droppedFramePct.toFixed(1) + '%')} │`,
    `└───────────────────────┴─────────────────┘`,
  ];
  return lines.join('\n');
}

function pad(s: string, width = 15): string {
  return s.padStart(width);
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npx tsc --noEmit --project e2e/tsconfig.json
```

Expected: clean compile.

---

### Task 4: Search-and-Play Page Object

**Files:**
- Create: `client-react/e2e/helpers/search-and-play.ts`

This helper navigates the scanner UI to find a call via search and start playback.

**Important UI context for the implementer:**
- The main scanner page is at `/` (root).
- The scanner auto-connects via WebSocket on load (the `Scanner` component calls `useScannerStore.getState().initialize()` in `useEffect`).
- The "Search Call" button is a `<button>` with text "SEARCH CALL" (uppercase, retro-styled, inside a `<Box component="button">`).
- Clicking it opens a left-anchored MUI `<Drawer>` containing the `SearchPanel` component.
- `SearchPanel` automatically triggers a search on mount (via `doSearch` called from `handleFormChange` or initial load).
- Search results render in a `<Table>` with columns: control (play/stop icon), Date, Time, Duration, System, Talkgroup, Unit(s).
- Each result row has a play `<IconButton>` with `aria-label="Play"`.
- The Unit(s) column shows comma-separated source labels — a non-empty value means multiple sources.
- After clicking play, the call enters playback mode. The `ScannerDisplay` shows call info and the `UnitTimeline` renders the progress bar.
- Playback is detectable by checking for the UnitTimeline's needle character `▼` in the DOM, or by evaluating `useScannerStore.getState().call !== null`.

- [ ] **Step 1: Create the search-and-play helper**

Create `client-react/e2e/helpers/search-and-play.ts`:

```typescript
import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlaybackHandle {
  /** Wait until callTime > 0 (audio is actually playing) */
  waitForPlaybackStart(): Promise<void>;
  /** Wait for a specific duration of playback observation */
  waitForDuration(ms: number): Promise<void>;
  /** Check if a call is currently playing */
  isPlaying(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Main helper
// ---------------------------------------------------------------------------

/**
 * Navigate to the scanner, open search, find a call, and start playback.
 *
 * Prefers calls with multiple sources (richer UnitTimeline) but falls back
 * to any available call.
 */
export async function searchAndPlay(
  page: Page,
  options?: { preferMultipleSources?: boolean },
): Promise<PlaybackHandle> {
  const preferMulti = options?.preferMultipleSources ?? true;

  // 1. Navigate to the app root
  await page.goto('/');

  // 2. Wait for the scanner to initialize (WebSocket connects, config loads)
  //    The "SEARCH CALL" button only appears after config is loaded.
  const searchButton = page.locator('button', { hasText: /search call/i });
  await searchButton.waitFor({ state: 'visible', timeout: 15_000 });

  // 3. Open the search panel
  await searchButton.click();

  // 4. Wait for search results to load
  //    The search results table renders inside a Card > TableContainer > Table.
  //    Wait for at least one row with a Play button.
  const playButtons = page.locator('button[aria-label="Play"]');
  await playButtons.first().waitFor({ state: 'visible', timeout: 15_000 });

  // 5. Find a suitable call to play
  let targetRow: number = 0;

  if (preferMulti) {
    // Look for a row where the Unit(s) column has a comma (multiple sources)
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator('td');
      const unitCell = cells.last(); // Unit(s) is the last column
      const text = await unitCell.textContent();
      if (text && text.includes(',')) {
        // Check this row has a play button
        const rowPlayBtn = rows.nth(i).locator('button[aria-label="Play"]');
        if ((await rowPlayBtn.count()) > 0) {
          targetRow = i;
          break;
        }
      }
    }
    // If no multi-source call found, targetRow stays 0 (first row)
  }

  // 6. Click play on the target row
  const rows = page.locator('tbody tr');
  const playBtn = rows.nth(targetRow).locator('button[aria-label="Play"]');
  await playBtn.click();

  // 7. Close the search drawer to get back to the main display
  //    The drawer has a close button (ArrowForward icon) in the toolbar
  const closeButton = page.locator('.MuiDrawer-paper button').filter({
    has: page.locator('[data-testid="ArrowForwardIcon"]'),
  });
  // Wait briefly for the call to start loading, then close
  await page.waitForTimeout(500);
  await closeButton.click();

  // 8. Return the playback handle
  return {
    async waitForPlaybackStart(): Promise<void> {
      // The UnitTimeline renders a ▼ needle only when a call is playing.
      // Wait for it to appear in the DOM.
      await page.waitForFunction(
        () => {
          const body = document.body.textContent || '';
          return body.includes('\u25BC'); // ▼ character
        },
        { timeout: 15_000, polling: 250 },
      );
      // Give a moment for the first callTime tick
      await page.waitForTimeout(500);
    },

    async waitForDuration(ms: number): Promise<void> {
      await page.waitForTimeout(ms);
    },

    async isPlaying(): Promise<boolean> {
      return page.evaluate(() => {
        const body = document.body.textContent || '';
        return body.includes('\u25BC'); // ▼ character
      });
    },
  };
}
```

- [ ] **Step 2: (Optional) Expose the Zustand store for richer test observability**

The helper above uses pure DOM detection (the `▼` needle character). For richer observability in future tests (e.g. reading `callTime` directly), you can optionally expose the store in dev mode.

Edit `client-react/src/stores/scanner.ts`. After the `export const useScannerStore = create<ScannerState>()(...)` statement, add:

```typescript
// Expose store for E2E test observability (dev only)
if (import.meta.env.DEV) {
  (window as any).__ZUSTAND_STORE__ = useScannerStore;
}
```

This is NOT required for the current test suite — skip it if you prefer zero production code changes.

- [ ] **Step 4: Verify the file compiles**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npx tsc --noEmit --project e2e/tsconfig.json
```

---

### Task 5: Main Test Suite

**Files:**
- Create: `client-react/e2e/tests/playback-perf.spec.ts`

- [ ] **Step 1: Create the test suite**

Create `client-react/e2e/tests/playback-perf.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { startTracing, stopTracing, parseTrace, formatMetrics } from '../helpers/perf-tracing';
import type { PerfMetrics } from '../helpers/perf-tracing';
import { injectFrameCounter, readFrameCounter, formatFrameCounter } from '../helpers/frame-counter';
import type { FrameCounterResult } from '../helpers/frame-counter';
import { searchAndPlay } from '../helpers/search-and-play';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------
// Initial lenient thresholds for baseline measurement.
// Tighten these after fixing the perf issues.

const THRESHOLDS = {
  /** Minimum average FPS during playback */
  minAvgFps: 30,
  /** Maximum 95th-percentile frame time in ms */
  maxP95FrameTimeMs: 50,
  /** Maximum percentage of dropped frames (>33ms gap) */
  maxDroppedFramePct: 10,
  /** Maximum number of long tasks (>50ms) in the observation window */
  maxLongTaskCount: 5,
  /** Maximum single long task duration in ms */
  maxSingleLongTaskMs: 200,
  /** Maximum total long task time in ms */
  maxLongTaskTotalMs: 500,
  /** Maximum Layout events in the observation window */
  maxLayoutCount: 50,
  /** Maximum single Layout duration in ms */
  maxSingleLayoutMs: 30,
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

      // 3. Start both measurement methods
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
```

- [ ] **Step 2: Verify the full suite compiles**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npx tsc --noEmit --project e2e/tsconfig.json
```

Expected: clean compile.

---

### Task 6: Integration Test Run

**Files:** None (verification only)

- [ ] **Step 1: Ensure Vite dev server starts correctly with the API proxy**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
API_URL=https://radio.home.y4k.dev npx vite --host 0.0.0.0 &
VITE_PID=$!
sleep 5
curl -s http://localhost:5173/ | head -20
kill $VITE_PID 2>/dev/null
```

Expected: HTML response from Vite dev server.

- [ ] **Step 2: Run the full test suite**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npm run e2e
```

Expected: Tests run (may pass or fail depending on current perf). The important thing is:
- Vite dev server starts automatically
- Chromium opens and navigates to the app
- Search panel opens and finds calls
- Playback starts and metrics are collected
- Metrics table is printed to console
- Trace artifact is saved to `e2e/test-results/playback-trace.json`

- [ ] **Step 3: If tests fail, check the output**

Review the printed metrics table. If metrics collection itself failed (e.g. search didn't find results, playback didn't start), debug the search-and-play helper:

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npm run e2e:ui
```

Use Playwright UI mode to step through and see what's happening.

- [ ] **Step 4: Record baseline metrics**

Whether tests pass or fail, note the actual metric values printed. These are the baseline for the current (known-janky) state. Add a comment block to the top of `playback-perf.spec.ts`:

```typescript
// Baseline metrics (pre-fix, recorded YYYY-MM-DD):
// - Avg FPS: XX.X
// - P95 frame time: XX.Xms
// - Dropped frames: XX.X%
// - Long tasks: N (max XXms, total XXms)
// - Layouts: N (max XXms, total XXms)
```

- [ ] **Step 5: Adjust thresholds if needed**

If the current janky build fails hard (e.g. avgFps = 15), loosen thresholds temporarily so the suite documents the current state without failing:

```typescript
const THRESHOLDS = {
  minAvgFps: 15,        // was 30, loosened for baseline
  maxP95FrameTimeMs: 80, // was 50, loosened for baseline
  // ... etc
};
```

The goal is to have the suite PASS at current state, then TIGHTEN after fixes.
