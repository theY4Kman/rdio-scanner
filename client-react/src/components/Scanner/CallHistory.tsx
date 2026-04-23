import { useCallback, useMemo } from 'react';
// NOTE: The parent LCD panel (ScannerDisplay) clips overflow, so we render
// all MAX_HISTORY rows and let the panel hide any that extend past its edge.
import { Box } from '@mui/material';
import { useScannerStore } from '../../stores/scanner';
import { formatDuration } from '../../utils/format';
import { LED_COLORS, LED_COLOR_DEFAULT } from '../../utils/led-colors';
import type { Call, CallSource as CallSourceType } from '../../types/scanner';
import UnitLabel from '../UnitLabel';

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



// ---------------------------------------------------------------------------
// CallHistory component
// ---------------------------------------------------------------------------

const MAX_HISTORY = 30;

interface CallHistoryProps {
  onEditUnit?: (call: Call, source: CallSourceType) => void;
}

export function CallHistory({ onEditUnit }: CallHistoryProps) {
  const config = useScannerStore((s) => s.config);
  const call = useScannerStore((s) => s.call);
  const storeHistory = useScannerStore((s) => s.callHistory);

  // Pad with undefined to fill MAX_HISTORY rows (empty rows render as blanks)
  const history = useMemo(() => {
    const padded: (Call | undefined)[] = [...storeHistory];
    while (padded.length < MAX_HISTORY) padded.push(undefined);
    return padded;
  }, [storeHistory]);

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
                        <UnitLabel
                          call={prevCall}
                          source={source}
                          onEdit={onEditUnit}
                        />
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
