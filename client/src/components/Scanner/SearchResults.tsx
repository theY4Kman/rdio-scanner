import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Card,
  Checkbox,
  FormControlLabel,
  IconButton,
  LinearProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
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
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import type { Call, CallSource as CallSourceType, Config, LivefeedMap, PlaybackList } from '../../types/scanner';
import { LivefeedMode } from '../../types/scanner';
import { useScannerStore } from '../../stores/scanner';
import UnitLabel from '../UnitLabel';

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
  playAll: boolean;
  onDownloadModeChange: (mode: boolean) => void;
  onPlayAllChange: (mode: boolean) => void;
  onPageChange: (page: number) => void;
  onEditUnit?: (call: Call, source: CallSourceType) => void;
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
// Truncated tooltip — only shows when text is actually clipped
// ---------------------------------------------------------------------------

function TruncatedTooltip({ title, children }: { title: string; children: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const childRef = useRef<HTMLElement>(null);

  const handleMouseEnter = useCallback(() => {
    const el = childRef.current;
    if (el && el.scrollWidth > el.clientWidth) {
      setOpen(true);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Tooltip
      title={title}
      open={open}
      onClose={handleMouseLeave}
      disableHoverListener
      enterDelay={500}
      enterNextDelay={300}
    >
      <span
        ref={childRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {children}
      </span>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Column visibility -- persisted to localStorage
// ---------------------------------------------------------------------------

type ColumnId = 'date' | 'time' | 'duration' | 'system' | 'talkgroup' | 'units';

interface ColumnDef {
  id: ColumnId;
  label: string;
  alwaysVisible?: boolean;  // can't be hidden
}

const COLUMN_DEFS: ColumnDef[] = [
  { id: 'date', label: 'Date' },
  { id: 'time', label: 'Time', alwaysVisible: true },
  { id: 'duration', label: 'Duration' },
  { id: 'system', label: 'System' },
  { id: 'talkgroup', label: 'Talkgroup' },
  { id: 'units', label: 'Unit(s)', alwaysVisible: true },
];

const COLUMN_STORAGE_KEY = 'rdio-scanner-react-search-columns';

function loadHiddenColumns(): Set<ColumnId> {
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((c): c is ColumnId =>
      COLUMN_DEFS.some((def) => def.id === c && !def.alwaysVisible),
    ));
  } catch {
    return new Set();
  }
}

function saveHiddenColumns(hidden: Set<ColumnId>) {
  try {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify([...hidden]));
  } catch {
    // ignore quota / disabled storage
  }
}

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
  playAll,
  onDownloadModeChange,
  onPlayAllChange,
  onPageChange,
  onEditUnit,
}: SearchResultsProps) {
  void paused;  // no longer used locally -- search-queue play bypasses pause
  const loadAndDownload = useScannerStore((s) => s.loadAndDownload);
  const stopPlaybackMode = useScannerStore((s) => s.stopPlaybackMode);
  const skip = useScannerStore((s) => s.skip);
  const avoid = useScannerStore((s) => s.avoid);
  const playFromSearch = useScannerStore((s) => s.playFromSearch);
  const searchQueueActive = useScannerStore((s) => s.searchQueue.active);
  const searchQueueCurrentId = useScannerStore((s) => s.searchQueue.currentCallId);

  // Column visibility -------------------------------------------------------
  const [hiddenColumns, setHiddenColumns] = useState<Set<ColumnId>>(() => loadHiddenColumns());
  const [colMenuAnchor, setColMenuAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    saveHiddenColumns(hiddenColumns);
  }, [hiddenColumns]);

  const toggleColumn = useCallback((id: ColumnId) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isColVisible = useCallback(
    (id: ColumnId) => !hiddenColumns.has(id),
    [hiddenColumns],
  );

  // Memoize to avoid re-renders of child rows when parent re-renders
  const colVisible = useMemo(() => ({
    date: isColVisible('date'),
    time: isColVisible('time'),
    duration: isColVisible('duration'),
    system: isColVisible('system'),
    talkgroup: isColVisible('talkgroup'),
    units: isColVisible('units'),
  }), [isColVisible]);

  // Build the Play-All queue that follows a just-selected call: every call
  // in the current playbackList whose dateTime is strictly newer than the
  // anchor call, in chronological order (oldest-newer first → newest-newer
  // last). This is independent of the user's sort direction so Play All
  // always moves forward in time regardless of how results are displayed.
  const buildLaterCallIds = useCallback(
    (anchorId: number): number[] => {
      const list = playbackList?.results ?? [];
      const anchor = list.find((c) => c?.id === anchorId);
      if (!anchor) return [];
      const anchorTime = new Date(anchor.dateTime).getTime();
      return list
        .filter((c) => c && new Date(c.dateTime).getTime() > anchorTime)
        .sort(
          (a, b) =>
            new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime(),
        )
        .map((c) => c.id);
    },
    [playbackList],
  );

  // When the user toggles "Play All" while a search queue is active:
  //   - ON   → refill queuedCallIds with calls newer than currentCallId
  //   - OFF  → drop queuedCallIds (active call keeps playing, then exits)
  const handlePlayAllToggle = useCallback(
    (next: boolean) => {
      onPlayAllChange(next);
      if (!searchQueueActive) return;

      if (next && searchQueueCurrentId != null) {
        const laterIds = buildLaterCallIds(searchQueueCurrentId);
        useScannerStore.setState((s) => ({
          searchQueue: { ...s.searchQueue, playAll: true, queuedCallIds: laterIds },
        }));
      } else {
        useScannerStore.setState((s) => ({
          searchQueue: { ...s.searchQueue, playAll: false, queuedCallIds: [] },
        }));
      }
    },
    [onPlayAllChange, searchQueueActive, searchQueueCurrentId, buildLaterCallIds],
  );

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
      // Play-All queue: calls chronologically newer than the clicked one,
      // oldest-first so playback moves forward in time. Independent of the
      // user's current sort choice (descending results still play forward).
      const laterCallIds = buildLaterCallIds(id);
      playFromSearch(id, playAll && !downloadMode, laterCallIds);
    },
    [playFromSearch, buildLaterCallIds, playAll, downloadMode],
  );

  const handleDownload = useCallback(
    (id: number) => {
      loadAndDownload(id);
    },
    [loadAndDownload],
  );

  const handleStop = useCallback(() => {
    if (searchQueueActive) {
      // Stop button during search playback -- exit the entire queue.
      useScannerStore.getState().exitSearchQueue();
    } else if (livefeedPlayback) {
      stopPlaybackMode();
    } else {
      skip();
    }
  }, [searchQueueActive, livefeedPlayback, stopPlaybackMode, skip]);

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

  const timeColWidth = time12h ? 42 : 42;

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
        <Table size="small" sx={{
            tableLayout: 'fixed',
            '& .MuiTableCell-root': {
              px: 0.5,
              py: 0.5,
              '&:first-of-type': { pl: 1 },
            },
          }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 48, p: 0.5 }} />
              {colVisible.date && <TableCell sx={{ width: 45, p: 0 }}>Date</TableCell>}
              {colVisible.time && <TableCell sx={{ width: timeColWidth, p: 0 }}>Time</TableCell>}
              {colVisible.duration && <TableCell sx={{ width: 60, p: 0 }}>Duration</TableCell>}
              {colVisible.system && <TableCell sx={{ width: '12%' }}>System</TableCell>}
              {colVisible.talkgroup && <TableCell sx={{ width: '15%' }}>Talkgroup</TableCell>}
              {colVisible.units && <TableCell>Unit(s)</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {results.map((row, idx) => (
              <TableRow
                key={row?.id ?? `empty-${idx}`}
                sx={{
                  height: 36,
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
                      {!downloadMode && row.id !== call?.id && row.id !== callPending && (
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
                {colVisible.date && (
                  <TableCell
                    sx={{
                      p: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row && (
                      <Tooltip title={formatDateFull(row.dateTime)} enterDelay={200} enterNextDelay={100}>
                        <span>{formatDateShort(row.dateTime)}</span>
                      </Tooltip>
                    )}
                  </TableCell>
                )}

                {/* Time */}
                {colVisible.time && (
                  <TableCell
                    sx={{
                      p: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row && (
                      <Tooltip title={formatTimeFull(row.dateTime, time12h)} enterDelay={200} enterNextDelay={100}>
                        <span>{formatTimeShort(row.dateTime, time12h)}</span>
                      </Tooltip>
                    )}
                  </TableCell>
                )}

                {/* Duration */}
                {colVisible.duration && (
                  <TableCell
                    sx={{
                      p: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row != null && (
                      <span>{formatDuration(row.audioDuration)}</span>
                    )}
                  </TableCell>
                )}

                {/* System */}
                {colVisible.system && (
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
                )}

                {/* Talkgroup (with LED badge) */}
                {colVisible.talkgroup && (
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
                      <TruncatedTooltip title={row.talkgroupData?.name || ''}>
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
                      </TruncatedTooltip>
                    </Box>
                  )}
                </TableCell>
                )}

                {/* Units */}
                {colVisible.units && (
                <TableCell
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row && (
                    <span
                      style={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.sources?.length
                        ? row.sources.map((source, srcIdx) => (
                            <span key={srcIdx}>
                              {srcIdx > 0 && ', '}
                              <UnitLabel
                                call={row}
                                source={source}
                                onEdit={onEditUnit}
                              />
                            </span>
                          ))
                        : formatSources(row)}
                    </span>
                  )}
                </TableCell>
                )}
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
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title={playAll ? 'Play All: queue subsequent results' : 'Play All: off (play single call)'}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={playAll && !downloadMode}
                  onChange={(e) => handlePlayAllToggle(e.target.checked)}
                  color="primary"
                  disabled={downloadMode}
                />
              }
              label={<PlayArrowIcon fontSize="small" sx={{ opacity: downloadMode ? 0.3 : 1 }} />}
              labelPlacement="start"
              sx={{ mr: 1 }}
            />
          </Tooltip>
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
          <Tooltip title="Show / hide columns">
            <IconButton
              size="small"
              onClick={(e) => setColMenuAnchor(e.currentTarget)}
              aria-label="Columns"
              sx={{ ml: 1 }}
            >
              <ViewColumnIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={colMenuAnchor}
            open={!!colMenuAnchor}
            onClose={() => setColMenuAnchor(null)}
            slotProps={{
              paper: { sx: { minWidth: 160 } },
            }}
          >
            {COLUMN_DEFS.map((def) => (
              <MenuItem
                key={def.id}
                onClick={() => !def.alwaysVisible && toggleColumn(def.id)}
                disabled={def.alwaysVisible}
                dense
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <Checkbox
                    size="small"
                    checked={colVisible[def.id]}
                    disabled={def.alwaysVisible}
                    sx={{ p: 0 }}
                    tabIndex={-1}
                  />
                </ListItemIcon>
                <ListItemText primary={def.label} />
              </MenuItem>
            ))}
          </Menu>
        </Box>
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
