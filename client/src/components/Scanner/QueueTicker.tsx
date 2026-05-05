import { useMemo } from 'react';
import { Box } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { useScannerStore } from '../../stores/scanner';
import { formatDuration } from '../../utils/format';
import { LED_COLORS } from '../../utils/led-colors';
import type { Call } from '../../types/scanner';

// ---------------------------------------------------------------------------
// Motion config
// ---------------------------------------------------------------------------

const FADE_THRESHOLD = 5;
const START_COUNT = 3;
const END_COUNT = 3;

const enterVariants = {
  initial: { opacity: 0, x: 30, scale: 0.98 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

const reducedMotionVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

// ---------------------------------------------------------------------------
// Single queued call chip
// ---------------------------------------------------------------------------

function QueuedCallChip({
  call,
  prefersReducedMotion,
  showSeparator,
  source,
}: {
  call: Call;
  prefersReducedMotion: boolean;
  showSeparator: boolean;
  source: 'search' | 'live';
}) {
  const variants = prefersReducedMotion
    ? reducedMotionVariants
    : enterVariants;

  const tgLabel =
    (
      call.talkgroupData?.label ||
      call.talkgroupData?.name ||
      call.talkgroup
    )
      .toString()
      .trim();

  const ledColor = call.talkgroupData?.led ?? 'green';
  const textColor = LED_COLORS[ledColor] ?? LED_COLORS.green;

  // Search-queue chips get a subtle italic treatment so users can tell
  // them apart from live-feed chips in the unified ticker.
  const chipStyle =
    source === 'search' ? { fontStyle: 'italic' as const } : undefined;

  return (
    <motion.span
      layout
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{
        duration: prefersReducedMotion ? 0.1 : 0.3,
        ease: prefersReducedMotion
          ? 'linear'
          : [0.4, 0.0, 0.2, 1],
      }}
      style={chipStyle}
    >
      {showSeparator && ', '}
      <span style={{ whiteSpace: 'nowrap' }}>
        <span
          style={{
            opacity: 0.8,
            paddingRight: 3,
          }}
        >
          {'['}
          {formatDuration(call.audioDuration)}
          {']'}
        </span>
        <span style={{ color: textColor }}>
          {tgLabel}
        </span>
      </span>
    </motion.span>
  );
}

type TickerEntry = { call: Call; source: 'search' | 'live' };

// ---------------------------------------------------------------------------
// QueueTicker component
// ---------------------------------------------------------------------------

export function QueueTicker() {
  const callQueue = useScannerStore((s) => s.callQueue);
  const searchQueue = useScannerStore((s) => s.searchQueue);
  const playbackList = useScannerStore((s) => s.playbackList);

  // Build the unified list: search-queue upcoming calls on the left
  // (front of ticker = plays soonest), then live-feed calls on the right.
  // Live-feed calls include both whatever's already in callQueue and any
  // arriving calls that were buffered into pendingLivefeedCalls during
  // search-queue playback.
  const entries: TickerEntry[] = useMemo(() => {
    const searchCalls: Call[] =
      searchQueue.active && playbackList?.results
        ? searchQueue.queuedCallIds
            .map((id) => playbackList.results.find((c) => c?.id === id))
            .filter((c): c is Call => !!c)
        : [];

    const liveCalls: Call[] = searchQueue.active
      ? [...callQueue, ...searchQueue.pendingLivefeedCalls]
      : callQueue;

    return [
      ...searchCalls.map<TickerEntry>((call) => ({ call, source: 'search' })),
      ...liveCalls.map<TickerEntry>((call) => ({ call, source: 'live' })),
    ];
  }, [callQueue, searchQueue, playbackList]);

  // Detect reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const shouldFade = entries.length > FADE_THRESHOLD;

  const startEntries = shouldFade
    ? entries.slice(0, START_COUNT)
    : entries;

  const endEntries = shouldFade
    ? entries.slice(-END_COUNT)
    : [];

  if (entries.length === 0) {
    return <Box sx={{ flex: 1 }} />;
  }

  return (
    <Box
      sx={{
        color: 'rgb(64, 64, 64)',
        flex: 1,
        fontSize: 13,
        fontWeight: 'normal',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        ...(shouldFade
          ? {
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1rem',
            }
          : {
              textOverflow: 'ellipsis',
            }),
      }}
    >
      {!shouldFade && (
        <AnimatePresence mode="popLayout">
          {startEntries.map((entry, i) => (
            <QueuedCallChip
              key={`${entry.source}-${entry.call.id}`}
              call={entry.call}
              source={entry.source}
              prefersReducedMotion={prefersReducedMotion}
              showSeparator={i > 0}
            />
          ))}
        </AnimatePresence>
      )}

      {shouldFade && (
        <>
          {/* Left side: first 3 entries (search-queue first, then live), fades right */}
          <Box
            sx={{
              display: 'inline-block',
              maxWidth: '50%',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textAlign: 'left',
              maskImage:
                'linear-gradient(to right, black 0%, black 70%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to right, black 0%, black 70%, transparent 100%)',
            }}
          >
            <AnimatePresence mode="popLayout">
              {startEntries.map((entry, i) => (
                <QueuedCallChip
                  key={`${entry.source}-${entry.call.id}`}
                  call={entry.call}
                  source={entry.source}
                  prefersReducedMotion={prefersReducedMotion}
                  showSeparator={i > 0}
                />
              ))}
            </AnimatePresence>
          </Box>

          {/* Right side: last 3 entries, fades left */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              maxWidth: '50%',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              maskImage:
                'linear-gradient(to left, black 0%, black 70%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to left, black 0%, black 70%, transparent 100%)',
            }}
          >
            <AnimatePresence mode="popLayout">
              {endEntries.map((entry, i) => (
                <QueuedCallChip
                  key={`${entry.source}-${entry.call.id}`}
                  call={entry.call}
                  source={entry.source}
                  prefersReducedMotion={prefersReducedMotion}
                  showSeparator={i > 0}
                />
              ))}
            </AnimatePresence>
          </Box>
        </>
      )}
    </Box>
  );
}
