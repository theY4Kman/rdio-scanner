# Playback Performance Fix — Isolate callTime Rendering

**Date:** 2026-04-17
**Status:** Draft
**Goal:** Eliminate unnecessary re-renders during call playback by isolating time-dependent rendering into small, self-subscribing components and switching from `setInterval` to `requestAnimationFrame`.

---

## Problem

During call playback, `callTime` updates every 250ms via `setInterval`. Each tick calls `set({ callTime })` in Zustand, which re-renders `ScannerDisplay` — a monolith component that renders the entire scanner LCD area. Every child re-renders on every tick: system row, talkgroup row, flags, CallHistory, AuthOverlay, and UnitTimeline.

**Baseline measurements** (from Playwright perf tests, 8s observation window):
- Long tasks: 25–88 per 8s window (max 65–320ms each, total 1.5–4.6s)
- Layout events: 330–386 per 8s window
- rAF dropped frames: ~7%

Only 3 things in ScannerDisplay actually need `callTime`: the progress timestamp, the frequency info row, and UnitTimeline. Everything else is static during playback.

## Solution

Two changes:

### 1. Replace `setInterval(250)` with `requestAnimationFrame` + module-level pub/sub

The high-frequency time updates bypass Zustand entirely. A module-level variable holds the current audio time, and a `Set<() => void>` of subscribers get notified each rAF frame. Components subscribe via a rewritten `useAudioTime()` hook backed by `useSyncExternalStore`.

Zustand's `callTime` field is kept but only updated for **discrete events**: seek, end-of-playback, call change. Not updated on every animation frame.

### 2. Extract time-dependent rendering into isolated components

Split the 3 time-dependent pieces out of `ScannerDisplay` into their own components that call `useAudioTime()` internally. The parent `ScannerDisplay` stops subscribing to `callTime` — it only re-renders when the call itself changes.

---

## Detailed Design

### rAF Time Source (`stores/scanner.ts`)

**New module-level state** (alongside existing `audioSource`, `audioContext`, etc.):

```typescript
let currentAudioTime = 0;
let audioTimeSubscribers = new Set<() => void>();
let rafId: number | undefined;
```

**New functions:**

```typescript
function startAudioTimeLoop(): void {
  const tick = () => {
    if (audioContext && !isNaN(audioSourceStartTime)) {
      currentAudioTime = audioContext.currentTime - audioSourceStartTime;
      audioTimeSubscribers.forEach((cb) => cb());
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function stopAudioTimeLoop(): void {
  if (rafId !== undefined) {
    cancelAnimationFrame(rafId);
    rafId = undefined;
  }
}
```

**Exported subscription API** (for `useSyncExternalStore`):

```typescript
export function subscribeAudioTime(callback: () => void): () => void {
  audioTimeSubscribers.add(callback);
  return () => audioTimeSubscribers.delete(callback);
}

export function getAudioTimeSnapshot(): number {
  return currentAudioTime;
}
```

**Integration points** — replace the existing `setInterval`/`clearInterval` block:
- `audioSource.start()` → call `startAudioTimeLoop()` (was: `setInterval(250)`)
- `audioSource.onended` → call `stopAudioTimeLoop()`, then `set({ callTime: buffer.duration })`
- `pause()` → call `stopAudioTimeLoop()`, write `currentAudioTime` to Zustand
- Resume from pause → call `startAudioTimeLoop()`
- `skip()` → call `stopAudioTimeLoop()`
- `seek(seconds)` → set `currentAudioTime = seconds`, update `audioSourceStartTime`, notify subscribers immediately

**Zustand `callTime` field:** Remains in the store interface. Written only on discrete events (pause, seek, end-of-playback, skip). Not written on rAF ticks. Initialized to 0 when a new call starts.

### `useAudioTime` Hook (`hooks/useAudioTime.ts`)

Rewrite to use `useSyncExternalStore`:

```typescript
import { useSyncExternalStore } from 'react';
import { subscribeAudioTime, getAudioTimeSnapshot } from '../stores/scanner';

export function useAudioTime(): number {
  return useSyncExternalStore(subscribeAudioTime, getAudioTimeSnapshot);
}
```

The existing `useElapsedSeconds` hook is unrelated to the rAF change and stays as-is.

