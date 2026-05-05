import { useEffect, useState } from 'react';

/**
 * Hook that returns the current time, updating every minute (synced to clock boundary).
 * Used for the time display in the scanner status bar.
 */
export function useClock(): Date {
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      const now = new Date();
      setClock(now);

      // Schedule next tick at the start of the next minute
      const msUntilNextMinute = 1000 * (60 - now.getSeconds());
      timerId = setTimeout(sync, msUntilNextMinute);
    };

    sync();

    return () => {
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    };
  }, []);

  return clock;
}
