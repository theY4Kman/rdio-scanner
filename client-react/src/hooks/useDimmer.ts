import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook that implements screen dimming after a configurable delay.
 * Resets on any user interaction (mouse/keyboard/touch) or when explicitly poked.
 *
 * @param delay  Delay in milliseconds before dimming. Pass `false` to disable.
 * @returns Object with `isDimmed` boolean and `poke()` to reset the timer.
 */
export function useDimmer(delay: number | false): { isDimmed: boolean; poke: () => void } {
  // When delay is false, we never dim
  const [isDimmed, setIsDimmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const resetTimer = useCallback(() => {
    if (delay === false) {
      setIsDimmed(false);
      return;
    }

    setIsDimmed(true);

    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      setIsDimmed(false);
    }, delay);
  }, [delay]);

  // Reset dimmer on user interaction
  useEffect(() => {
    if (delay === false) {
      return;
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'] as const;

    const handler = () => {
      resetTimer();
    };

    events.forEach((event) => {
      document.addEventListener(event, handler, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handler);
      });
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
      }
    };
  }, [delay, resetTimer]);

  return { isDimmed, poke: resetTimer };
}
