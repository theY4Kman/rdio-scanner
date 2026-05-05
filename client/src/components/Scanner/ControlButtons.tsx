import { useCallback } from 'react';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { useScannerStore } from '../../stores/scanner';
import { useElapsedSeconds } from '../../hooks/useAudioTime';
import { formatDuration } from '../../utils/format';
import { BeepStyle, LivefeedMode } from '../../types/scanner';

// ---------------------------------------------------------------------------
// Retro button styling (from common.scss)
// ---------------------------------------------------------------------------

const buttonBaseSx: SxProps<Theme> = {
  '--def': 'rgb(45, 45, 45)',
  '--green': 'rgb(0, 230, 118)',
  '--red': 'rgb(255, 23, 68)',
  '--yellow': 'rgb(255, 234, 0)',
  '--blue': 'rgb(41, 121, 255)',
  background: 'var(--def)',
  borderStyle: 'solid',
  borderWidth: 1,
  borderBottomColor: 'rgba(0, 0, 0, 0.87)',
  borderLeftColor: 'rgba(255, 255, 255, 0.7)',
  borderRightColor: 'rgba(0, 0, 0, 0.87)',
  borderTopColor: 'rgba(255, 255, 255, 0.7)',
  color: 'rgb(250, 250, 250)',
  fontFamily: 'inherit',
  fontWeight: 500,
  fontSize: 12,
  height: 40,
  lineHeight: '18px',
  m: '2px',
  overflow: 'hidden',
  px: 1,
  py: '2px',
  position: 'relative',
  textOverflow: 'clip',
  textShadow: '0 0 4px rgb(0, 0, 0)',
  whiteSpace: 'normal',
  textTransform: 'uppercase',
  minWidth: 80,
  flex: 1,
  cursor: 'pointer',
  '&:active, &:focus': { outline: 0 },
  '&:active': {
    top: 2,
    transform: 'scale(0.98)',
    transformOrigin: 'bottom center',
  },
} as SxProps<Theme>;

// Status LED dot pseudo-element mixin
function statusDotSx(
  state: 'off' | 'on' | 'partial' | 'search' | undefined,
): SxProps<Theme> {
  if (!state) return {};

  const colorVar =
    state === 'on'
      ? 'var(--green)'
      : state === 'partial'
        ? 'var(--yellow)'
        : state === 'search'
          ? 'var(--blue)'
          : 'var(--red)';

  return {
    '&::after': {
      content: '""',
      display: 'block',
      height: 6,
      position: 'absolute',
      right: 4,
      top: 4,
      width: 6,
      background: colorVar,
      boxShadow: `1px 1px 1px rgba(255,255,255,0.7) inset, 0 0 3px 1px ${colorVar}`,
    },
  };
}

// ---------------------------------------------------------------------------
// RetroButton component
// ---------------------------------------------------------------------------

interface RetroButtonProps {
  label: string;
  subLabel?: string;
  state?: 'off' | 'on' | 'partial' | 'search';
  onClick: () => void;
  /**
   * Optional overlay content rendered inside the button (absolutely
   * positioned by the caller). Useful for adding affordances like the
   * search-queue close-X on PAUSE without disturbing the flex layout of
   * the button's row -- the RetroButton stays a direct flex child so it
   * distributes identically to its un-decorated siblings.
   */
  overlay?: React.ReactNode;
}

function RetroButton({ label, subLabel, state, onClick, overlay }: RetroButtonProps) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        ...buttonBaseSx,
        ...statusDotSx(state),
      } as SxProps<Theme>}
    >
      {label}
      {subLabel && (
        <Box
          component="div"
          sx={{ color: 'rgb(0, 230, 118)', fontSize: 11 }}
        >
          {subLabel}
        </Box>
      )}
      {overlay}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// ControlButtons
// ---------------------------------------------------------------------------

interface ControlButtonsProps {
  onOpenSearch: () => void;
  onOpenSelect: () => void;
  onReplay: () => void;
}

