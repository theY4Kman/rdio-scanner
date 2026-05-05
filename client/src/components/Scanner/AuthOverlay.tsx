import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Paper, TextField } from '@mui/material';
import { useScannerStore } from '../../stores/scanner';

/**
 * PIN entry modal overlay.
 * Shows when `authRequired` is true in the store.
 * Displays error messages for expired/tooMany states.
 */
export function AuthOverlay() {
  const authRequired = useScannerStore((s) => s.authRequired);
  const authExpired = useScannerStore((s) => s.authExpired);
  const authTooMany = useScannerStore((s) => s.authTooMany);
  const authenticate = useScannerStore((s) => s.authenticate);

  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the password field when auth overlay becomes visible
  useEffect(() => {
    if (authRequired) {
      setPassword('');
      setSubmitting(false);
      // Small delay to allow the DOM to render before focusing
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [authRequired]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!password || submitting) return;
      setSubmitting(true);
      authenticate(password);
    },
    [password, submitting, authenticate],
  );

  // Determine error text
  let errorText = '';
  if (authExpired) {
    errorText = 'This unlock code has expired';
  } else if (authTooMany) {
    errorText = 'Too many connections';
  }

  if (!authRequired) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <Paper
        elevation={8}
        sx={{
          bgcolor: 'rgb(240, 240, 240)',
          borderRadius: '8px',
          p: '8px 32px',
        }}
      >
        <form autoComplete="off" onSubmit={handleSubmit}>
          <TextField
            inputRef={inputRef}
            type="password"
            autoComplete="off"
            placeholder="Unlock code"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            error={!!errorText}
            helperText={errorText || undefined}
            slotProps={{
              input: {
                sx: { textAlign: 'center' },
              },
            }}
            variant="standard"
            onBlur={() => inputRef.current?.focus()}
          />
        </form>
      </Paper>
    </Box>
  );
}
