import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { formatSrcId } from './CallSource';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnitLabelHistoryEntry {
  createdAt: Date;
  label?: string;
}

export interface UnitLabelHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  systemId?: number;
  unitId?: number;
  history?: UnitLabelHistoryEntry[];
}

// ---------------------------------------------------------------------------
// UnitLabelHistoryDialog
// ---------------------------------------------------------------------------

export default function UnitLabelHistoryDialog({
  open,
  onClose,
  systemId,
  unitId,
  history = [],
}: UnitLabelHistoryDialogProps) {
  const formattedUnitId = formatSrcId(unitId);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'rgb(50, 50, 50)',
          color: 'rgb(255, 255, 255)',
          maxHeight: '80vh',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 6 }}>
        Unit Label History
        <IconButton
          onClick={onClose}
          title="Close"
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
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>Unit ID:</strong> {formattedUnitId || '(unknown)'}
          </Typography>
        </Box>

        {history.length === 0 ? (
          <Typography
            variant="body2"
            sx={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', py: 3 }}
          >
            {/* Placeholder message -- admin API not yet integrated */}
            No label history found for this unit.
            {systemId != null && (
              <>
                <br />
                (Admin API integration coming in Phase 7)
              </>
            )}
          </Typography>
        ) : (
          <List disablePadding>
            {history.map((entry, idx) => (
              <Box key={idx}>
                <ListItem disableGutters sx={{ py: 1 }}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                          {new Date(entry.createdAt).toLocaleString()}
                        </Typography>
                        <Typography variant="body2">
                          <strong>Label:</strong>{' '}
                          {entry.label ? (
                            entry.label
                          ) : (
                            <Typography
                              component="span"
                              variant="body2"
                              sx={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}
                            >
                              (deleted)
                            </Typography>
                          )}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
                {idx < history.length - 1 && (
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)' }} />
                )}
              </Box>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.7)' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
