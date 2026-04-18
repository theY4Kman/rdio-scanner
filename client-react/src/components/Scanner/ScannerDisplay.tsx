import { useMemo } from 'react';
import { Box } from '@mui/material';
import { useScannerStore } from '../../stores/scanner';
import { useClock } from '../../hooks/useClock';
import { useAudioTime } from '../../hooks/useAudioTime';
import { useDimmer } from '../../hooks/useDimmer';
import { formatFrequency, formatAfs, formatDuration } from '../../utils/format';
import { LED_COLORS, LED_COLOR_DEFAULT, LED_COLOR_OFF } from '../../utils/led-colors';
import { UnitTimeline } from './UnitTimeline';
import { AuthOverlay } from './AuthOverlay';
import { CallHistory } from './CallHistory';
import type { Call, CallFrequency as CallFreqType } from '../../types/scanner';

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
}

export function ScannerDisplay({ onDoubleClick }: ScannerDisplayProps) {
  const call = useScannerStore((s) => s.call);
  const callPrevious = useScannerStore((s) => s.callPrevious);
  const config = useScannerStore((s) => s.config);
  const linked = useScannerStore((s) => s.linked);
  const listeners = useScannerStore((s) => s.listeners);
  const callQueue = useScannerStore((s) => s.callQueue);
  const clock = useClock();
  const { isDimmed } = useDimmer(config.dimmerDelay);

  // Poke dimmer whenever callTime changes (activity)
  // This is handled implicitly by user interactions triggering the dimmer reset

  const isAfs = call ? isAfsSystem(config.afs, call.talkgroup) : false;

  const callSystem = call
    ? call.systemData?.label || `${call.system}`
    : 'System';

  const callTag = call ? call.talkgroupData?.tag || '' : 'Tag';

  const callTalkgroup = call
    ? call.talkgroupData?.label ||
      `${isAfs ? formatAfs(call.talkgroup) : call.talkgroup}`
    : 'Talkgroup';

  const callTalkgroupName = call
    ? call.talkgroupData?.name || formatFrequency(call.frequency)
    : 'Rdio Scanner';

  const callTalkgroupId = call
    ? isAfs
      ? formatAfs(call.talkgroup)
      : call.talkgroup.toString()
    : '0';

  const callDuration = call?.audioDuration || 0;

  // Avoid/patch flags
  const activeCall = call || callPrevious;
  const { isAvoided, isAvoidedTimer, isPatched } = useScannerStore.getState();
  const avoided = activeCall ? isAvoided(activeCall) : false;
  const tempAvoid = activeCall ? isAvoidedTimer(activeCall) : 0;
  const patched = activeCall ? isPatched(activeCall) : false;

  // Queue stats
  const queueCount = callQueue.length;
  const queueDuration = callQueue.reduce(
    (sum, c) => sum + (c.audioDuration || 0),
    0,
  );

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
            '& .value': queueCount > 0
              ? {
                  color: 'rgb(0, 230, 118)',
                  textShadow:
                    '-1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9)',
                }
              : {},
          }}
        >
          <span style={{ marginRight: 10, minWidth: 45, display: 'inline-block' }}>
            Q: <span className="value">{queueCount}</span>
          </span>
          <span style={{ minWidth: 80, display: 'inline-block' }}>
            {'⏲'}: <span className="value">{formatDuration(queueDuration, 0)}s</span>
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
          <ProgressTimestamp call={call} time12hFormat={config.time12hFormat} />
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
        <Box><FrequencyDisplay call={call} /></Box>
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
          <ErrorSpikeDisplay call={call} />
        </Box>
        <Box>
          {call && (
            <UnitTimeline
              call={call}
              callDuration={callDuration}
            />
          )}
        </Box>
      </Box>

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

      {/* Auth overlay + History wrapper */}
      <Box sx={{ position: 'relative', maxHeight: '40vh', overflow: 'hidden' }}>
        <AuthOverlay />
        <CallHistory />
      </Box>
    </Box>
  );
}

export { LedDot };
