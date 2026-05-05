# Playwright Playback Performance Testing

> **Note (2026-05-05):** Inline paths below reference the historical `client-react/` directory, which has since been renamed to `client/`. Paths are preserved verbatim as a record of the work as it was carried out.

**Date:** 2026-04-17
**Status:** Draft
**Goal:** Add perf regression tests for the React client's call playback, specifically targeting UnitTimeline jank.

---

## Problem

The Angular-to-React port of rdio-scanner has a known CPU/rendering performance issue during call playback. The `callTime` state updates every 250ms (reduced from 100ms in a failed perf attempt), and each tick re-renders the entire `ScannerDisplay` tree — including `UnitTimeline` which does per-source layout calculations, CSS transitions, and marker rendering.

The UnitTimeline progress bar and scrolling unit labels are visibly jerky during playback.

We need measurable perf data to:
1. Establish a baseline for the current (janky) state
2. Guide targeted fixes (e.g. isolating callTime rendering)
3. Prevent regressions after fixes land

## Approach

**CDP Performance Tracing + rAF Frame Counter** — two complementary measurement strategies run simultaneously during call playback.

- **CDP Tracing** (primary): Chrome DevTools Protocol trace captures frame durations, long tasks, layout recalculations, and style recalcs at high fidelity. Chromium-only, but that's fine for perf measurement.
- **rAF Frame Counter** (secondary): Injected `requestAnimationFrame` loop tracks frame timestamps as a lightweight cross-check. Simple, easy to reason about.

**Test data source:** The tests run against `radio.home.y4k.dev` (24/7 scanner with plenty of historical calls). The Search panel is used to find and play a past call — clicking play on a search result queues it and subsequent calls for playback. No live feed dependency, no mocking needed.

**No production code changes.** Tests are purely observational.

---

## Project Structure

```
client-react/
├── e2e/
│   ├── playwright.config.ts        # Playwright config
│   ├── helpers/
│   │   ├── perf-tracing.ts         # CDP trace start/stop/parse
│   │   ├── frame-counter.ts        # rAF injection + readback
│   │   └── search-and-play.ts      # Page object for search → play flow
│   ├── tests/
│   │   └── playback-perf.spec.ts   # Perf regression test suite
│   └── tsconfig.json               # Playwright types
├── package.json                    # + @playwright/test devDep
└── vite.config.ts                  # Already supports API_URL proxy
```

---

## Component Details

### Playwright Config (`e2e/playwright.config.ts`)

- **Single Chromium project** — CDP tracing is Chromium-only
- **`baseURL`** — points to local Vite dev server (default `http://localhost:5173`)
- **`webServer`** block — auto-starts `vite dev` with `API_URL=https://radio.home.y4k.dev`; Playwright manages the process lifecycle
- **Timeout** — 60s per test (search + play + observe takes time)
- **Artifacts** — trace files saved on failure for manual inspection in Chrome DevTools

### CDP Tracing Helper (`helpers/perf-tracing.ts`)

Exports:

```typescript
interface PerfMetrics {
  avgFps: number;
  p95FrameTimeMs: number;
  longTaskCount: number;         // tasks > 50ms
  maxLongTaskMs: number;
  longTaskTotalMs: number;
  layoutCount: number;
  layoutTotalMs: number;
  maxLayoutMs: number;
}

startTracing(page: Page): Promise<CDPSession>
stopTracing(session: CDPSession): Promise<Buffer>   // raw trace JSON
parseTrace(traceBuffer: Buffer): PerfMetrics
```

**Trace categories:** `devtools.timeline`, `v8.execute`, `blink.user_timing`

**Parsing logic:**
- Frame durations from `BeginMainFrame` / Compositor frame events
- Long tasks from events with duration > 50ms on the main thread
- Layout/style recalculation events (`Layout`, `UpdateLayoutTree`)

### rAF Frame Counter (`helpers/frame-counter.ts`)

Exports:

```typescript
interface FrameCounterResult {
  frameCount: number;
  avgIntervalMs: number;
  p95IntervalMs: number;
  droppedFrames: number;    // gaps > 33ms (~30fps threshold)
  droppedFramePct: number;
}

injectFrameCounter(page: Page): Promise<void>
readFrameCounter(page: Page): Promise<FrameCounterResult>
```

