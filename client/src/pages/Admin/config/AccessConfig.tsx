import { useCallback, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import type { Access, AccessSystems, AdminSystem, Group, Tag } from '../../../types/admin';
import SystemsSelectDialog from './SystemsSelectDialog';

interface Props {
  access: Access[];
  systems: AdminSystem[];
  groups: Group[];
  tags: Tag[];
  onChange: (access: Access[]) => void;
}

export default function AccessConfig({ access, systems, groups, tags, onChange }: Props) {
  const [hideCode, setHideCode] = useState(true);
  const [selectOpen, setSelectOpen] = useState(false);
  const [selectIndex, setSelectIndex] = useState<number | null>(null);

  const sorted = [...access].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const add = useCallback(() => {
    const newAccess: Access = {
      code: '',
      ident: '',
      systems: '*',
      order: 0,
    };
    onChange([newAccess, ...access]);
  }, [access, onChange]);

  const remove = useCallback(
    (index: number) => {
      const item = sorted[index];
      if (!item) return;
      const next = [...access];
      const origIdx = access.indexOf(item);
      if (origIdx >= 0) next.splice(origIdx, 1);
      onChange(next);
    },
    [access, sorted, onChange],
  );

  const updateItem = useCallback(
    (index: number, patch: Partial<Access>) => {
      const item = sorted[index];
      if (!item) return;
      const origIdx = access.indexOf(item);
      if (origIdx < 0) return;
      const next = [...access];
      next[origIdx] = { ...next[origIdx], ...patch };
      onChange(next);
    },
    [access, sorted, onChange],
  );

  const openSelect = useCallback((index: number) => {
    setSelectIndex(index);
    setSelectOpen(true);
  }, []);

  const handleSelectClose = useCallback(
    (result: AccessSystems | null) => {
      setSelectOpen(false);
      if (result !== null && selectIndex !== null) {
        updateItem(selectIndex, { systems: result });
      }
      setSelectIndex(null);
    },
    [selectIndex, updateItem],
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="body2">
          You can decide to leave your instance unlocked and accessible to everyone, or
          set passwords with specific systems/talkgroups. When used, the user will be
          prompted once for their password.
        </Typography>
        <Button color="secondary" onClick={add} sx={{ whiteSpace: 'nowrap', ml: 2 }}>
          New access
        </Button>
      </Box>

      {sorted.length === 0 && (
        <Typography variant="body2" align="center" color="text.secondary">
          No access is defined, your instance is open and accessible to all
        </Typography>
      )}

      {sorted.map((item, i) => (
        <Accordion key={item._id ?? i} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <DragIndicatorIcon sx={{ mr: 1, color: 'text.secondary' }} />
            <Typography>{item.ident || 'NewAccess'}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box display="flex" flexDirection="column" gap={2}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body2">Code</Typography>
                  <Typography variant="caption" color="text.secondary">
                    The access code to unlock the client.
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                  <TextField
                    type={hideCode ? 'password' : 'text'}
                    size="small"
                    placeholder="Code"
                    value={item.code ?? ''}
                    onChange={(e) => updateItem(i, { code: e.target.value })}
                  />
                  <IconButton size="small" onClick={() => setHideCode(!hideCode)}>
                    {hideCode ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </Box>
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body2">Ident</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Dummy identifier for this access code.
                  </Typography>
                </Box>
                <TextField
                  size="small"
                  placeholder="Ident"
                  value={item.ident ?? ''}
                  onChange={(e) => updateItem(i, { ident: e.target.value })}
                />
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body2">Expiration</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Expiration date for this access code.
                  </Typography>
                </Box>
                <TextField
                  type="date"
                  size="small"
                  value={item.expiration ? String(item.expiration).slice(0, 10) : ''}
                  onChange={(e) =>
                    updateItem(i, { expiration: e.target.value || null })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body2">Limit</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Simultaneous connection limit.
                  </Typography>
                </Box>
                <TextField
                  type="number"
                  size="small"
                  placeholder="Limit"
                  value={item.limit ?? ''}
                  onChange={(e) =>
                    updateItem(i, {
                      limit: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  slotProps={{ htmlInput: { min: 0 } }}
                />
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body2">Access</Typography>
                  <Typography variant="caption" color="text.secondary">
                    This access code allows access to{' '}
                    <u>{item.systems === '*' ? 'all' : 'some'}</u> systems and
                    talkgroups.
                  </Typography>
                </Box>
                <Button onClick={() => openSelect(i)}>Choose systems</Button>
              </Box>

              <Box display="flex" justifyContent="flex-start">
                <Button color="error" onClick={() => remove(i)}>
                  Delete access
                </Button>
              </Box>
            </Box>
          </AccordionDetails>
        </Accordion>
      ))}

      <SystemsSelectDialog
        open={selectOpen}
        systems={systems}
        groups={groups}
        tags={tags}
        value={selectIndex !== null ? sorted[selectIndex]?.systems ?? '*' : '*'}
        onClose={handleSelectClose}
      />
    </Box>
  );
}
