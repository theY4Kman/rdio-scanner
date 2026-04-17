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
import { useScannerStore } from '../../stores/scanner';
import { BeepStyle, LivefeedMode } from '../../types/scanner';
import { MainDisplay } from './MainDisplay';
import SearchPanel from './SearchPanel';
import SelectPanel from './SelectPanel';

// ---------------------------------------------------------------------------
// Scanner -- the main shell component
// ---------------------------------------------------------------------------

export default function Scanner() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Lifecycle: initialize and destroy the scanner store
  // ---------------------------------------------------------------------------
  useEffect(() => {
    useScannerStore.getState().initialize();
    return () => {
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

  // N or Right: Skip next
  useHotkeys(
    'n, right',
    () => {
      if (authRequired) return;
      const s = store();
      s.beep(BeepStyle.Activate);
      s.skip();
    },
    { enabled: !panelsOpen },
    [authRequired, panelsOpen],
  );

  // P or Left: Replay last
  useHotkeys(
    'p, left',
    () => {
      if (authRequired) return;
      const s = store();
      if (!s.paused && (s.call || s.callPrevious)) {
        s.beep(BeepStyle.Activate);
        s.replay();
      } else {
        s.beep(BeepStyle.Denied);
      }
    },
    { enabled: !panelsOpen },
    [authRequired, panelsOpen],
  );

  // Shift+N or Shift+Right: Skip to next unit
  useHotkeys(
    'shift+n, shift+right',
    () => {
      if (authRequired) return;
      const s = store();
      s.beep(BeepStyle.Activate);
      s.skip();
    },
    { enabled: !panelsOpen },
    [authRequired, panelsOpen],
  );

  // Shift+P or Shift+Left: Replay previous unit
  useHotkeys(
    'shift+p, shift+left',
    () => {
      if (authRequired) return;
      const s = store();
      if (!s.paused && (s.call || s.callPrevious)) {
        s.beep(BeepStyle.Activate);
        s.replay();
      } else {
        s.beep(BeepStyle.Denied);
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
              <SearchPanel />
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
          onToggleFullscreen={toggleFullscreen}
        />
      </Box>
    </Box>
  );
}
