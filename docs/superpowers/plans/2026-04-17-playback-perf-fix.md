# Playback Performance Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate unnecessary re-renders during call playback by isolating time-dependent rendering and switching from `setInterval` to `requestAnimationFrame`.

**Architecture:** Replace the `setInterval(250)` → Zustand `set({ callTime })` loop with a `requestAnimationFrame` loop writing to a module-level variable + pub/sub. Only 3 small components subscribe to the high-frequency time source. The rest of `ScannerDisplay` never re-renders during playback.

**Tech Stack:** React 19, Zustand 5, `useSyncExternalStore`, `requestAnimationFrame`

**Spec:** `docs/superpowers/specs/2026-04-17-playback-perf-fix-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `client-react/src/stores/scanner.ts` | Modify | Replace setInterval with rAF + pub/sub, export subscription API |
| `client-react/src/hooks/useAudioTime.ts` | Modify | Rewrite with `useSyncExternalStore` |
| `client-react/src/components/Scanner/ScannerDisplay.tsx` | Modify | Remove `useAudioTime()`, extract `ProgressTimestamp` + `FrequencyDisplay` |
| `client-react/src/components/Scanner/UnitTimeline.tsx` | Modify | Remove `callTime` prop, subscribe internally |
| `client-react/e2e/tests/playback-perf.spec.ts` | Modify | Tighten thresholds after fix verified |

---

### Task 1: Add rAF time source to scanner store

**Files:**
- Modify: `client-react/src/stores/scanner.ts`

This task replaces the `setInterval(250)` with a `requestAnimationFrame` loop + module-level pub/sub, and exports the subscription API for the hook.

- [ ] **Step 1: Add module-level rAF state and functions**

In `client-react/src/stores/scanner.ts`, find the module-level audio state block (around line 75):

```typescript
let audioSource: AudioBufferSourceNode | undefined;
let audioBuffer: AudioBuffer | undefined;
let audioSourceStartTime = NaN;
let audioTimeInterval: ReturnType<typeof setInterval> | undefined;
let beepContext: AudioContext | undefined;
let audioBootstrapped = false;
```

Replace it with:

```typescript
let audioSource: AudioBufferSourceNode | undefined;
let audioBuffer: AudioBuffer | undefined;
let audioSourceStartTime = NaN;
let beepContext: AudioContext | undefined;
let audioBootstrapped = false;

// ---------------------------------------------------------------------------
// rAF-based audio time source (bypasses Zustand for high-frequency updates)
// ---------------------------------------------------------------------------

let currentAudioTime = 0;
let audioTimeSubscribers = new Set<() => void>();
let audioTimeRafId: number | undefined;

function startAudioTimeLoop(): void {
    stopAudioTimeLoop();
    const tick = () => {
        if (audioContext && !isNaN(audioSourceStartTime)) {
            currentAudioTime = audioContext.currentTime - audioSourceStartTime;
        }
        audioTimeSubscribers.forEach((cb) => cb());
        audioTimeRafId = requestAnimationFrame(tick);
    };
    audioTimeRafId = requestAnimationFrame(tick);
}

function stopAudioTimeLoop(): void {
    if (audioTimeRafId !== undefined) {
        cancelAnimationFrame(audioTimeRafId);
        audioTimeRafId = undefined;
    }
}

/** Subscribe to audio time updates (for useSyncExternalStore) */
export function subscribeAudioTime(callback: () => void): () => void {
    audioTimeSubscribers.add(callback);
    return () => { audioTimeSubscribers.delete(callback); };
}

