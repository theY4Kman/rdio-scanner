import { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { useScannerStore } from '../../stores/scanner';
import { LivefeedMode } from '../../types/scanner';
import type { Call, PlaybackList } from '../../types/scanner';
import SearchForm, {
  buildSearchOptions,
  INITIAL_FORM_VALUES,
} from './SearchForm';
import type { SearchFormValues } from './SearchForm';
import SearchResults from './SearchResults';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;
const FETCH_LIMIT = 200;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchPanel() {
  // -------------------------------------------------------------------------
  // Store subscriptions
  // -------------------------------------------------------------------------

  const config = useScannerStore((s) => s.config);
  const playbackList = useScannerStore((s) => s.playbackList);
  const call = useScannerStore((s) => s.call);
  const playbackPending = useScannerStore((s) => s.playbackPending);
  const livefeedMode = useScannerStore((s) => s.livefeedMode);
  const livefeedMap = useScannerStore((s) => s.livefeedMap);
  const paused = useScannerStore((s) => s.paused);

  const searchCalls = useScannerStore((s) => s.searchCalls);
  const stopPlaybackMode = useScannerStore((s) => s.stopPlaybackMode);

  // -------------------------------------------------------------------------
  // Local state
  // -------------------------------------------------------------------------

  const [formValues, setFormValues] = useState<SearchFormValues>(INITIAL_FORM_VALUES);
  const [pageIndex, setPageIndex] = useState(0);
  const [resultsPending, setResultsPending] = useState(false);
  const [downloadMode, setDownloadMode] = useState(false);
  const [results, setResults] = useState<Array<Call | null>>(
    () => new Array(PAGE_SIZE).fill(null),
  );

  // Refs for offset tracking (avoid stale closures)
  const offsetRef = useRef(0);
  const callPendingRef = useRef<number | null>(null);

  const livefeedPlayback = livefeedMode === LivefeedMode.Playback;

  // -------------------------------------------------------------------------
  // Sync callPending ref
  // -------------------------------------------------------------------------

  useEffect(() => {
    callPendingRef.current = playbackPending;
  }, [playbackPending]);

  // -------------------------------------------------------------------------
  // When playbackList updates, refresh displayed results
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!playbackList) {
      setResults(new Array(PAGE_SIZE).fill(null));
      setResultsPending(false);
      return;
    }

    refreshResultsFromList(playbackList, pageIndex);
    setResultsPending(false);
  }, [playbackList]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // When call changes and there was a pending call, auto-navigate
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (call && callPendingRef.current) {
      const pendingId = callPendingRef.current;
      const idx = results.findIndex((r) => r?.id === pendingId);
      if (idx === -1) {
        // The pending call is not on the current page, navigate
        if (formValues.sort === -1) {
          setPageIndex((prev) => Math.max(0, prev - 1));
        } else {
          setPageIndex((prev) => prev + 1);
        }
      }
    }
  }, [call]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Refresh results slice from playback list
  // -------------------------------------------------------------------------

  const refreshResultsFromList = useCallback(
    (list: PlaybackList, page: number) => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const sliceStart = from % FETCH_LIMIT;
      const sliceEnd = (to % FETCH_LIMIT) + 1;
      const calls: Array<Call | null> = list.results.slice(sliceStart, sliceEnd);

      while (calls.length < PAGE_SIZE) {
        calls.push(null);
      }

      setResults(calls);
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Trigger a search
  // -------------------------------------------------------------------------

  const doSearch = useCallback(
    (vals: SearchFormValues, page: number) => {
      if (livefeedPlayback) return;

      const pageOffset = page * PAGE_SIZE;
      const newOffset =
        Math.floor(pageOffset / FETCH_LIMIT) * FETCH_LIMIT;
      offsetRef.current = newOffset;

      const options = buildSearchOptions(vals, config, newOffset, FETCH_LIMIT);
      setResultsPending(true);
      searchCalls(options);
    },
    [config, livefeedPlayback, searchCalls],
  );

  // -------------------------------------------------------------------------
  // Form change handler
  // -------------------------------------------------------------------------

  const handleFormChange = useCallback(
    (newValues: SearchFormValues) => {
      if (livefeedPlayback) {
        stopPlaybackMode();
      }

      setFormValues(newValues);
      setPageIndex(0);

      // Trigger search with new values on next tick so state is settled
      // Using setTimeout(0) to batch the state updates
      setTimeout(() => {
        doSearch(newValues, 0);
      }, 0);
    },
    [livefeedPlayback, stopPlaybackMode, doSearch],
  );

  // -------------------------------------------------------------------------
  // Reset handler
  // -------------------------------------------------------------------------

  const handleReset = useCallback(() => {
    const resetValues = { ...INITIAL_FORM_VALUES };

    if (livefeedPlayback) {
      stopPlaybackMode();
    }

    setFormValues(resetValues);
    setPageIndex(0);

    setTimeout(() => {
      doSearch(resetValues, 0);
    }, 0);
  }, [livefeedPlayback, stopPlaybackMode, doSearch]);

  // -------------------------------------------------------------------------
  // Page change handler
  // -------------------------------------------------------------------------

  const handlePageChange = useCallback(
    (newPage: number) => {
      setPageIndex(newPage);

      const from = newPage * PAGE_SIZE;

      // Check if we need to fetch a new batch
      if (
        !callPendingRef.current &&
        (from >= offsetRef.current + FETCH_LIMIT || from < offsetRef.current)
      ) {
        doSearch(formValues, newPage);
      } else if (playbackList) {
        refreshResultsFromList(playbackList, newPage);
      }
    },
    [doSearch, formValues, playbackList, refreshResultsFromList],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!config.systems.length) {
    return null;
  }

  return (
    <Box sx={{ p: 1, userSelect: 'none' }}>
      <SearchResults
        results={results}
        playbackList={playbackList}
        resultsPending={resultsPending}
        livefeedMode={livefeedMode}
        call={call}
        callPending={playbackPending}
        paused={paused}
        config={config}
        livefeedMap={livefeedMap}
        pageIndex={pageIndex}
        pageSize={PAGE_SIZE}
        downloadMode={downloadMode}
        onDownloadModeChange={setDownloadMode}
        onPageChange={handlePageChange}
      />

      <SearchForm
        config={config}
        playbackList={playbackList}
        values={formValues}
        disabled={resultsPending}
        onChange={handleFormChange}
        onReset={handleReset}
      />
    </Box>
  );
}