**Implementation:**
- `injectFrameCounter` calls `page.evaluate()` to install a rAF loop pushing `performance.now()` timestamps to `window.__perfFrames`
- `readFrameCounter` reads back the array, computes intervals, returns stats

### Search & Play Helper (`helpers/search-and-play.ts`)

Page object for the search → play flow:

```typescript
interface PlaybackHandle {
  waitForPlaybackStart(): Promise<void>
  waitForDuration(ms: number): Promise<void>
  isPlaying(): Promise<boolean>
}

searchAndPlay(page: Page, options?: {
  preferMultipleSources?: boolean   // pick calls with rich UnitTimeline
}): Promise<PlaybackHandle>
```

**Flow:**
1. Open search panel (click "Search Call" button)
2. Wait for search results to load
3. Locate a suitable call — scan the rendered search result rows for one showing a source count > 1 (the search results display unit/source info). If none found, fall back to the first available call (single-source still exercises the progress bar).
4. Click play on that result
5. Wait for playback to actually start (detect audio activity / callTime > 0)
6. Return a handle for the test to control observation duration

---

## Test Suite (`tests/playback-perf.spec.ts`)

### Setup & Data Collection

All three tests share a **single playback observation** to avoid redundant search/play cycles:

1. `beforeAll`: Use `searchAndPlay()` to find and start a call
2. Start CDP trace + rAF counter
3. Observe for **8 seconds** (fixed window — most calls are 3-30s, 8s gives enough data without overshooting short calls)
4. Stop tracing, collect both `PerfMetrics` and `FrameCounterResult`
5. Store results in suite-level variables for individual test assertions

If the call ends before 8 seconds, use however much data was collected (minimum 3 seconds or skip with a warning).

### Tests

#### `maintains acceptable frame rate during playback`
Asserts against the shared metrics:
- `avgFps >= 30`
- `p95FrameTimeMs < 50`
- `droppedFramePct < 10`

#### `no excessive long tasks during playback`
Asserts against the shared metrics:
- `longTaskCount < 5` (over the 8s window)
- `maxLongTaskMs < 200`
- `longTaskTotalMs < 500`

#### `no layout thrashing during playback`
Asserts against the shared metrics:
- `layoutCount < 50` (over the 8s window — ~6/sec is generous; healthy apps do <1/sec)
- `maxLayoutMs < 30`

### Threshold Philosophy

Initial thresholds are **lenient** — the current janky build may barely pass or fail. The workflow:
1. First run = diagnostic baseline (record actual values)
2. Fix perf issues (isolate callTime rendering, etc.)
3. Tighten thresholds to lock in improvements

Each test prints a readable table of actual metrics vs thresholds on failure. Raw CDP trace saved as `.json` artifact for Chrome DevTools inspection.

---

## npm Scripts

Added to `client-react/package.json`:

| Script | Command | Purpose |
|--------|---------|---------|
| `e2e` | `playwright test --config e2e/playwright.config.ts` | Run full suite |
| `e2e:ui` | `playwright test --ui --config e2e/playwright.config.ts` | Interactive UI mode |
| `e2e:trace` | `playwright test --config e2e/playwright.config.ts --trace on` | Always save traces |

---

## Environment & Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_URL` | `https://radio.home.y4k.dev` | Backend for API/WS proxy |

Set in Playwright config's `webServer.env`. Override for local backend: `API_URL=http://localhost:3000 npm run e2e`.

**No CI.** Local-only for now — requires Chromium + network access to `radio.home.y4k.dev`. Future: swap in a test backend with a test DB for isolated CI runs.

---

## Out of Scope

- **Fixing the perf issue itself** — this spec is test infrastructure only. The fix (isolating callTime renders into a smaller component, using rAF instead of setInterval, etc.) is a separate effort that these tests will validate.
- **Visual regression testing** — no screenshot comparisons.
- **Functional E2E tests** — the search-and-play helper is a means to trigger playback, not a functional test of the search feature itself.
- **CI integration** — future work, requires a test backend.
- **Firefox/WebKit** — CDP tracing is Chromium-only, and that's the right tradeoff for perf measurement.

---

## Implementation Notes

- The Vite dev server already proxies `/api` and `/ws` to `API_URL` — no changes needed.
- `@playwright/test` is the only new dependency (devDep).
- Playwright manages browser install via `npx playwright install chromium`.
- The `webServer` block in Playwright config handles starting/stopping Vite automatically.
- All test helpers are TypeScript with Playwright's built-in TS support.
