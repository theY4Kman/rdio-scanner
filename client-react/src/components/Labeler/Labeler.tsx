import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  TextField,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';
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

const overlaySx: SxProps<Theme> = {
  position: 'fixed',
  inset: 0,
  zIndex: 1300,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  bgcolor: 'rgba(0, 0, 0, 0.65)',
  backdropFilter: 'blur(2px)',
};

const formSx: SxProps<Theme> = {
  bgcolor: 'rgb(50, 50, 50)',
  borderRadius: 1,
  boxShadow: 8,
  color: 'rgb(255, 255, 255)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  maxWidth: 460,
  mx: 2,
  p: 3,
  position: 'relative',
  width: '100%',
};

// ---------------------------------------------------------------------------
// Labeler component
// ---------------------------------------------------------------------------

export default function Labeler({ state, onCancel, onSearchUnit }: LabelerProps) {
  const { call, source } = state;
  const isOpen = call != null && source != null;

  const [label, setLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [didClickDelete, setDidClickDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      setLabel(source?.label ?? '');
      setDidClickDelete(false);
      setIsLoading(false);
      // Focus input after render
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isOpen, source?.label]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onCancel]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!call || !source) return;

      // If label hasn't changed or is empty, just close
      if (label === '' || label === (source.label ?? '')) {
        onCancel();
        return;
      }

      // TODO: Phase 7 - integrate with admin API to actually set the label
      // For now, just close the form
      onCancel();
    },
    [call, source, label, onCancel],
  );

  const handleDelete = useCallback(() => {
    if (!didClickDelete) {
      setDidClickDelete(true);
      return;
    }

    // TODO: Phase 7 - integrate with admin API to delete the label
    // For now, just close the form
    onCancel();
  }, [didClickDelete, onCancel]);

  const handleSearchUnit = useCallback(() => {
    if (!call || !source?.src) return;
    onSearchUnit?.(call.system, source.src);
    onCancel();
  }, [call, source, onSearchUnit, onCancel]);

  const handleShowHistory = useCallback(() => {
    setHistoryOpen(true);
  }, []);

  if (!isOpen) return null;

  const placeholder = `Unit label: ${formatSrcId(source?.src)}`;

  return (
    <>
      <Box sx={overlaySx} onClick={onCancel}>
        <Box
          component="form"
          autoComplete="off"
          onSubmit={handleSubmit}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          sx={formSx}
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
              mt: 1,
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

      {/* Label history dialog (placeholder) */}
      <UnitLabelHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        systemId={call?.system}
        unitId={source?.src}
      />
    </>
  );
}