/** Get current audio time snapshot (for useSyncExternalStore) */
export function getAudioTimeSnapshot(): number {
    return currentAudioTime;
}
```

Note: `audioTimeInterval` is removed entirely. `currentAudioTime`, `subscribeAudioTime`, and `getAudioTimeSnapshot` are new.

- [ ] **Step 2: Replace setInterval with rAF in the play path**

Find the `decodeAudioData` success callback (around line 1455–1485) which contains the `setInterval(250)` block. The current code is:

```typescript
            audioSource.start();

            set({ callTime: 0 });

            // Start time update interval (replaces RxJS interval(100))
            if (audioTimeInterval !== undefined) {
                clearInterval(audioTimeInterval);
            }

            // Update time at ~4Hz (250ms) to avoid excessive re-renders.
            // The Angular version used 100ms with RxJS (no React re-render overhead).
            audioTimeInterval = setInterval(() => {
                if (!get().call) {
                    if (audioTimeInterval !== undefined) {
                        clearInterval(audioTimeInterval);
                        audioTimeInterval = undefined;
                    }
                    return;
                }

                if (audioContext && !isNaN(audioContext.currentTime)) {
                    if (isNaN(audioSourceStartTime)) {
                        audioSourceStartTime = audioContext.currentTime;
                    }

                    if (!get().paused) {
                        set({ callTime: audioContext.currentTime - audioSourceStartTime });
                    }
                }
            }, 250);
```

Replace it with:

```typescript
            audioSource.start();

            set({ callTime: 0 });
            currentAudioTime = 0;

            // Start rAF-based time updates (bypasses Zustand for smooth 60fps)
            startAudioTimeLoop();
```

- [ ] **Step 3: Update stopAudio to use rAF cleanup**

Find the `stopAudio` function (around line 350):

```typescript
function stopAudio(options?: { emit?: boolean }): void {
    if (audioTimeInterval !== undefined) {
        clearInterval(audioTimeInterval);
        audioTimeInterval = undefined;
    }
```

Replace the `clearInterval` block with:

```typescript
function stopAudio(options?: { emit?: boolean }): void {
    stopAudioTimeLoop();
    currentAudioTime = 0;
```

- [ ] **Step 4: Update pause to stop/start the rAF loop**

Find the `pause` method (around line 1379):

```typescript
    pause(status?: boolean): void {
        const state = get();
        const newPaused = status !== undefined ? status : !state.paused;

        if (newPaused) {
            set({
                paused: true,
                pausedAt: new Date(),
            });

            void audioContext?.suspend();
        } else {
            set({
                paused: false,
                pausedAt: null,
            });

            void audioContext?.resume();

            get().play();
        }
    },
```

Replace with:

```typescript
    pause(status?: boolean): void {
        const state = get();
        const newPaused = status !== undefined ? status : !state.paused;

        if (newPaused) {
            stopAudioTimeLoop();
            // Write current time to Zustand for pause display
            set({
                paused: true,
                pausedAt: new Date(),
                callTime: currentAudioTime,
            });

            void audioContext?.suspend();
        } else {
            set({
                paused: false,
                pausedAt: null,
            });

            void audioContext?.resume();
            startAudioTimeLoop();

            get().play();
        }
    },
```

- [ ] **Step 5: Update seek to set currentAudioTime directly**

Find the `seek` method (around line 1528). The current code ends with:

```typescript
        audioSourceStartTime = audioContext.currentTime - seconds;
        set({ callTime: seconds });

        return true;
    },
```

Replace with:

```typescript
        audioSourceStartTime = audioContext.currentTime - seconds;
        currentAudioTime = seconds;
        set({ callTime: seconds });
        // Notify subscribers immediately so UI updates without waiting for next rAF
        audioTimeSubscribers.forEach((cb) => cb());

        return true;
    },
```

- [ ] **Step 6: Update audioSource.onended to reset rAF state**

Find the `audioSource.onended` callback (around line 1452):

```typescript
            audioSource.onended = () => {
                set({ callTime: buffer.duration });
                get().skip({ delay: true });
            };
```

Replace with:

```typescript
            audioSource.onended = () => {
                stopAudioTimeLoop();
                currentAudioTime = buffer.duration;
                set({ callTime: buffer.duration });
                get().skip({ delay: true });
            };
```

- [ ] **Step 7: Verify the app compiles**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npx tsc -b --noEmit
```

Expected: no errors.

---

### Task 2: Rewrite useAudioTime hook

**Files:**
- Modify: `client-react/src/hooks/useAudioTime.ts`

- [ ] **Step 1: Rewrite the hook**

Replace the entire contents of `client-react/src/hooks/useAudioTime.ts` with:

```typescript
import { useSyncExternalStore } from 'react';
import { useEffect, useState } from 'react';
import { subscribeAudioTime, getAudioTimeSnapshot } from '../stores/scanner';

/**
 * Hook that returns the current audio playback time.
 *
 * Uses useSyncExternalStore to subscribe directly to the module-level
 * rAF time source in the scanner store — bypasses Zustand entirely
 * for high-frequency updates, enabling smooth 60fps rendering in
 * only the components that call this hook.
 */
export function useAudioTime(): number {
  return useSyncExternalStore(subscribeAudioTime, getAudioTimeSnapshot);
}

/**
 * Hook that returns an elapsed-seconds counter since a given Date.
 * Updates every second. Returns 0 when `since` is null.
 */
export function useElapsedSeconds(since: Date | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!since) {
      setElapsed(0);
      return;
    }

    const tick = () => {
      setElapsed(Math.floor((Date.now() - since.getTime()) / 1000));
    };

    tick();
    const id = setInterval(tick, 1000);

    return () => clearInterval(id);
  }, [since]);

  return elapsed;
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npx tsc -b --noEmit
```

Expected: no errors.

---

### Task 3: Isolate time-dependent rendering in ScannerDisplay

**Files:**
- Modify: `client-react/src/components/Scanner/ScannerDisplay.tsx`
- Modify: `client-react/src/components/Scanner/UnitTimeline.tsx`

This is the biggest task. We extract `ProgressTimestamp` and `FrequencyDisplay` as small components within ScannerDisplay, and change UnitTimeline to subscribe internally.

- [ ] **Step 1: Add ProgressTimestamp component to ScannerDisplay.tsx**

Add this component ABOVE the `ScannerDisplay` function in `client-react/src/components/Scanner/ScannerDisplay.tsx`:

```typescript
// ---------------------------------------------------------------------------
// ProgressTimestamp — renders the call progress time, subscribes to rAF
// ---------------------------------------------------------------------------
function ProgressTimestamp({
  call,
  time12hFormat,
}: {
  call: Call | null;
  time12hFormat: boolean;
}) {
  const callTime = useAudioTime();

  if (!call) return null;

  const d = new Date(call.dateTime);
  d.setSeconds(d.getSeconds() + callTime);

  const timeFormat: Intl.DateTimeFormatOptions = time12hFormat
    ? { hour: 'numeric', minute: '2-digit', hour12: true }
    : { hour: '2-digit', minute: '2-digit', hour12: false };

  const timeStr = d.toLocaleTimeString([], timeFormat);

  // Show date if call is older than 24 hours
  const showDate = Date.now() - d.getTime() >= 86400000;
  const dateStr = showDate
    ? `${String(new Date(call.dateTime).getMonth() + 1).padStart(2, '0')}/${String(new Date(call.dateTime).getDate()).padStart(2, '0')} `
    : '';

  return (
    <>
      {dateStr && <span>{dateStr}</span>}
      <span>{timeStr}</span>
    </>
  );
}
```

- [ ] **Step 2: Add FrequencyDisplay and ErrorSpikeDisplay to ScannerDisplay.tsx**

Add these two components ABOVE the `ScannerDisplay` function (after `ProgressTimestamp`).

The frequency and error/spike values live in different rows of the display, so they're separate components. Both call `useAudioTime()` and `getFrequencyInfo()` — the computation is cheap (just an array lookup).

```typescript
// ---------------------------------------------------------------------------
// FrequencyDisplay — renders frequency value, subscribes to rAF
// ---------------------------------------------------------------------------
function FrequencyDisplay({ call }: { call: Call | null }) {
  const callTime = useAudioTime();
  const { frequency } = getFrequencyInfo(call, callTime);

  return <span>F: {frequency || '0'}</span>;
}

// ---------------------------------------------------------------------------
// ErrorSpikeDisplay — renders error/spike counts, subscribes to rAF
// ---------------------------------------------------------------------------
function ErrorSpikeDisplay({ call }: { call: Call | null }) {
  const callTime = useAudioTime();
  const { error, spike } = getFrequencyInfo(call, callTime);

  return (
    <span>
      E: {error || '0'} S: {spike || '0'}
    </span>
  );
}
```

