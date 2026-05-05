import { useState } from 'react';
import { Box, Button, TextField, Typography, Paper, Alert } from '@mui/material';
import { useAdminStore } from '../../stores/admin';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const login = useAdminStore((s) => s.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError('');
    const ok = await login(password);
    if (!ok) {
      setError('Invalid password');
      setPassword('');
    }
    setSubmitting(false);
  };

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      height="100%"
      p={2}
    >
      <Paper sx={{ p: 4, maxWidth: 400, width: '100%' }}>
        <form onSubmit={handleSubmit}>
          <Typography variant="body1" mb={2}>
            Please enter the admin password to gain access to the administrative
            dashboard
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            required
            autoFocus
            disabled={submitting}
            sx={{ mb: 2 }}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={submitting || !password}
          >
            Login
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
