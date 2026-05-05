import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Drawer,
  IconButton,
  Toolbar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useHotkeys } from 'react-hotkeys-hook';
import { useScannerStore, getAudioTimeSnapshot, isSkipDelayActive } from '../../stores/scanner';
import { BeepStyle, LivefeedMode } from '../../types/scanner';
import type { Call, CallSource as CallSourceType } from '../../types/scanner';
import { installExtensionApi } from '../../services/extension';
import { MainDisplay } from './MainDisplay';
import Labeler, { type LabelerState } from '../Labeler/Labeler';
import SearchPanel from './SearchPanel';
import SelectPanel from './SelectPanel';

// ---------------------------------------------------------------------------
// Scanner -- the main shell component
// ---------------------------------------------------------------------------

export default function Scanner() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Replay-back logic (port of Angular's replayOffset + replayTimer).
  // First press = seek to beginning of current call.
  // Quick successive presses within 1s = walk back through call history.
  const replayOffsetRef = useRef(0);
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Labeler (unit label editing) state
  const [labelerState, setLabelerState] = useState<LabelerState>({ call: undefined, source: undefined });

  const openLabeler = useCallback((call: Call, source: CallSourceType) => {
    setLabelerState({ call, source });
  }, []);

  const closeLabeler = useCallback(() => {
    setLabelerState({ call: undefined, source: undefined });
  }, []);

  // ---------------------------------------------------------------------------
  // Lifecycle: initialize and destroy the scanner store
  // ---------------------------------------------------------------------------
  useEffect(() => {
    useScannerStore.getState().initialize();
    const teardownExt = installExtensionApi();
    return () => {
      teardownExt();
      useScannerStore.getState().destroy();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // beforeunload warning when live
  // ---------------------------------------------------------------------------
  const livefeedMode = useScannerStore((s) => s.livefeedMode);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (livefeedMode !== LivefeedMode.Offline) {
        e.preventDefault();
        e.returnValue = 'Live Feed is ON, do you really want to leave?';
      }
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [livefeedMode]);

  // ---------------------------------------------------------------------------
  // Fullscreen toggle on double-click
  // ---------------------------------------------------------------------------
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      containerRef.current?.requestFullscreen?.();
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Panel handlers
  // ---------------------------------------------------------------------------
  const handleOpenSearch = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const handleOpenSelect = useCallback(() => {
    setSelectOpen(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts (via react-hotkeys-hook)
  // ---------------------------------------------------------------------------
  const panelsOpen = searchOpen || selectOpen;
  const store = useScannerStore.getState;
  const authRequired = useScannerStore((s) => s.authRequired);

  // Space: Pause
  useHotkeys(
    'space',
    (e) => {
      e.preventDefault();
      if (authRequired) return;
      const s = store();
      s.beep(s.paused ? BeepStyle.Deactivate : BeepStyle.Activate);
      s.pause();
    },
    { enabled: !panelsOpen },
    [authRequired, panelsOpen],
  );

  // L: Toggle live feed
  useHotkeys(
    'l',
    () => {
      if (authRequired) return;
      const s = store();
      const isOffline = s.livefeedMode === LivefeedMode.Offline;
      s.beep(isOffline ? BeepStyle.Activate : BeepStyle.Deactivate);
      s.livefeed();
    },
    { enabled: !panelsOpen },
    [authRequired, panelsOpen],
  );

  // N or Right: Skip next (with delay)
  useHotkeys(
    'n, right',
    () => {
      if (authRequired) return;
      const s = store();
      s.beep(BeepStyle.Activate);
      s.skip({ delay: true });
    },
    { enabled: !panelsOpen },
    [authRequired, panelsOpen],
  );

  // Replay handler (shared by keyboard and button)
  const handleReplay = useCallback(() => {
    if (authRequired) return;
    const s = store();
    if (!s.paused && (s.call || s.callPrevious)) {
      s.beep(BeepStyle.Activate);

      // If there's an existing timer, bump the offset (quick successive press)
      if (replayTimerRef.current !== null) {
        clearTimeout(replayTimerRef.current);
        replayOffsetRef.current = Math.min(
          s.callHistory.length,
          replayOffsetRef.current + 1,
        );
      }

      // Reset the timer — offset resets after 1s of inactivity
      replayTimerRef.current = setTimeout(() => {
        replayTimerRef.current = null;
        replayOffsetRef.current = 0;
      }, 1000);

      const offset = replayOffsetRef.current;

      if (s.call && offset === 0) {
        // First press while playing: seek to beginning
        s.replay();
      } else if (offset > 0 && offset <= s.callHistory.length) {
        // Walk back through history (skipHistory prevents array rotation)
        const historyCall = s.callHistory[offset - 1];
        if (historyCall) {
          s.play(historyCall, { skipHistory: true });
        } else {
          s.replay();
        }
      } else {
        s.replay();
      }
    } else {
      s.beep(BeepStyle.Denied);
    }
  }, [authRequired, store]);

  // P or Left: Replay last
  useHotkeys(
    'p, left',
    () => handleReplay(),
    { enabled: !panelsOpen },
    [handleReplay, panelsOpen],
  );

  // Shift+N or Shift+Right: Skip to next source (unit) within the call
  useHotkeys(
    'shift+n, shift+right',
    () => {
      if (authRequired) return;
      const s = store();
      const call = s.call;
      // During the 1s inter-call delay, s.call is null (stopAudio clears it
      // before the timer). Mirror the Skip Next behavior: treat the press as
      // "advance now" and jump straight to the next call.
      if (!call && isSkipDelayActive()) {
        s.beep(BeepStyle.Activate);
        s.skip();
        return;
      }
      if (!call?.sources?.length) {
        // No sources — fall back to skip entire call (no delay)
        s.beep(s.call ? BeepStyle.Activate : BeepStyle.Denied);
        if (s.call) s.skip();
        return;
      }
      const time = getAudioTimeSnapshot();
      // Find current source index
      let idx = 0;
      for (let i = 0; i < call.sources.length; i++) {
        if ((call.sources[i]!.pos || 0) <= time) idx = i;
      }
      const next = call.sources[idx + 1];
      if (next && next.pos != null) {
        s.beep(BeepStyle.Activate);
        s.seek(next.pos);
      } else {
        // At last source — skip to next call
        s.beep(BeepStyle.Activate);
        s.skip();
      }
    },
    { enabled: !panelsOpen },
    [authRequired, panelsOpen],
  );

  // Shift+P or Shift+Left: Seek to previous source (unit) within the call
  useHotkeys(
    'shift+p, shift+left',
    () => {
      if (authRequired) return;
      const s = store();
      const call = s.call;
      if (!call?.sources?.length) {
        s.beep(BeepStyle.Denied);
        return;
      }
      const time = getAudioTimeSnapshot();
      // Find current source index
      let idx = 0;
      for (let i = 0; i < call.sources.length; i++) {
        if ((call.sources[i]!.pos || 0) <= time) idx = i;
      }
      // If we're more than 1s into the current source, seek to its start;
      // otherwise go to the previous source
      const currentPos = call.sources[idx]!.pos || 0;
      if (time - currentPos > 1) {
        s.beep(BeepStyle.Activate);
        s.seek(currentPos);
      } else if (idx > 0) {
        const prev = call.sources[idx - 1]!;
        s.beep(BeepStyle.Activate);
        s.seek(prev.pos || 0);
      } else {
        // At first source, seek to beginning
        s.beep(BeepStyle.Activate);
        s.seek(0);
      }
    },
    { enabled: !panelsOpen },
    [authRequired, panelsOpen],
  );

  // H then S: Hold system (uses key sequence)
  useHotkeys(
    'h s',
    () => {
      if (authRequired) return;
      const s = store();
      if (s.call || s.callPrevious) {
        s.beep(s.holdSys ? BeepStyle.Deactivate : BeepStyle.Activate);
        s.holdSystem();
      } else {
        s.beep(BeepStyle.Denied);
      }
    },
    { enabled: !panelsOpen },
    [authRequired, panelsOpen],
  );

  // H then G: Hold talkgroup
  useHotkeys(
    'h g',
    () => {
      if (authRequired) return;
      const s = store();
      if (s.call || s.callPrevious) {
        s.beep(s.holdTg ? BeepStyle.Deactivate : BeepStyle.Activate);
        s.holdTalkgroup();
      } else {
        s.beep(BeepStyle.Denied);
      }
    },
    { enabled: !panelsOpen },
    [authRequired, panelsOpen],
  );

  // A: Avoid
  useHotkeys(
    'a',
    () => {
      if (authRequired) return;
      const s = store();
      const activeCall = s.call || s.callPrevious;
      if (!activeCall) {
        s.beep(BeepStyle.Denied);
        return;
      }

      const avoided = s.isAvoided(activeCall);
      const minutes = s.isAvoidedTimer(activeCall);

      if (!avoided) {
        s.avoid({ status: false });
      } else if (!minutes) {
        s.avoid({ minutes: 30, status: false });
      } else if (minutes === 30) {
        s.avoid({ minutes: 60, status: false });
      } else if (minutes === 60) {
        s.avoid({ minutes: 120, status: false });
      } else {
        s.avoid({ status: true });
      }

      if (activeCall && s.isAvoided(activeCall)) {
        s.beep(BeepStyle.Activate);
      } else {
        s.beep(BeepStyle.Deactivate);
      }
    },
    { enabled: !panelsOpen },
    [authRequired, panelsOpen],
  );

  // /: Open search panel
  useHotkeys(
    '/',
    (e) => {
      e.preventDefault();
      if (authRequired) return;
      const s = store();
      if (!s.config) return;
      s.beep();
      handleOpenSearch();
    },
    { enabled: !panelsOpen },
    [authRequired, panelsOpen],
  );

  // S: Open select panel
  useHotkeys(
    's',
    () => {
      if (authRequired) return;
      const s = store();
      if (!s.config) return;
      s.beep();
      handleOpenSelect();
    },
    { enabled: !panelsOpen },
    [authRequired, panelsOpen],
  );

  // Escape: Close panels
  useHotkeys(
    'escape',
    () => {
      setSearchOpen(false);
      setSelectOpen(false);
    },
    { enableOnFormTags: true },
    [],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const bgColor = 'rgb(30, 30, 30)';

  return (
    <Box
      ref={containerRef}
      sx={{
        bgcolor: bgColor,
        color: 'rgb(255, 255, 255)',
        display: 'block',
        height: '100%',
        minWidth: 320,
        position: 'relative',
      }}
    >
      {/* Search side panel (left) */}
      <Drawer
        anchor="left"
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        variant="persistent"
        SlideProps={{ unmountOnExit: false }}
        sx={{
          '& .MuiDrawer-paper': {
            bgcolor: bgColor,
            color: 'inherit',
            width: '100%',
          },
        }}
      >
        <Box
          sx={{
            bgcolor: bgColor,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <Toolbar
            sx={{
              bgcolor: 'inherit',
              boxShadow: `0 4px 8px rgba(30, 30, 30, 0.8)`,
              color: 'currentColor',
              zIndex: 2,
              justifyContent: 'flex-end',
            }}
          >
            <IconButton
              color="inherit"
              onClick={() => setSearchOpen(false)}
            >
              <ArrowForwardIcon />
            </IconButton>
          </Toolbar>
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%' }}>
              <SearchPanel onEditUnit={openLabeler} />
            </Box>
          </Box>
        </Box>
      </Drawer>

      {/* Select side panel (right) */}
      <Drawer
        anchor="right"
        open={selectOpen}
        onClose={() => setSelectOpen(false)}
        variant="persistent"
        SlideProps={{ unmountOnExit: false }}
        sx={{
          '& .MuiDrawer-paper': {
            bgcolor: bgColor,
            color: 'inherit',
            width: '100%',
          },
        }}
      >
        <Box
          sx={{
            bgcolor: bgColor,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <Toolbar
            sx={{
              bgcolor: 'inherit',
              boxShadow: `0 4px 8px rgba(30, 30, 30, 0.8)`,
              color: 'currentColor',
              zIndex: 2,
            }}
          >
            <IconButton
              color="inherit"
              onClick={() => setSelectOpen(false)}
            >
              <ArrowBackIcon />
            </IconButton>
          </Toolbar>
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%' }}>
              <SelectPanel />
            </Box>
          </Box>
        </Box>
      </Drawer>

      {/* Main content */}
      <Box
        sx={{
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          height: '100%',
          overflow: 'auto',
        }}
      >
        <MainDisplay
          onOpenSearch={handleOpenSearch}
          onOpenSelect={handleOpenSelect}
          onReplay={handleReplay}
          onToggleFullscreen={toggleFullscreen}
          onEditUnit={openLabeler}
        />
      </Box>

      {/* Unit label editor overlay */}
      <Labeler
        state={labelerState}
        onCancel={closeLabeler}
        onSearchUnit={(_systemId, _unitId) => {
          closeLabeler();
          // TODO: open search panel pre-filtered by unit
        }}
      />
    </Box>
  );
}
