import { useCallback, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  MenuItem,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  IconButton,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DescriptionIcon from '@mui/icons-material/Description';
import PasswordIcon from '@mui/icons-material/Password';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import ClearIcon from '@mui/icons-material/Clear';
import { useAdminStore } from '../../stores/admin';
import type { AdminConfig, AdminSystem } from '../../types/admin';

interface Props {
  onConfig: (config: AdminConfig) => void;
}

// ---------------------------------------------------------------------------
// Import Talkgroups sub-component
// ---------------------------------------------------------------------------

const TG_FIELDS: [number, number, number, number, number][] = [
  // [id, label, description, tag, group]
  [0, 3, 4, 5, 6], // trunk-recorder
  [0, 2, 4, 5, 6], // radioreference.com
];

function ImportTalkgroups({ onConfig }: { onConfig: (config: AdminConfig) => void }) {
  const getConfig = useAdminStore((s) => s.getConfig);
  const [csv, setCsv] = useState<string[][]>([]);
  const [mode, setMode] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (inputRef.current) inputRef.current.value = '';
      if (typeof reader.result !== 'string') return;
      const parsed = reader.result
        .split(/\n|\r\n/)
        .map((line) => line.replace(/^"|"$/g, '').split(/"*,"*/))
        .filter((row): row is string[] => row != null && row.length > 0 && /^[0-9]+$/.test(row[0] ?? ''))
        .filter((row, idx, arr) => arr.findIndex((a) => a[0] === row[0]) === idx);
      setCsv(parsed);
    };
    reader.readAsBinaryString(file);
  }, []);

  const doImport = useCallback(async () => {
    const config = await getConfig();
    if (!config.groups) config.groups = [];
    if (!config.tags) config.tags = [];
    if (!config.systems) config.systems = [];

    const f = TG_FIELDS[mode]!;

    csv.forEach((tg) => {
      const groupLabel = tg[f[4]] ?? '';
      if (!config.groups!.find((g) => g.label === groupLabel)) {
        const id = config.groups!.reduce(
          (pv, cv) => (typeof cv._id === 'number' && cv._id >= pv ? cv._id + 1 : pv),
          1,
        );
        config.groups!.push({ _id: id, label: groupLabel });
      }

      const tagLabel = tg[f[3]] ?? '';
      if (!config.tags!.find((t) => t.label === tagLabel)) {
        const id = config.tags!.reduce(
          (pv, cv) => (typeof cv._id === 'number' && cv._id >= pv ? cv._id + 1 : pv),
          1,
        );
        config.tags!.push({ _id: id, label: tagLabel });
      }
    });

    const talkgroups = csv.map((row, idx) => ({
      id: +(row[f[0]] ?? '0'),
      label: row[f[1]] ?? '',
      name: row[f[2]] ?? '',
      order: idx + 1,
      tagId: config.tags!.find((t) => t.label === (row[f[3]] ?? ''))?._id,
      groupId: config.groups!.find((g) => g.label === (row[f[4]] ?? ''))?._id,
    }));

    config.systems!.unshift({ talkgroups });
    setCsv([]);
    onConfig(config);
  }, [csv, mode, getConfig, onConfig]);

  const removeRow = useCallback(
    (index: number) => setCsv((prev) => prev.filter((_, i) => i !== index)),
    [],
  );

  return (
    <Box>
      <Typography variant="body2" gutterBottom>
        Step 1: Read the CSV file
      </Typography>
      <Box textAlign="center" mb={2}>
        {csv.length === 0 ? (
          <>
            <Button variant="outlined" onClick={() => inputRef.current?.click()}>
              Read the CSV file
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={readFile}
            />
          </>
        ) : (
          <Button variant="outlined" onClick={() => setCsv([])}>
            Reset
          </Button>
        )}
      </Box>

      <Typography variant="body2" gutterBottom>
        Step 2: Select CSV style
      </Typography>
      <Box textAlign="center" mb={2}>
        <RadioGroup row value={mode} onChange={(e) => setMode(Number(e.target.value))}>
          <FormControlLabel value={0} control={<Radio />} label="Trunk Recorder" />
          <FormControlLabel value={1} control={<Radio />} label="Radio Reference" />
        </RadioGroup>
      </Box>

      <Typography variant="body2" gutterBottom>
        Step 3: Review talkgroups to import
      </Typography>
      {csv.length > 0 ? (
        <TableContainer sx={{ maxHeight: 300, mb: 2 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Id</TableCell>
                <TableCell>Label</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Tag</TableCell>
                <TableCell>Group</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {csv.map((row, ri) => {
                const ff = TG_FIELDS[mode]!;
                return (
                  <TableRow key={ri}>
                    <TableCell>{row[ff[0]]}</TableCell>
                    <TableCell>{row[ff[1]]}</TableCell>
                    <TableCell>{row[ff[2]]}</TableCell>
                    <TableCell>{row[ff[3]]}</TableCell>
                    <TableCell>{row[ff[4]]}</TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => removeRow(ri)}>
                        <ClearIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography variant="body2" align="center" color="text.secondary" mb={2}>
          No CSV data yet
        </Typography>
      )}

      <Typography variant="body2" gutterBottom>
        Step 4: Import to configuration
      </Typography>
      <Box textAlign="center" mb={1}>
        <Button variant="outlined" disabled={!csv.length} onClick={doImport}>
          Import to configuration
        </Button>
      </Box>
      {csv.length > 800 && (
        <Typography variant="caption" color="error" align="center" display="block">
          Warning: importing {csv.length} talkgroups. The UI may be slow.
        </Typography>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Import Units sub-component
// ---------------------------------------------------------------------------

function ImportUnits({ onConfig }: { onConfig: (config: AdminConfig) => void }) {
  const getConfig = useAdminStore((s) => s.getConfig);
  const [csv, setCsv] = useState<string[][]>([]);
  const [baseConfig, setBaseConfig] = useState<AdminConfig | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<AdminSystem | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  const loadConfig = useCallback(async () => {
    const cfg = await getConfig();
    setBaseConfig(cfg);
    if (cfg.systems?.length) setSelectedSystem(cfg.systems[0]);
  }, [getConfig]);

  // Load on first render
  useState(() => {
    loadConfig();
  });

  const readFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (inputRef.current) inputRef.current.value = '';
      if (typeof reader.result !== 'string') return;
      const parsed = reader.result
        .split(/\n|\r\n/)
        .map((line) => line.replace(/^"|"$/g, '').split(/"*,"*/))
        .filter((row): row is string[] => row != null && row.length > 0 && /^[0-9]+$/.test(row[0] ?? ''))
        .filter((row, idx, arr) => arr.findIndex((a) => a[0] === row[0]) === idx);
      setCsv(parsed);
    };
    reader.readAsBinaryString(file);
  }, []);

  const doImport = useCallback(() => {
    if (!selectedSystem || !baseConfig) return;
    const units = csv.map((row, idx) => ({
      id: +(row[0] ?? '0'),
      label: row[1] ?? '',
      order: idx + 1,
    }));
    const updatedSystem = { ...selectedSystem, units: [...(selectedSystem.units ?? []), ...units] };
    const updatedConfig = {
      ...baseConfig,
      systems: baseConfig.systems?.map((s) => (s === selectedSystem ? updatedSystem : s)),
    };
    setCsv([]);
    onConfig(updatedConfig);
  }, [csv, selectedSystem, baseConfig, onConfig]);

  const removeRow = useCallback(
    (index: number) => setCsv((prev) => prev.filter((_, i) => i !== index)),
    [],
  );

  return (
    <Box>
      <Typography variant="body2" gutterBottom>
        Step 1: Read the CSV file
      </Typography>
      <Box textAlign="center" mb={2}>
        {csv.length === 0 ? (
          <>
            <Button variant="outlined" onClick={() => inputRef.current?.click()}>
              Read the CSV file
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={readFile}
            />
          </>
        ) : (
          <Button variant="outlined" onClick={() => setCsv([])}>
            Reset
          </Button>
        )}
      </Box>

      <Typography variant="body2" gutterBottom>
        Step 2: Select system
      </Typography>
      <Box textAlign="center" mb={2}>
        <TextField
          select
          size="small"
          value={selectedSystem?.id ?? ''}
          onChange={(e) => {
            const sys = baseConfig?.systems?.find(
              (s) => s.id === Number(e.target.value),
            );
            setSelectedSystem(sys);
          }}
          sx={{ minWidth: 200 }}
        >
          {(baseConfig?.systems ?? []).map((sys) => (
            <MenuItem key={sys.id} value={sys.id}>
              {sys.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Typography variant="body2" gutterBottom>
        Step 3: Review units to import
      </Typography>
      {csv.length > 0 ? (
        <TableContainer sx={{ maxHeight: 300, mb: 2 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Id</TableCell>
                <TableCell>Label</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {csv.map((row, ri) => (
                <TableRow key={ri}>
                  <TableCell>{row[0]}</TableCell>
                  <TableCell>{row[1]}</TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => removeRow(ri)}>
                      <ClearIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography variant="body2" align="center" color="text.secondary" mb={2}>
          No CSV data yet
        </Typography>
      )}

      <Typography variant="body2" gutterBottom>
        Step 4: Import to configuration
      </Typography>
      <Box textAlign="center" mb={1}>
        <Button
          variant="outlined"
          disabled={!csv.length || !selectedSystem}
          onClick={doImport}
        >
          Import to configuration
        </Button>
      </Box>
      {csv.length > 1000 && (
        <Typography variant="caption" color="error" align="center" display="block">
          Warning: importing {csv.length} units. The UI may be slow.
        </Typography>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Password change sub-component
// ---------------------------------------------------------------------------

function PasswordChange() {
  const changePassword = useAdminStore((s) => s.changePassword);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<{ message: string; severity: 'success' | 'error' } | null>(
    null,
  );

  const valid =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === verifyPassword;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSnack({ message: 'Password changed successfully', severity: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setVerifyPassword('');
    } catch {
      setSnack({ message: 'Unable to change password', severity: 'error' });
    }
    setSaving(false);
  }, [changePassword, currentPassword, newPassword]);

  const handleReset = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setVerifyPassword('');
  }, []);

  return (
    <Box>
      <Typography variant="body2" mb={2}>
        Change the administrator password which gives access to the server
        administration dashboard.
      </Typography>

      <TextField
        type="password"
        label="Current password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        fullWidth
        required
        disabled={saving}
        sx={{ mb: 2 }}
        error={currentPassword.length === 0 && currentPassword !== ''}
        helperText={
          currentPassword.length === 0 && currentPassword !== ''
            ? 'Current password is required'
            : undefined
        }
      />

      <TextField
        type="password"
        label="New password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        fullWidth
        required
        disabled={saving}
        sx={{ mb: 2 }}
        error={newPassword.length > 0 && newPassword.length < 8}
        helperText={
          newPassword.length > 0 && newPassword.length < 8
            ? 'Password is too short'
            : undefined
        }
      />

      <TextField
        type="password"
        label="Verify new password"
        value={verifyPassword}
        onChange={(e) => setVerifyPassword(e.target.value)}
        fullWidth
        required
        disabled={saving}
        sx={{ mb: 2 }}
        error={verifyPassword.length > 0 && verifyPassword !== newPassword}
        helperText={
          verifyPassword.length > 0 && verifyPassword !== newPassword
            ? "Passwords don't match"
            : undefined
        }
      />

      <Box display="flex" justifyContent="flex-end" gap={1}>
        <Button
          variant="outlined"
          disabled={saving}
          onClick={handleReset}
        >
          Reset
        </Button>
        <Button
          variant="contained"
          disabled={saving || !valid}
          onClick={handleSave}
        >
          Save
        </Button>
      </Box>

      <Snackbar
        open={snack !== null}
        autoHideDuration={5000}
        onClose={() => setSnack(null)}
      >
        {snack ? (
          <Alert
            onClose={() => setSnack(null)}
            severity={snack.severity}
            sx={{ width: '100%' }}
          >
            {snack.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Import/Export config sub-component
// ---------------------------------------------------------------------------

function ImportExportConfig({ onConfig }: { onConfig: (config: AdminConfig) => void }) {
  const getConfig = useAdminStore((s) => s.getConfig);
  const inputRef = useRef<HTMLInputElement>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    const config = await getConfig();
    const jsonStr = JSON.stringify(config, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rdio-scanner.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [getConfig]);

  const handleImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        if (inputRef.current) inputRef.current.value = '';
        try {
          const text =
            typeof reader.result === 'string'
              ? reader.result
              : new TextDecoder().decode(reader.result as ArrayBuffer);
          const config = JSON.parse(text) as AdminConfig;
          onConfig(config);
        } catch (err) {
          setSnack(String(err));
        }
      };
      reader.readAsText(file);
    },
    [onConfig],
  );

  return (
    <Box>
      <Box mb={2}>
        <Typography variant="body2">Import</Typography>
        <Typography variant="caption" color="text.secondary">
          Import a JSON file into the configuration panel where you can then review it
          before submitting it.
        </Typography>
        <Box mt={1}>
          <Button variant="outlined" onClick={() => inputRef.current?.click()}>
            Import
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
        </Box>
      </Box>

      <Box>
        <Typography variant="body2">Export</Typography>
        <Typography variant="caption" color="text.secondary">
          Export the configuration to a JSON file.
        </Typography>
        <Box mt={1}>
          <Button variant="outlined" onClick={handleExport}>
            Export
          </Button>
        </Box>
      </Box>

      <Snackbar
        open={snack !== null}
        autoHideDuration={5000}
        onClose={() => setSnack(null)}
        message={snack}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main AdminTools component
// ---------------------------------------------------------------------------

export default function AdminTools({ onConfig }: Props) {
  return (
    <Box>
      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <DescriptionIcon sx={{ mr: 1 }} />
          <Typography>Import Talkgroups</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <ImportTalkgroups onConfig={onConfig} />
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <DescriptionIcon sx={{ mr: 1 }} />
          <Typography>Import Units</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <ImportUnits onConfig={onConfig} />
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <PasswordIcon sx={{ mr: 1 }} />
          <Typography>Admin Password</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <PasswordChange />
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <SyncAltIcon sx={{ mr: 1 }} />
          <Typography>Import/Export Config</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <ImportExportConfig onConfig={onConfig} />
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
