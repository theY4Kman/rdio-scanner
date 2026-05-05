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
