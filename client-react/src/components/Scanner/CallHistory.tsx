import { useCallback, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import { useScannerStore } from '../../stores/scanner';
import { formatDuration } from '../../utils/format';
import { LED_COLORS, LED_COLOR_DEFAULT } from '../../utils/led-colors';
import type { Call } from '../../types/scanner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcNumUniqueSources(call: Call): number {
  if (Array.isArray(call.sources)) {
    const uniqueUnitIds = new Set(call.sources.map(({ src }) => src ?? -1));
    return uniqueUnitIds.size;
  }
  if (typeof call.source === 'number') {
    return 1;
  }
  return 0;
}

function getSourceLabel(source: { src?: number; label?: string }): string {
  if (source.label) return source.label;
  if (typeof source.src === 'number') return `${source.src}`;
  return '?';
}

// ---------------------------------------------------------------------------
// CallHistory component
// ---------------------------------------------------------------------------

export function CallHistory() {
  const config = useScannerStore((s) => s.config);
  const call = useScannerStore((s) => s.call);
  const callPrevious = useScannerStore((s) => s.callPrevious);
  // Maintain a history of the last 30 played calls
  const historyRef = useRef<(Call | undefined)[]>(new Array(30).fill(undefined));

  // Update history when call or callPrevious changes
  const history = useMemo(() => {
    const h = historyRef.current;

    const addToHistory = (c: Call) => {
      if (!h.find((item) => item?.id === c.id)) {
        h.pop();
        h.unshift(c);
      }
    };

    if (call) addToHistory(call);
    if (callPrevious && callPrevious.id !== call?.id) addToHistory(callPrevious);

    return [...h];
  }, [call, callPrevious]);

  const loadAndPlay = useScannerStore.getState().loadAndPlay;

  const timeFormat: Intl.DateTimeFormatOptions = config.time12hFormat
    ? { hour: 'numeric', minute: '2-digit', hour12: true }
    : { hour: '2-digit', minute: '2-digit', hour12: false };

  const handleRowClick = useCallback(
    (prevCall: Call | undefined) => {
      if (prevCall) {
        loadAndPlay(prevCall.id);
      }
    },
    [loadAndPlay],
  );

  const thSx = {
    color: 'rgba(0, 0, 0, 0.4)',
    fontWeight: 400,
    textTransform: 'uppercase' as const,
    px: '6px',
    textAlign: 'start' as const,
  };

  return (
    <Box
      component="table"
      sx={{
        borderCollapse: 'collapse',
        fontSize: 11,
        tableLayout: 'fixed',
        width: '100%',
        '& td, & th': {
          px: '6px',
          textAlign: 'start',
        },
        '& .col-time, & .col-duration': { width: '10%' },
        '& .col-system': { width: '15%' },
        '& .col-talkgroup': { width: '25%' },
        '& .col-unit': { width: '100%', textOverflow: 'ellipsis', overflow: 'hidden' },
        '& tbody > tr': {
          borderTop: '1px solid rgba(0, 0, 0, 0.2)',
          height: 21,
          cursor: 'pointer',
        },
      }}
    >
      <thead>
        <tr>
          <Box component="th" className="col-time" sx={thSx}>
            {'⏰'}
          </Box>
          <Box component="th" className="col-duration" sx={thSx}>
            {'⏲'}
          </Box>
          <Box component="th" className="col-system" sx={thSx}>
            System
          </Box>
          <Box component="th" className="col-talkgroup" sx={thSx}>
            Talkgroup
          </Box>
          <Box component="th" className="col-unit" sx={thSx}>
            Units
          </Box>
        </tr>
      </thead>
      <tbody>
        {history.map((prevCall, index) => {
          const isActive = call?.id != null && call.id === prevCall?.id;
          const ledColor = isActive
            ? prevCall?.talkgroupData?.led ?? prevCall?.systemData?.led ?? 'green'
            : 'green';
          const ledCssColor = LED_COLORS[ledColor] ?? LED_COLOR_DEFAULT;

          return (
            <tr
              key={prevCall?.id ?? `empty-${index}`}
              onClick={() => handleRowClick(prevCall)}
              style={{
                fontWeight: isActive ? 700 : undefined,
                position: 'relative',
              }}
            >
              <td className="col-time" style={{ position: 'relative' }}>
                {isActive && (
                  <span
                    style={{
                      position: 'absolute',
                      left: -8,
                      color: ledCssColor,
                    }}
                  >
                    {'\u2B24'}
                  </span>
                )}
                <span>
                  {prevCall
                    ? new Date(prevCall.dateTime).toLocaleTimeString(
                        [],
                        timeFormat,
                      )
                    : ''}
                </span>
              </td>
              <td className="col-duration">
                <span>
                  {prevCall
                    ? `${formatDuration(prevCall.audioDuration)}s`
                    : ''}
                </span>
              </td>
              <td className="col-system">
                <span>
                  {prevCall?.systemData?.label || prevCall?.system || ''}
                </span>
              </td>
              <td className="col-talkgroup">
                <span>
                  {prevCall?.talkgroupData?.label ||
                    prevCall?.talkgroup ||
                    ''}
                </span>
              </td>
              <td
                className="col-unit"
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {prevCall && (
                  <span>
                    <span>({calcNumUniqueSources(prevCall)}) </span>
                    {prevCall.sources?.map((source, srcIdx) => (
                      <span key={srcIdx}>
                        {srcIdx > 0 && ', '}
                        <span
                          style={{
                            color:
                              source.label != null
                                ? 'rgb(0, 163, 84)'
                                : 'rgb(204, 122, 0)',
                          }}
                          title={
                            typeof source.src === 'number'
                              ? `${source.src}`
                              : undefined
                          }
                        >
                          {getSourceLabel(source)}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Box>
  );
}
