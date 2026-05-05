import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';
import LockIcon from '@mui/icons-material/Lock';
import { useAdminStore } from '../../stores/admin';
import type { UnitLabelHistoryEntry } from '../../stores/admin';
import { useScannerStore } from '../../stores/scanner';
import type { Call, CallSource } from '../../types/scanner';
import { formatSrcId } from './CallSource';
import UnitLabelHistoryDialog from './UnitLabelHistoryDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LabelerState {
  call: Call | undefined;
  source: CallSource | undefined;
}

export interface LabelerProps {
  /** The call and source currently being configured */
  state: LabelerState;
  /** Called to cancel / close the labeler */
  onCancel: () => void;
  /** Called to search for calls with this unit */
  onSearchUnit?: (systemId: number, unitId: number) => void;
}

// ---------------------------------------------------------------------------
// Overlay styling
// ---------------------------------------------------------------------------

// Non-modal: positioned at the bottom of the screen, no backdrop,
// allows interaction with the rest of the page.
const overlaySx: SxProps<Theme> = {
  position: 'fixed',
  bottom: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1300,
  pointerEvents: 'none',
  width: '100%',
  maxWidth: 480,
  px: 2,
  boxSizing: 'border-box',
};

const formBaseSx: SxProps<Theme> = {
  borderRadius: 1,
  boxShadow: 8,
  color: 'rgb(255, 255, 255)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  p: 3,
  position: 'relative',
  width: '100%',
  pointerEvents: 'auto',
  transition: 'background-color 0.3s, border-color 0.3s',
};

// Normal form style
const formNormalSx: SxProps<Theme> = {
  ...formBaseSx,
  bgcolor: 'rgb(50, 50, 50)',
};

// Warning style when admin password is needed
const formAuthSx: SxProps<Theme> = {
  ...formBaseSx,
  bgcolor: 'rgb(60, 45, 20)',
  border: '2px solid rgb(180, 120, 40)',
};

// ---------------------------------------------------------------------------
// Labeler component
// ---------------------------------------------------------------------------

