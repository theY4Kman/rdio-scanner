import { useEffect, useState } from 'react';
import { useScannerStore } from '../stores/scanner';

/**
 * Hook that returns the current audio playback time from the scanner store.
 * Subscribes to the store's callTime state which updates at ~100ms intervals
 * during playback.
 */
export function useAudioTime(): number {
  const callTime = useScannerStore((state) => state.callTime);
  return callTime;
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
