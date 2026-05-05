import { useMemo, useCallback } from 'react';
import { Box } from '@mui/material';
import { useScannerStore } from '../../stores/scanner';
import { useClock } from '../../hooks/useClock';
import { useAudioTime } from '../../hooks/useAudioTime';
import { useDimmer } from '../../hooks/useDimmer';
import { formatFrequency, formatAfs, formatDuration } from '../../utils/format';
import { LED_COLORS, LED_COLOR_DEFAULT, LED_COLOR_OFF } from '../../utils/led-colors';
import { UnitTimeline } from './UnitTimeline';
import { registerTranscriptSlot } from '../../services/extension';
import { AuthOverlay } from './AuthOverlay';
import { CallHistory } from './CallHistory';
import type { Call, CallFrequency as CallFreqType, CallSource as CallSourceType } from '../../types/scanner';

// ---------------------------------------------------------------------------
// Helper: check if a system uses AFS encoding
// ---------------------------------------------------------------------------
function isAfsSystem(afs: string | undefined, talkgroupId: number): boolean {
  if (typeof afs !== 'string') return false;
  return afs.split(',').includes(talkgroupId.toString());
}

// ---------------------------------------------------------------------------
// Helper: compute frequency-related display from call frequencies array
// ---------------------------------------------------------------------------
function getFrequencyInfo(
  call: Call | null,
  time: number,
): { frequency: string; error: string; spike: string } {
  if (!call) {
    return { frequency: formatFrequency(0), error: '0', spike: '0' };
  }

  if (Array.isArray(call.frequencies) && call.frequencies.length) {
    const freq = call.frequencies.reduce<CallFreqType>(
      (p, v) => ((v.pos || 0) <= time ? v : p),
      {},
    );

    return {
      frequency: formatFrequency(
        typeof freq.freq === 'number' ? freq.freq : call.frequency,
      ),
      error: typeof freq.errorCount === 'number' ? `${freq.errorCount}` : '',
      spike: typeof freq.spikeCount === 'number' ? `${freq.spikeCount}` : '',
    };
  }

  return {
    frequency:
      typeof call.frequency === 'number' ? formatFrequency(call.frequency) : '',
    error: '',
    spike: '',
  };
}

// ---------------------------------------------------------------------------
// LED dot component
// ---------------------------------------------------------------------------
function LedDot({
  call,
  paused,
}: {
  call: Call | null;
  paused: boolean;
}) {
  const ledColor = useMemo(() => {
    if (!call) return LED_COLOR_OFF;

    const tgLed = call.talkgroupData?.led;
    const sysLed = call.systemData?.led;

    if (tgLed && LED_COLORS[tgLed]) return LED_COLORS[tgLed];
    if (sysLed && LED_COLORS[sysLed]) return LED_COLORS[sysLed];
    return LED_COLOR_DEFAULT;
  }, [call]);

  const isOn = !!call;

  return (
    <Box
      sx={{
        width: 24,
        height: 12,
        ml: 3,
        flexShrink: 0,
        bgcolor: isOn ? ledColor : LED_COLOR_OFF,
        boxShadow: isOn ? `0 0 6px 3px ${ledColor}` : 'none',
        animation:
          isOn && paused ? 'led-blink 2s step-end infinite' : 'none',
        '@keyframes led-blink': {
          '50%': {
            background: LED_COLOR_OFF,
            boxShadow: 'none',
          },
        },
      }}
    />
  );
}

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

// ---------------------------------------------------------------------------
// Main ScannerDisplay
// ---------------------------------------------------------------------------

interface ScannerDisplayProps {
  onDoubleClick: () => void;
  onEditUnit?: (call: Call, source: CallSourceType) => void;
}

