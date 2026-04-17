import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from 'react';
import {
  Box,
  Button,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  LinearProgress,
} from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';
import NotificationsIcon from '@mui/icons-material/Notifications';
import WarningIcon from '@mui/icons-material/Warning';
import { useAdminStore } from '../../stores/admin';
import type { Log, LogsQuery, LogsQueryOptions } from '../../types/admin';

export interface AdminLogsHandle {
  reload: () => void;
}

const PAGE_SIZE = 10;
const FETCH_LIMIT = 200;

const AdminLogs = forwardRef<AdminLogsHandle>(function AdminLogs(_, ref) {
  const getLogs = useAdminStore((s) => s.getLogs);

  const [logsQuery, setLogsQuery] = useState<LogsQuery | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [page, setPage] = useState(0);
  const [fetchOffset, setFetchOffset] = useState(0);

  // Filter form state
  const [sort, setSort] = useState<number>(-1);
  const [date, setDate] = useState<string>('');
  const [level, setLevel] = useState<string>('');

  const doReload = useCallback(
    async (
      overridePage?: number,
      overrideSort?: number,
      overrideDate?: string,
      overrideLevel?: string,
    ) => {
      const effectivePage = overridePage ?? page;
      const effectiveSort = overrideSort ?? sort;
      const effectiveDate = overrideDate ?? date;
      const effectiveLevel = overrideLevel ?? level;

      const newOffset =
        Math.floor((effectivePage * PAGE_SIZE) / FETCH_LIMIT) * FETCH_LIMIT;
      setFetchOffset(newOffset);

      const options: LogsQueryOptions = {
        limit: FETCH_LIMIT,
        offset: newOffset,
        sort: effectiveSort,
      };
      if (effectiveLevel) {
        options.level = effectiveLevel as LogsQueryOptions['level'];
      }
      if (effectiveDate) {
        options.date = effectiveDate;
      }

      setPending(true);
      const result = await getLogs(options);
      setLogsQuery(result);
      setPending(false);
    },
    [page, sort, date, level, getLogs],
  );

  useImperativeHandle(ref, () => ({ reload: () => doReload() }), [doReload]);

  // Derive the visible page of logs
  const visibleLogs: (Log | null)[] = (() => {
    if (!logsQuery) return Array(PAGE_SIZE).fill(null);
    const localIndex = (page * PAGE_SIZE) % FETCH_LIMIT;
    const slice = logsQuery.logs.slice(localIndex, localIndex + PAGE_SIZE);
    while (slice.length < PAGE_SIZE) slice.push(null as unknown as Log);
    return slice;
  })();

  const handlePageChange = useCallback(
    (_: unknown, newPage: number) => {
      setPage(newPage);
      const from = newPage * PAGE_SIZE;
      if (from >= fetchOffset + FETCH_LIMIT || from < fetchOffset) {
        doReload(newPage);
      }
    },
    [fetchOffset, doReload],
  );

  const handleFilterChange = useCallback(() => {
    setPage(0);
    doReload(0);
  }, [doReload]);

  const handleReset = useCallback(() => {
    setSort(-1);
    setDate('');
    setLevel('');
    setPage(0);
    doReload(0, -1, '', '');
  }, [doReload]);

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  const formatTime = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const levelIcon = (lvl: string | undefined) => {
    switch (lvl) {
      case 'error':
        return <ErrorIcon color="error" fontSize="small" />;
      case 'warn':
        return <WarningIcon color="warning" fontSize="small" />;
      case 'info':
        return <NotificationsIcon color="info" fontSize="small" />;
      default:
        return null;
    }
  };

  return (
    <Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={40}>Level</TableCell>
              <TableCell width={60}>Date</TableCell>
              <TableCell width={60}>Time</TableCell>
              <TableCell>Message</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleLogs.map((log, i) => (
              <TableRow key={i}>
                <TableCell>{log ? levelIcon(log.level) : null}</TableCell>
                <TableCell>{log ? formatDate(log.dateTime) : null}</TableCell>
                <TableCell>{log ? formatTime(log.dateTime) : null}</TableCell>
                <TableCell>{log?.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {pending && <LinearProgress />}

      <TablePagination
        component="div"
        count={logsQuery?.count ?? 0}
        page={page}
        rowsPerPage={PAGE_SIZE}
        rowsPerPageOptions={[PAGE_SIZE]}
        onPageChange={handlePageChange}
        disabled={pending}
        showFirstButton
        showLastButton
      />

      <Box display="flex" gap={2} mt={2} flexWrap="wrap" alignItems="center">
        <TextField
          select
          size="small"
          label="Sort order"
          value={sort}
          onChange={(e) => {
            setSort(Number(e.target.value));
            handleFilterChange();
          }}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value={1}>Ascending</MenuItem>
          <MenuItem value={-1}>Descending</MenuItem>
        </TextField>

        <TextField
          type="datetime-local"
          size="small"
          label="Date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            handleFilterChange();
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          select
          size="small"
          label="Level"
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            handleFilterChange();
          }}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="info">Informative</MenuItem>
          <MenuItem value="warn">Warning</MenuItem>
          <MenuItem value="error">Error</MenuItem>
        </TextField>

        <Box display="flex" gap={1}>
          <Button variant="outlined" disabled={pending} onClick={() => doReload()}>
            Reload
          </Button>
          <Button variant="outlined" disabled={pending} onClick={handleReset}>
            Reset
          </Button>
        </Box>
      </Box>
    </Box>
  );
});

export default AdminLogs;