- [ ] **Step 3: Update ScannerDisplay to use the new components**

In the `ScannerDisplay` function:

**Remove** these lines (the `useAudioTime` import at top of file, and usage inside the component):

```typescript
import { useAudioTime } from '../../hooks/useAudioTime';
```

And inside the component body, remove:

```typescript
  const callTime = useAudioTime();
```

And remove these computed values that depend on `callTime`:

```typescript
  const { frequency: callFrequency, error: callError, spike: callSpike } =
    getFrequencyInfo(call, callTime);

  // Compute progress timestamp
  const callProgress = useMemo(() => {
    if (!call) return null;
    const d = new Date(call.dateTime);
    d.setSeconds(d.getSeconds() + callTime);
    return d;
  }, [call, callTime]);

  // Show date if the call is more than 24 hours old
  const callDate = useMemo(() => {
    if (!call || !callProgress) return null;
    if (Date.now() - callProgress.getTime() >= 86400000) {
      return call.dateTime;
    }
    return null;
  }, [call, callProgress]);
```

And the `formatTime` and `formatDate` helper functions can stay (they're used by the header clock too), but the callProgress/callDate references in JSX need updating.

**Replace** the Talkgroup / Duration+Time row JSX. Find:

```tsx
      {/* Talkgroup / Duration+Time row */}
      <Box sx={rowSx}>
        <Box><span>{callTalkgroup}</span></Box>
        <Box>
          <span>{callDuration.toFixed(1)}s</span>
          {' '}
          {'\u2014 '}
          {callDate && <span>{formatDate(callDate)} </span>}
          <span>{formatTime(callProgress)}</span>
        </Box>
      </Box>
```

Replace with:

```tsx
      {/* Talkgroup / Duration+Time row */}
      <Box sx={rowSx}>
        <Box><span>{callTalkgroup}</span></Box>
        <Box>
          <span>{callDuration.toFixed(1)}s</span>
          {' '}
          {'\u2014 '}
          <ProgressTimestamp call={call} time12hFormat={config.time12hFormat} />
        </Box>
      </Box>
```

**Replace** the Frequency row. Find:

```tsx
      {/* Frequency / TGID row */}
      <Box sx={rowSx}>
        <Box><span>F: {callFrequency || '0'}</span></Box>
        <Box><span>TGID: {callTalkgroupId || '0'}</span></Box>
      </Box>
```

Replace with:

```tsx
      {/* Frequency / TGID row */}
      <Box sx={rowSx}>
        <Box><FrequencyDisplay call={call} /></Box>
        <Box><span>TGID: {callTalkgroupId || '0'}</span></Box>
      </Box>
```

**Replace** the Error/Spike row. Find:

```tsx
      {/* Error/Spike + Unit Timeline row */}
      <Box
        sx={{
          ...rowSx,
          overflow: 'visible',
          height: 'auto',
          minHeight: 20,
        }}
      >
        <Box>
          <span>
            E: {callError || '0'} S: {callSpike || '0'}
          </span>
        </Box>
```

Replace with:

```tsx
      {/* Error/Spike + Unit Timeline row */}
      <Box
        sx={{
          ...rowSx,
          overflow: 'visible',
          height: 'auto',
          minHeight: 20,
        }}
      >
        <Box>
          <ErrorSpikeDisplay call={call} />
        </Box>
```

**Replace** the UnitTimeline usage. Find:

```tsx
          {call && (
            <UnitTimeline
              call={call}
              callTime={callTime}
              callDuration={callDuration}
            />
          )}
```

Replace with:

```tsx
          {call && (
            <UnitTimeline
              call={call}
              callDuration={callDuration}
            />
          )}
```

**Add** the `useAudioTime` import back to the file (it's still needed by the new inline components):

Keep this import at the top:
```typescript
import { useAudioTime } from '../../hooks/useAudioTime';
```

The key difference: `ScannerDisplay` itself no longer calls `useAudioTime()` — only the extracted sub-components do.

- [ ] **Step 4: Update UnitTimeline to subscribe internally**

In `client-react/src/components/Scanner/UnitTimeline.tsx`:

**Add import** at the top:

```typescript
import { useAudioTime } from '../../hooks/useAudioTime';
```

**Change the interface** — remove `callTime`:

Find:
```typescript
interface UnitTimelineProps {
  call: Call;
  callTime: number;
  callDuration: number;
}
```

Replace with:
```typescript
interface UnitTimelineProps {
  call: Call;
  callDuration: number;
}
```

**Change the component signature and add internal subscription:**

Find:
```typescript
export function UnitTimeline({ call, callTime, callDuration }: UnitTimelineProps) {
```

Replace with:
```typescript
export function UnitTimeline({ call, callDuration }: UnitTimelineProps) {
  const callTime = useAudioTime();
```

- [ ] **Step 5: Verify compilation**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 6: Verify the app loads and plays calls**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
API_URL=https://radio.home.y4k.dev npx vite &
```

Open http://localhost:5173 in a browser. Verify:
- Scanner loads and connects
- Search a call and play it
- UnitTimeline progress bar moves smoothly
- Time display updates
- Frequency info updates when crossing source boundaries
- Pause/resume works
- Seek (clicking a unit source) works
- Skip works

Kill the vite process when done.

---

### Task 4: Run perf tests and tighten thresholds

**Files:**
- Modify: `client-react/e2e/tests/playback-perf.spec.ts`

- [ ] **Step 1: Run the perf test suite**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npm run e2e
```

Expected: all 3 tests pass. Check the metrics table output. The long task count and layout count should be dramatically lower than the baseline.

Record the actual numbers.

- [ ] **Step 2: Tighten thresholds**

In `client-react/e2e/tests/playback-perf.spec.ts`, update the `THRESHOLDS` object. Find:

```typescript
const THRESHOLDS = {
  /** Minimum average FPS during playback */
  minAvgFps: 30,
  /** Maximum 95th-percentile frame time in ms */
  maxP95FrameTimeMs: 50,
  /** Maximum percentage of dropped frames (>33ms gap) */
  maxDroppedFramePct: 15, // target: 5
  /** Maximum number of long tasks (>50ms) in the observation window */
  maxLongTaskCount: 100, // target: 5
  /** Maximum single long task duration in ms */
  maxSingleLongTaskMs: 400, // target: 100
  /** Maximum total long task time in ms */
  maxLongTaskTotalMs: 5000, // target: 500
  /** Maximum Layout events in the observation window */
  maxLayoutCount: 500, // target: 50
  /** Maximum single Layout duration in ms */
  maxSingleLayoutMs: 30,
};
```

Replace with thresholds based on the actual post-fix measurements. Use ~2x the observed values as the threshold to allow for variance. If the post-fix numbers are close to the original targets, use those targets. Example (adjust based on actual results):

```typescript
const THRESHOLDS = {
  /** Minimum average FPS during playback */
  minAvgFps: 30,
  /** Maximum 95th-percentile frame time in ms */
  maxP95FrameTimeMs: 50,
  /** Maximum percentage of dropped frames (>33ms gap) */
  maxDroppedFramePct: 5,
  /** Maximum number of long tasks (>50ms) in the observation window */
  maxLongTaskCount: 10,
  /** Maximum single long task duration in ms */
  maxSingleLongTaskMs: 150,
  /** Maximum total long task time in ms */
  maxLongTaskTotalMs: 1000,
  /** Maximum Layout events in the observation window */
  maxLayoutCount: 100,
  /** Maximum single Layout duration in ms */
  maxSingleLayoutMs: 30,
};
```

Also update the baseline comment block at the top to record the new post-fix values.

- [ ] **Step 3: Re-run perf tests to confirm new thresholds pass**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npm run e2e
```

Expected: all 3 tests pass with the tightened thresholds. If any fail, loosen that specific threshold to ~2x the observed value.

- [ ] **Step 4: Run tests a second time to check for variance**

```bash
cd /home/they4kman/programming/third-party/rdio-scanner/client-react
npm run e2e
```

Expected: still passes. If flaky, loosen the failing threshold slightly.