export default function Labeler({ state, onCancel, onSearchUnit }: LabelerProps) {
  const { call, source } = state;
  const isOpen = call != null && source != null;

  const [label, setLabel] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const adminPasswordRef = useRef('');  // ref avoids stale-closure issues in callbacks
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [didClickDelete, setDidClickDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<UnitLabelHistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      setLabel(source?.label ?? '');
      setAdminPassword('');
      adminPasswordRef.current = '';
      setNeedsAuth(false);
      setAuthError('');
      setDidClickDelete(false);
      setIsLoading(false);
      setHistoryEntries([]);
      // Focus input after render
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isOpen, source?.label]);

  // Focus password field when auth mode activates
  useEffect(() => {
    if (needsAuth) {
      requestAnimationFrame(() => {
        passwordRef.current?.focus();
      });
    }
  }, [needsAuth]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (needsAuth) {
          // Escape in auth mode goes back to normal mode
          setNeedsAuth(false);
          setAuthError('');
          setAdminPassword('');
          adminPasswordRef.current = '';
        } else {
          onCancel();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, needsAuth, onCancel]);

  // Helper: ensure admin is authenticated, returns true if authed.
  // Reads password from ref (always current) to avoid stale-closure issues.
  const ensureAuth = useCallback(async (): Promise<boolean> => {
    const admin = useAdminStore.getState();
    if (admin.authenticated) return true;

    const pw = adminPasswordRef.current;
    if (pw) {
      const ok = await admin.login(pw);
      if (ok) {
        setNeedsAuth(false);
        setAuthError('');
        return true;
      } else {
        setAuthError('Invalid password');
        setAdminPassword('');
        adminPasswordRef.current = '';
        return false;
      }
    }

    // No password — show the auth prompt
    setNeedsAuth(true);
    return false;
  }, []);  // no deps needed — reads from ref + getState()

  // Helper: update local units index
  const updateLocalUnitLabel = useCallback((systemId: number, unitId: number, newLabel: string | undefined) => {
    const scannerState = useScannerStore.getState();
    const newIndex = { ...scannerState.unitsIndex };
    if (!newIndex[systemId]) newIndex[systemId] = {};
    if (newLabel !== undefined) {
      newIndex[systemId]![unitId] = newLabel;
    } else {
      delete newIndex[systemId]![unitId];
    }
    useScannerStore.setState({ unitsIndex: newIndex });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!call || !source?.src) return;

      // If label hasn't changed or is empty, just close
      if (label === '' || label === (source.label ?? '')) {
        onCancel();
        return;
      }

      setIsLoading(true);

      // Ensure admin auth first
      const authed = await ensureAuth();
      if (!authed) {
        setIsLoading(false);
        return;
      }

      // Optimistically mark pending (turns label teal everywhere immediately)
      // and update the local unitsIndex. If the save fails, roll both back.
      const scannerStore = useScannerStore.getState();
      scannerStore.markUnitLabelPending(call.system, source.src, label);
      updateLocalUnitLabel(call.system, source.src, label);

      // Close the Labeler immediately — the teal pending state gives the user
      // instant feedback, so there's no reason to block the UI on the network.
      onCancel();

      const ok = await useAdminStore.getState().setUnitLabel(call.system, source.src, label);
      setIsLoading(false);

      if (!ok) {
        // Roll back the optimistic change
        scannerStore.clearUnitLabelPending(call.system, source.src);
        updateLocalUnitLabel(
          call.system,
          source.src,
          source.label,  // original value before edit
        );
        // Re-surface auth problem if that's why it failed
        if (!useAdminStore.getState().authenticated) {
          setNeedsAuth(true);
        }
      }
      // On success: leave pending entry alone — it'll be cleared when the
      // server broadcasts the updated config (reconcilePendingUnitLabels).
    },
    [call, source, label, onCancel, ensureAuth, updateLocalUnitLabel],
  );

  const handleDelete = useCallback(async () => {
    if (!didClickDelete) {
      setDidClickDelete(true);
      return;
    }

    if (!call || !source?.src) return;

    setIsLoading(true);

    const authed = await ensureAuth();
    if (!authed) {
      setIsLoading(false);
      return;
    }

    const scannerStore = useScannerStore.getState();
    // Mark pending-delete (label = null → teal, but display the unit id)
    scannerStore.markUnitLabelPending(call.system, source.src, null);
    updateLocalUnitLabel(call.system, source.src, undefined);
    onCancel();

    const ok = await useAdminStore.getState().deleteUnitLabel(call.system, source.src);
    setIsLoading(false);

    if (!ok) {
      scannerStore.clearUnitLabelPending(call.system, source.src);
      updateLocalUnitLabel(call.system, source.src, source.label);
      if (!useAdminStore.getState().authenticated) {
        setNeedsAuth(true);
      }
    }
  }, [didClickDelete, call, source, onCancel, ensureAuth, updateLocalUnitLabel]);

  const handleSearchUnit = useCallback(() => {
    if (!call || !source?.src) return;
    onSearchUnit?.(call.system, source.src);
    onCancel();
  }, [call, source, onSearchUnit, onCancel]);

  const handleShowHistory = useCallback(async () => {
    if (!call || !source?.src) return;

    // History requires admin auth
    const authed = await ensureAuth();
    if (!authed) return;

    setIsLoading(true);
    const entries = await useAdminStore.getState().getUnitLabelHistory(call.system, source.src);
    setIsLoading(false);
    setHistoryEntries(entries);
    setHistoryOpen(true);
  }, [call, source, ensureAuth]);

  if (!isOpen) return null;

  const placeholder = `Unit label: ${formatSrcId(source?.src)}`;

  return (
    <>
      <Box sx={overlaySx}>
        <Box
          component="form"
          autoComplete="off"
          onSubmit={handleSubmit}
          sx={needsAuth ? formAuthSx : formNormalSx}
        >
          {/* Close button */}
          <IconButton
            onClick={onCancel}
            title="Close (discard changes)"
            aria-label="Close dialog"
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            <CloseIcon />
          </IconButton>

          {/* Admin password prompt (shown when auth is needed) */}
          {needsAuth && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LockIcon sx={{ color: 'rgb(220, 160, 50)', fontSize: 20 }} />
                <Typography variant="body2" sx={{ color: 'rgb(220, 160, 50)', fontWeight: 600 }}>
                  Admin password required
                </Typography>
              </Box>
              <TextField
                inputRef={passwordRef}
                type="password"
                value={adminPassword}
                onChange={(e) => { setAdminPassword(e.target.value); adminPasswordRef.current = e.target.value; setAuthError(''); }}
                placeholder="Enter admin password"
                autoComplete="current-password"
                variant="outlined"
                size="small"
                fullWidth
                error={!!authError}
                helperText={authError || undefined}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: 'rgb(255,255,255)',
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgb(180, 120, 40)',
                  },
                  '& .MuiFormHelperText-root': {
                    color: 'rgb(255, 100, 80)',
                  },
                }}
              />
            </Box>
          )}

          {/* Label input */}
          <TextField
            inputRef={inputRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            variant="outlined"
            size="small"
            fullWidth
            onFocus={(e) => e.target.select()}
            sx={{
              mt: needsAuth ? 0 : 1,
              '& .MuiOutlinedInput-root': {
                color: 'rgb(255,255,255)',
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(255,255,255,0.3)',
              },
            }}
          />

          {/* Action buttons */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <Button
              variant="text"
              size="small"
              disabled={isLoading}
              onClick={handleSearchUnit}
              startIcon={<SearchIcon />}
              sx={{ color: 'rgba(255,255,255,0.8)' }}
            >
              Search Calls
            </Button>

            <Button
              variant="text"
              size="small"
              disabled={isLoading}
              onClick={handleShowHistory}
              startIcon={<HistoryIcon />}
              sx={{ color: 'rgba(255,255,255,0.8)' }}
            >
              Label History
            </Button>

            <Button
              variant="text"
              size="small"
              color="error"
              disabled={source?.label == null || isLoading}
              onClick={handleDelete}
            >
              {!didClickDelete ? 'Delete' : 'Really?'}
            </Button>

            {isLoading && <CircularProgress size={20} sx={{ ml: 'auto' }} />}
          </Box>
        </Box>
      </Box>

      {/* Label history dialog */}
      <UnitLabelHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        systemId={call?.system}
        unitId={source?.src}
        history={historyEntries}
      />
    </>
  );
}