export function ControlButtons({ onOpenSearch, onOpenSelect, onReplay }: ControlButtonsProps) {
  const livefeedMode = useScannerStore((s) => s.livefeedMode);
  const paused = useScannerStore((s) => s.paused);
  const pausedAt = useScannerStore((s) => s.pausedAt);
  const holdTg = useScannerStore((s) => s.holdTg);
  const queuePersistEnabled = useScannerStore((s) => s.queuePersistEnabled);
  const call = useScannerStore((s) => s.call);
  const callPrevious = useScannerStore((s) => s.callPrevious);
  const config = useScannerStore((s) => s.config);
  const authRequired = useScannerStore((s) => s.authRequired);
  const searchQueueActive = useScannerStore((s) => s.searchQueue.active);

  const store = useScannerStore.getState();

  // Elapsed timers
  const pausedElapsed = useElapsedSeconds(pausedAt);

  // We need a stable "livefeed started at" value, not one that changes on every render.
  // Use a ref-based approach through a separate elapsed counter.
  const livefeedIsOnline = livefeedMode === LivefeedMode.Online;

  const isOffline = livefeedMode === LivefeedMode.Offline;
  const isPlayback = livefeedMode === LivefeedMode.Playback;

  const activeCall = call || callPrevious;

  // Avoid cycling logic
  const handleAvoid = useCallback(() => {
    if (authRequired) return;

    if (!activeCall) {
      store.beep(BeepStyle.Denied);
      return;
    }

    const avoided = store.isAvoided(activeCall);
    const minutes = store.isAvoidedTimer(activeCall);

    if (!avoided) {
      store.avoid({ status: false });
    } else if (!minutes) {
      store.avoid({ minutes: 30, status: false });
    } else if (minutes === 30) {
      store.avoid({ minutes: 60, status: false });
    } else if (minutes === 60) {
      store.avoid({ minutes: 120, status: false });
    } else {
      store.avoid({ status: true });
    }

    if (activeCall && store.isAvoided(activeCall)) {
      store.beep(BeepStyle.Activate);
    } else {
      store.beep(BeepStyle.Deactivate);
    }
  }, [activeCall, authRequired, store]);

  const handleLivefeed = useCallback(() => {
    if (authRequired) return;
    store.beep(isOffline && !isPlayback ? BeepStyle.Activate : BeepStyle.Deactivate);
    store.livefeed();
  }, [authRequired, isOffline, isPlayback, store]);

  const handlePause = useCallback(() => {
    if (authRequired) return;
    store.beep(paused ? BeepStyle.Deactivate : BeepStyle.Activate);
    store.pause();
  }, [authRequired, paused, store]);

  const handleReplay = useCallback(() => {
    onReplay();
  }, [onReplay]);

  const handleSkip = useCallback(() => {
    if (authRequired) return;
    store.beep(BeepStyle.Activate);
    store.skip({ delay: true });
  }, [authRequired, store]);

  const handleHoldTalkgroup = useCallback(() => {
    if (authRequired) return;
    if (call || callPrevious) {
      store.beep(holdTg ? BeepStyle.Deactivate : BeepStyle.Activate);
      store.holdTalkgroup();
    } else {
      store.beep(BeepStyle.Denied);
    }
  }, [authRequired, call, callPrevious, holdTg, store]);

  const handlePersistQueue = useCallback(() => {
    if (authRequired) return;
    store.beep(queuePersistEnabled ? BeepStyle.Deactivate : BeepStyle.Activate);
    store.enableQueuePersist(!queuePersistEnabled);
  }, [authRequired, queuePersistEnabled, store]);

  const handleSearchCall = useCallback(() => {
    if (authRequired || !config) return;
    store.beep();
    onOpenSearch();
  }, [authRequired, config, store, onOpenSearch]);

  const handleSelectTg = useCallback(() => {
    if (authRequired || !config) return;
    store.beep();
    onOpenSelect();
  }, [authRequired, config, store, onOpenSelect]);

  const spacerSx = { display: 'block', width: 24, flexShrink: 0 };

  const rowSx = {
    display: 'flex',
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    mb: '12px',
  };

  return (
    <Box>
      {/* Row 1: LIVE FEED, PERSIST Q, HOLD TG */}
      <Box sx={rowSx}>
        <RetroButton
          label="Live Feed"
          subLabel={
            livefeedIsOnline
              ? formatDuration(pausedElapsed, 0)
              : undefined
          }
          state={
            isOffline && !isPlayback
              ? 'off'
              : livefeedIsOnline
                ? 'on'
                : isPlayback
                  ? 'partial'
                  : undefined
          }
          onClick={handleLivefeed}
        />
        <Box sx={spacerSx} />
        <RetroButton
          label="Persist Q"
          state={queuePersistEnabled ? 'on' : 'off'}
          onClick={handlePersistQueue}
        />
        <Box sx={spacerSx} />
        <RetroButton
          label="Hold TG"
          state={holdTg ? 'on' : 'off'}
          onClick={handleHoldTalkgroup}
        />
      </Box>

      {/* Row 2: REPLAY LAST, SKIP NEXT, AVOID */}
      <Box sx={rowSx}>
        <RetroButton label="Replay Last" onClick={handleReplay} />
        <Box sx={spacerSx} />
        <RetroButton label="Skip Next" onClick={handleSkip} />
        <Box sx={spacerSx} />
        <RetroButton label="Avoid" onClick={handleAvoid} />
      </Box>

      {/* Row 3: SEARCH CALL, PAUSE, SELECT TG */}
      <Box sx={rowSx}>
        <RetroButton label="Search Call" onClick={handleSearchCall} />
        <Box sx={spacerSx} />
        {/*
          PAUSE is a direct flex sibling of SEARCH CALL / SELECT TG so they
          all distribute width identically. The close-X during search-queue
          playback is rendered as an absolutely-positioned overlay INSIDE
          the button via the `overlay` prop (the button is already
          `position: relative`). It's a nested <span> with role="button" so
          the click doesn't bubble to the PAUSE button itself.
        */}
        <RetroButton
          label="Pause"
          subLabel={paused ? formatDuration(pausedElapsed, 0) : undefined}
          state={
            searchQueueActive
              ? 'search'              // blue LED during search-queue playback
              : paused
                ? 'on'
                : 'off'
          }
          onClick={handlePause}
          overlay={
            searchQueueActive ? (
              <Box
                component="span"
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  store.beep(BeepStyle.Deactivate);
                  store.exitSearchQueue();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    store.beep(BeepStyle.Deactivate);
                    store.exitSearchQueue();
                  }
                }}
                title="Exit search queue (resume livefeed)"
                sx={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 18,
                  height: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgb(255, 100, 100)',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgb(160, 60, 60)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  fontSize: 12,
                  lineHeight: 1,
                  fontWeight: 700,
                  userSelect: 'none',
                  zIndex: 1,
                  '&:hover': {
                    background: 'rgba(120, 30, 30, 0.6)',
                    color: 'rgb(255, 160, 160)',
                  },
                }}
              >
                ×
              </Box>
            ) : undefined
          }
        />
        <Box sx={spacerSx} />
        <RetroButton label="Select TG" onClick={handleSelectTg} />
      </Box>
    </Box>
  );
}