### ScannerDisplay Changes (`components/Scanner/ScannerDisplay.tsx`)

**Remove:** `useAudioTime()` import and the `callTime` variable.

**Extract new inline components:**

#### `<ProgressTimestamp>`

Renders the progress time (and optional date) during playback. Calls `useAudioTime()` internally.

Props: `call: Call | null`, `time12hFormat: boolean`

Replaces the inline block that computes `callProgress` and `callDate` and renders them.

#### `<FrequencyDisplay>`

Renders the `F: ... E: ... S: ...` row. Calls `useAudioTime()` internally, runs `getFrequencyInfo(call, time)`.

Props: `call: Call | null`

Replaces the inline block that computes `callFrequency`, `callError`, `callSpike`.

Both components are small (< 30 lines each) and defined in `ScannerDisplay.tsx` since they're tightly coupled to the display layout.

### UnitTimeline Changes (`components/Scanner/UnitTimeline.tsx`)

**Remove:** `callTime` from `UnitTimelineProps`.

**Add:** `const callTime = useAudioTime();` inside the component body.

The parent (`ScannerDisplay`) stops passing `callTime` as a prop — it just renders `<UnitTimeline call={call} callDuration={callDuration} />`.

This is the single biggest win: previously, ScannerDisplay had to re-render itself on every tick just to pass the new `callTime` prop down to UnitTimeline.

---

## What Doesn't Change

- `ScannerDisplay` layout, styling, and visual output — identical
- `UnitTimeline` visual behavior — identical
- `ControlButtons` — doesn't use `callTime`
- `MainDisplay` — doesn't use `callTime`
- `Scanner` — doesn't use `callTime`
- Audio playback behavior — identical
- WebSocket protocol — identical
- The `callTime` field in Zustand — still exists, just updated less frequently
- `useElapsedSeconds` hook — unrelated, stays as-is
- Playwright perf tests — no changes needed, thresholds will be tightened after

---

## Expected Impact

| Metric | Before | Expected After |
|--------|--------|----------------|
| ScannerDisplay re-renders/sec | ~4 (250ms interval) | 0 during playback (only on call change) |
| UnitTimeline re-renders/sec | ~4 (prop-driven) | ~60 (rAF, but isolated — tiny component) |
| ProgressTimestamp re-renders/sec | ~4 (parent-driven) | ~60 (rAF, but it's one `<span>`) |
| FrequencyDisplay re-renders/sec | ~4 (parent-driven) | ~60 (rAF, but only 3 spans) |
| Long tasks per 8s | 25–88 | < 5 |
| Layout events per 8s | 330–386 | < 50 |
| Dropped frames | ~7% | < 2% |

The rAF frequency is higher (60fps vs 4fps), but the work per frame drops dramatically because only the 3 tiny components re-render — not the entire ScannerDisplay tree.

---

## Verification

1. Run `npm run e2e` — all 3 tests should pass with existing lenient thresholds
2. Check the metrics table output — long tasks and layout counts should drop significantly
3. Tighten thresholds in `playback-perf.spec.ts` to lock in improvements:
   - `maxLongTaskCount: 10`
   - `maxSingleLongTaskMs: 150`
   - `maxLongTaskTotalMs: 1000`
   - `maxLayoutCount: 100`
   - `maxDroppedFramePct: 5`
4. Manual check: the seekbar/UnitTimeline should feel smooth, no visible stuttering

---

## Files Changed

| File | Change |
|------|--------|
| `src/stores/scanner.ts` | Replace setInterval with rAF loop + pub/sub. Export `subscribeAudioTime`, `getAudioTimeSnapshot`. |
| `src/hooks/useAudioTime.ts` | Rewrite with `useSyncExternalStore` |
| `src/components/Scanner/ScannerDisplay.tsx` | Remove `useAudioTime()`. Extract `<ProgressTimestamp>`, `<FrequencyDisplay>`. Remove `callTime` prop from `<UnitTimeline>`. |
| `src/components/Scanner/UnitTimeline.tsx` | Remove `callTime` prop, subscribe internally via `useAudioTime()` |
| `e2e/tests/playback-perf.spec.ts` | Tighten thresholds after fix is verified |

No new files created.
