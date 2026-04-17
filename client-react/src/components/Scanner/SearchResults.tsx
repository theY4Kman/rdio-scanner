import { useCallback } from 'react';
import {
  Box,
  Card,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import CachedIcon from '@mui/icons-material/Cached';
import type { Call, Config, LivefeedMap, PlaybackList } from '../../types/scanner';
import { LivefeedMode } from '../../types/scanner';
import { useScannerStore } from '../../stores/scanner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResultsProps {
  results: Array<Call | null>;
  playbackList: PlaybackList | null;
  resultsPending: boolean;
  livefeedMode: LivefeedMode;
  call: Call | null;
  callPending: number | null;
  paused: boolean;
  config: Config;
  livefeedMap: LivefeedMap;
  pageIndex: number;
  pageSize: number;
  downloadMode: boolean;
  onDownloadModeChange: (mode: boolean) => void;
  onPageChange: (page: number) => void;
}

// ---------------------------------------------------------------------------
// Date formatting helpers
// ---------------------------------------------------------------------------

function formatDateShort(dt: Date | string | undefined): string {
  if (!dt) return '';
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

function formatDateFull(dt: Date | string | undefined): string {
  if (!dt) return '';
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function formatTimeShort(
  dt: Date | string | undefined,
  time12h: boolean,
): string {
  if (!dt) return '';
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  if (time12h) {
    let h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${mm} ${ampm}`;
  }
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatTimeFull(
  dt: Date | string | undefined,
  time12h: boolean,
): string {
  if (!dt) return '';
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  if (time12h) {
    let h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${mm}:${ss} ${ampm}`;
  }
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatDuration(val: number | undefined): string {
  if (val == null) return '';
  return `${val.toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// LED badge sub-component
// ---------------------------------------------------------------------------

const LED_COLOR_ON = 'rgb(0, 230, 118)';
const LED_COLOR_OFF = 'rgb(255, 23, 68)';

interface LedBadgeProps {
  active: boolean;
  onClick: () => void;
}

function LedBadge({ active, onClick }: LedBadgeProps) {
  return (
    <Tooltip title={active ? 'Subscribed (click to unsubscribe)' : 'Not subscribed (click to subscribe)'}>
      <Box
        component="span"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        sx={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: active ? LED_COLOR_ON : LED_COLOR_OFF,
          boxShadow: `0 0 4px ${active ? LED_COLOR_ON : LED_COLOR_OFF}`,
          cursor: 'pointer',
          flexShrink: 0,
          '&:hover': {
            boxShadow: `0 0 8px ${active ? LED_COLOR_ON : LED_COLOR_OFF}`,
          },
        }}
      />
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Spinning icon keyframes
// ---------------------------------------------------------------------------

const spinKeyframes = {
  '@keyframes spin': {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(-360deg)' },
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchResults({
  results,
  playbackList,
  resultsPending,
  livefeedMode,
  call,
  callPending,
  paused,
  config,
  livefeedMap,
  pageIndex,
  pageSize,
  downloadMode,
  onDownloadModeChange,
  onPageChange,
}: SearchResultsProps) {
  const loadAndPlay = useScannerStore((s) => s.loadAndPlay);
  const loadAndDownload = useScannerStore((s) => s.loadAndDownload);
  const stopPlaybackMode = useScannerStore((s) => s.stopPlaybackMode);
  const skip = useScannerStore((s) => s.skip);
  const avoid = useScannerStore((s) => s.avoid);

  const time12h = config.time12hFormat;
  const livefeedPlayback = livefeedMode === LivefeedMode.Playback;

  const totalCount = playbackList?.count ?? 0;

  // -------------------------------------------------------------------------
  // Talkgroup subscription toggle
  // -------------------------------------------------------------------------

  const toggleTalkgroupSubscription = useCallback(
    (systemId: number, talkgroupId: number) => {
      const system = config.systems.find((s) => s.id === systemId);
      const talkgroup = system?.talkgroups.find((tg) => tg.id === talkgroupId);
      if (system && talkgroup) {
        avoid({ system, talkgroup });
      }
    },
    [config.systems, avoid],
  );

  // -------------------------------------------------------------------------
  // Row action handlers
  // -------------------------------------------------------------------------

  const handlePlay = useCallback(
    (id: number) => {
      loadAndPlay(id);
    },
    [loadAndPlay],
  );

  const handleDownload = useCallback(
    (id: number) => {
      loadAndDownload(id);
    },
    [loadAndDownload],
  );

  const handleStop = useCallback(() => {
    if (livefeedPlayback) {
      stopPlaybackMode();
    } else {
      skip();
    }
  }, [livefeedPlayback, stopPlaybackMode, skip]);

  // -------------------------------------------------------------------------
  // Page change
  // -------------------------------------------------------------------------

  const handlePageChange = useCallback(
    (_e: React.MouseEvent<HTMLButtonElement> | null, page: number) => {
      onPageChange(page);
    },
    [onPageChange],
  );

  // -------------------------------------------------------------------------
  // Column widths
  // -------------------------------------------------------------------------

  const timeColWidth = time12h ? 80 : 56;

  // -------------------------------------------------------------------------
  // Sources display
  // -------------------------------------------------------------------------

  const formatSources = useCallback(
    (row: Call) => {
      if (!row.sources?.length) return '';
      return row.sources.map((s) => s.label || s.src || '').join(', ');
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Card
      sx={{
        bgcolor: 'rgba(255,255,255,0.04)',
        borderRadius: 1,
        mb: 2,
        overflow: 'hidden',
        p: 0,
      }}
    >
      <TableContainer>
        <Table size="small" sx={{ tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 48, p: 0.5 }} />
              <TableCell sx={{ width: 52 }}>Date</TableCell>
              <TableCell sx={{ width: timeColWidth }}>Time</TableCell>
              <TableCell sx={{ width: 60 }}>Duration</TableCell>
              <TableCell sx={{ width: '12%' }}>System</TableCell>
              <TableCell sx={{ width: '15%' }}>Talkgroup</TableCell>
              <TableCell>Unit(s)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {results.map((row, idx) => (
              <TableRow
                key={row?.id ?? `empty-${idx}`}
                sx={{
                  height: 41,
                  '&:last-child td': { borderBottom: 0 },
                }}
              >
                {/* Control column */}
                <TableCell sx={{ p: 0.5, textAlign: 'center' }}>
                  {row && (
                    <>
                      {downloadMode && (
                        <IconButton
                          size="small"
                          onClick={() => handleDownload(row.id)}
                          aria-label="Download"
                        >
                          <SaveAltIcon fontSize="small" />
                        </IconButton>
                      )}
                      {!downloadMode && !paused && row.id !== call?.id && row.id !== callPending && (
                        <IconButton
                          size="small"
                          onClick={() => handlePlay(row.id)}
                          aria-label="Play"
                        >
                          <PlayArrowIcon fontSize="small" />
                        </IconButton>
                      )}
                      {!downloadMode && row.id === callPending && (
                        <IconButton size="small" disabled aria-label="Loading">
                          <CachedIcon
                            fontSize="small"
                            sx={{
                              ...spinKeyframes,
                              animation: 'spin 1s linear infinite',
                            }}
                          />
                        </IconButton>
                      )}
                      {!downloadMode && row.id === call?.id && (
                        <IconButton
                          size="small"
                          onClick={handleStop}
                          aria-label="Stop"
                        >
                          <StopIcon fontSize="small" />
                        </IconButton>
                      )}
                    </>
                  )}
                </TableCell>

                {/* Date */}
                <TableCell
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row && (
                    <Tooltip title={formatDateFull(row.dateTime)}>
                      <span>{formatDateShort(row.dateTime)}</span>
                    </Tooltip>
                  )}
                </TableCell>

                {/* Time */}
                <TableCell
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row && (
                    <Tooltip title={formatTimeFull(row.dateTime, time12h)}>
                      <span>{formatTimeShort(row.dateTime, time12h)}</span>
                    </Tooltip>
                  )}
                </TableCell>

                {/* Duration */}
                <TableCell
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row != null && (
                    <span>{formatDuration(row.audioDuration)}</span>
                  )}
                </TableCell>

                {/* System */}
                <TableCell
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row && (
                    <span>{row.systemData?.label || row.system}</span>
                  )}
                </TableCell>

                {/* Talkgroup (with LED badge) */}
                <TableCell
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        overflow: 'hidden',
                      }}
                    >
                      <LedBadge
                        active={
                          !!livefeedMap[row.system]?.[row.talkgroup]?.active
                        }
                        onClick={() =>
                          toggleTalkgroupSubscription(
                            row.system,
                            row.talkgroup,
                          )
                        }
                      />
                      <Tooltip title={row.talkgroupData?.name || ''}>
                        <Box
                          component="span"
                          onClick={() =>
                            toggleTalkgroupSubscription(
                              row.system,
                              row.talkgroup,
                            )
                          }
                          sx={{
                            cursor: 'pointer',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            '&:hover': { textDecoration: 'underline' },
                          }}
                        >
                          {row.talkgroupData?.label || row.talkgroup}
                        </Box>
                      </Tooltip>
                    </Box>
                  )}
                </TableCell>

                {/* Units */}
                <TableCell
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row && (
                    <Tooltip title={formatSources(row)}>
                      <span>{formatSources(row)}</span>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Progress bar */}
      <LinearProgress
        variant={resultsPending ? 'query' : 'determinate'}
        value={resultsPending ? undefined : 0}
        sx={{ height: 2 }}
      />

      {/* Paginator row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
        }}
      >
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={downloadMode}
              onChange={(e) => onDownloadModeChange(e.target.checked)}
              color="primary"
            />
          }
          label={<SaveAltIcon fontSize="small" />}
          labelPlacement="start"
          sx={{ mr: 0 }}
        />
        <TablePagination
          component="div"
          count={totalCount}
          page={pageIndex}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[]}
          onPageChange={handlePageChange}
          showFirstButton
          showLastButton
          disabled={livefeedPlayback || resultsPending}
          sx={{
            '& .MuiTablePagination-toolbar': {
              minHeight: 48,
            },
          }}
        />
      </Box>
    </Card>
  );
}