export function ScannerDisplay({ onDoubleClick, onEditUnit }: ScannerDisplayProps) {
  const call = useScannerStore((s) => s.call);
  const callPrevious = useScannerStore((s) => s.callPrevious);
  const config = useScannerStore((s) => s.config);
  const linked = useScannerStore((s) => s.linked);
  const listeners = useScannerStore((s) => s.listeners);
  const callQueue = useScannerStore((s) => s.callQueue);
  const searchQueue = useScannerStore((s) => s.searchQueue);
  const playbackList = useScannerStore((s) => s.playbackList);
  const clock = useClock();
  const { isDimmed } = useDimmer(config.dimmerDelay);

  // Poke dimmer whenever callTime changes (activity)
  // This is handled implicitly by user interactions triggering the dimmer reset

  // Use activeCall (call || callPrevious) so the LCD stays populated with the
  // last call's metadata after playback ends — matches Angular behavior and
  // gives the driver a moment to reflect on the context. Only cleared on
  // explicit STOP or when a new call arrives.
  const activeCall = call || callPrevious;
  const displayCall = activeCall;
  const isAfs = displayCall ? isAfsSystem(config.afs, displayCall.talkgroup) : false;

  const callSystem = displayCall
    ? displayCall.systemData?.label || `${displayCall.system}`
    : 'System';

  const callTag = displayCall ? displayCall.talkgroupData?.tag || '' : 'Tag';

  const callTalkgroup = displayCall
    ? displayCall.talkgroupData?.label ||
      `${isAfs ? formatAfs(displayCall.talkgroup) : displayCall.talkgroup}`
    : 'Talkgroup';

  const callTalkgroupName = displayCall
    ? displayCall.talkgroupData?.name || formatFrequency(displayCall.frequency)
    : 'Rdio Scanner';

  const callTalkgroupId = displayCall
    ? isAfs
      ? formatAfs(displayCall.talkgroup)
      : displayCall.talkgroup.toString()
    : '0';

  const callDuration = displayCall?.audioDuration || 0;

  // Stable callback ref for the extension transcript slot
  const transcriptSlotRef = useCallback((el: HTMLElement | null) => {
    registerTranscriptSlot(el);
  }, []);

  // Avoid/patch flags
  const { isAvoided, isAvoidedTimer, isPatched } = useScannerStore.getState();
  const avoided = activeCall ? isAvoided(activeCall) : false;
  const tempAvoid = activeCall ? isAvoidedTimer(activeCall) : 0;
  const patched = activeCall ? isPatched(activeCall) : false;

  // Queue stats -----------------------------------------------------------
  // The header shows TWO stats side-by-side when a search queue is active:
  //   * Search stats (blue, italic, prefixed with "+") -- calls queued from
  //     the Search page, shown FIRST because they play next.
  //   * Live stats (green) -- calls from the normal livefeed queue, plus any
  //     calls buffered into pendingLivefeedCalls during search-queue playback
  //     (those will merge back into callQueue when the search queue ends).
  //
  // We deliberately keep the two counts separate rather than summing: the
  // user asked for them to be visually distinct so the "search" portion is
  // readable at a glance.
  const liveQueueCount = callQueue.length + (
    searchQueue.active ? searchQueue.pendingLivefeedCalls.length : 0
  );
  const liveQueueDuration = callQueue.reduce(
    (sum, c) => sum + (c.audioDuration || 0),
    0,
  ) + (
    searchQueue.active
      ? searchQueue.pendingLivefeedCalls.reduce(
          (sum, c) => sum + (c.audioDuration || 0),
          0,
        )
      : 0
  );

  // Resolve search-queue ids via playbackList.results to get durations.
  const searchQueueCalls: Call[] = useMemo(() => {
    if (!searchQueue.active || !playbackList?.results) return [];
    return searchQueue.queuedCallIds
      .map((id) => playbackList.results.find((c) => c?.id === id))
      .filter((c): c is Call => !!c);
  }, [searchQueue.active, searchQueue.queuedCallIds, playbackList]);
  const searchQueueCount = searchQueueCalls.length;
  const searchQueueDuration = searchQueueCalls.reduce(
    (sum, c) => sum + (c.audioDuration || 0),
    0,
  );

  const showSearchStats = searchQueue.active;

  // Search-indicator blue. Brighter/more saturated than LED_COLORS.blue so
  // it pops against the olive LCD background (rgb(190, 190, 174)).
  // LED_COLORS.blue (rgb(41, 121, 255)) is too desaturated against khaki to
  // read comfortably; this is a near-"deep sky blue" tuned for contrast.
  const SEARCH_COLOR = 'rgb(0, 200, 255)';

  // Time format
  const timeFormat: Intl.DateTimeFormatOptions = config.time12hFormat
    ? { hour: 'numeric', minute: '2-digit', hour12: true }
    : { hour: '2-digit', minute: '2-digit', hour12: false };

  const formatTime = (date: Date | null) => {
    if (!date) return '';
    return date.toLocaleTimeString([], timeFormat);
  };

  // Shared row style
  const rowSx = {
    display: 'flex',
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    height: 20,
    overflow: 'hidden',
    textOverflow: 'clip',
    whiteSpace: 'nowrap' as const,
  };

  return (
    <Box
      onDoubleClick={onDoubleClick}
      sx={{
        background: isDimmed ? 'rgb(209, 238, 238)' : 'rgb(190, 190, 174)',
        boxShadow:
          '2px 2px 4px rgb(0, 0, 0) inset, 1px 1px 2px 1px rgb(255, 255, 255)',
        color: 'rgba(0, 0, 0, 0.8)',
        cursor: 'default',
        display: 'block',
        fontSize: 14,
        fontWeight: 400,
        lineHeight: '20px',
        p: 1,
        maxHeight: '60vh',
        overflow: 'hidden',
        position: 'relative',
        mb: 3,
      }}
    >
      {/* Header row: time, link status, queue */}
      <Box
        sx={{
          ...rowSx,
          fontSize: '1.3em',
          mb: '20px',
          height: 'auto',
        }}
      >
        <Box>
          <span>{formatTime(clock)}</span>
        </Box>
        {!linked && (
          <Box>
            <span>NO LINK</span>
          </Box>
        )}
        {linked && config.showListenersCount && (
          <Box>
            <span>L: {listeners}</span>
          </Box>
        )}
        <Box
          sx={{
            '& > span': { display: 'inline-block' },
            // Live (green) value color -- applied when there's anything to
            // show so the numbers pop against the LCD background. We DO show
            // the live portion even when liveQueueCount === 0, as long as a
            // search queue is active, so "Q: 8+0" reads correctly.
            '& .value.live': (liveQueueCount > 0 || showSearchStats)
              ? {
                  color: 'rgb(0, 230, 118)',
                  textShadow:
                    '-1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9)',
                }
              : {},
            // Search (blue, italic) value color.
            '& .value.search': {
              color: SEARCH_COLOR,
              fontStyle: 'italic',
              textShadow:
                '-1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9)',
            },
            '& .plus': {
              opacity: 0.7,
              padding: '0 2px',
            },
          }}
        >
          {/* Count: "Q: N" normally; "Q: S+N" when a search queue is active. */}
          <span style={{ marginRight: 10, minWidth: 45, display: 'inline-block' }}>
            Q:{' '}
            {showSearchStats && (
              <>
                <span className="value search">{searchQueueCount}</span>
                <span className="plus">+</span>
              </>
            )}
            <span className="value live">{liveQueueCount}</span>
          </span>
          {/* Duration: matching layout, "S+L" when search queue is active. */}
          <span style={{ minWidth: 80, display: 'inline-block' }}>
            {'⏲'}:{' '}
            {showSearchStats && (
              <>
                <span className="value search">
                  {formatDuration(searchQueueDuration, 0)}s
                </span>
                <span className="plus">+</span>
              </>
            )}
            <span className="value live">
              {formatDuration(liveQueueDuration, 0)}s
            </span>
          </span>
        </Box>
      </Box>

      {/* System / Tag row */}
      <Box sx={rowSx}>
        <Box><span>{callSystem}</span></Box>
        <Box><span>{callTag}</span></Box>
      </Box>

      {/* Talkgroup / Duration+Time row */}
      <Box sx={rowSx}>
        <Box><span>{callTalkgroup}</span></Box>
        <Box>
          <span>{callDuration.toFixed(1)}s</span>
          {' '}
          {'\u2014 '}
          <ProgressTimestamp call={displayCall} time12hFormat={config.time12hFormat} />
        </Box>
      </Box>

      {/* Big talkgroup name */}
      <Box
        sx={{
          ...rowSx,
          fontSize: 24,
          height: 32,
          lineHeight: '32px',
        }}
      >
        <span>{callTalkgroupName}</span>
      </Box>

      {/* Frequency / TGID row */}
      <Box sx={rowSx}>
        <Box><FrequencyDisplay call={displayCall} /></Box>
        <Box><span>TGID: {callTalkgroupId || '0'}</span></Box>
      </Box>

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
          <ErrorSpikeDisplay call={displayCall} />
        </Box>
        {/* Seekbar / unit timeline tracks live playback — it disappears
            when the call ends (the text metadata above stays "sticky"). */}
        <Box sx={{ visibility: call ? 'visible' : 'hidden' }}>
          <UnitTimeline
            call={call}
            callDuration={call?.audioDuration || 0}
            onEditUnit={onEditUnit}
          />
        </Box>
      </Box>

      {/* Extension slot: transcript area (stable anchor for browser extensions) */}
      <Box
        ref={transcriptSlotRef}
        sx={{ width: '100%' }}
      />

      {/* Flags row (avoid/patch/timer) */}
      <Box
        sx={{
          ...rowSx,
          fontSize: 12,
          height: 14,
          lineHeight: '14px',
        }}
      >
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {tempAvoid > 0 && (
            <span
              style={{
                background: 'rgba(0, 0, 0, 0.8)',
                borderRadius: 3,
                color: 'rgb(209, 238, 238)',
                opacity: 0.87,
                padding: '0 3px',
              }}
            >
              {'\u23F2\uFE0E'} {tempAvoid}M
            </span>
          )}
          {avoided && (
            <span
              style={{
                background: 'rgba(0, 0, 0, 0.8)',
                borderRadius: 3,
                color: 'rgb(209, 238, 238)',
                opacity: 0.87,
                padding: '0 3px',
              }}
            >
              AVOID
            </span>
          )}
          {patched && (
            <span
              style={{
                background: 'rgba(0, 0, 0, 0.8)',
                borderRadius: 3,
                color: 'rgb(209, 238, 238)',
                opacity: 0.87,
                padding: '0 3px',
              }}
            >
              PATCH
            </span>
          )}
        </Box>
        <Box />
      </Box>

      {/* Small spacer */}
      <Box sx={{ ...rowSx, fontSize: 12, height: 14 }} />

      {/* Auth overlay + History */}
      <Box sx={{ position: 'relative' }}>
        <AuthOverlay />
      </Box>
      <CallHistory onEditUnit={onEditUnit} />
    </Box>
  );
}

export { LedDot };
