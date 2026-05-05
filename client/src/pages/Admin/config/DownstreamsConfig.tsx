import { useCallback, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { AccessSystems, AdminSystem, Downstream, Group, Tag } from '../../../types/admin';
import SystemsSelectDialog from './SystemsSelectDialog';

interface Props {
  downstreams: Downstream[];
  systems: AdminSystem[];
  groups: Group[];
  tags: Tag[];
  onChange: (downstreams: Downstream[]) => void;
}

export default function DownstreamsConfig({
  downstreams,
  systems,
  groups,
  tags,
  onChange,
}: Props) {
  const [selectOpen, setSelectOpen] = useState(false);
  const [selectIndex, setSelectIndex] = useState<number | null>(null);

  const sorted = [...downstreams].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const add = useCallback(() => {
    onChange([{ systems: '*', order: 0 }, ...downstreams]);
  }, [downstreams, onChange]);

  const remove = useCallback(
    (index: number) => {
      const item = sorted[index];
      if (!item) return;
      onChange(downstreams.filter((d) => d !== item));
    },
    [downstreams, sorted, onChange],
  );

  const updateItem = useCallback(
    (index: number, patch: Partial<Downstream>) => {
      const item = sorted[index];
      if (!item) return;
      const origIdx = downstreams.indexOf(item);
      if (origIdx < 0) return;
      const next = [...downstreams];
      next[origIdx] = { ...next[origIdx], ...patch };
      onChange(next);
    },
    [downstreams, sorted, onChange],
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
          Ingested audio calls can be sent downstream to other instances.
        </Typography>
        <Button color="secondary" onClick={add} sx={{ whiteSpace: 'nowrap', ml: 2 }}>
          New downstream
        </Button>
      </Box>

      {sorted.length === 0 && (
        <Typography variant="body2" align="center" color="text.secondary">
          No defined downstreams
        </Typography>
      )}

      {sorted.map((item, i) => (
        <Accordion key={item._id ?? i} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <DragIndicatorIcon sx={{ mr: 1, color: 'text.secondary' }} />
            <Typography>{item.url || 'NewDownstream'}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box display="flex" flexDirection="column" gap={2}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body2">Disabled</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Disable the downstream.
                  </Typography>
                </Box>
                <Switch
                  checked={item.disabled ?? false}
                  onChange={(e) => updateItem(i, { disabled: e.target.checked })}
                />
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body2">API Key</Typography>
                  <Typography variant="caption" color="text.secondary">
                    API key of the remote instance.
                  </Typography>
                </Box>
                <TextField
                  size="small"
                  placeholder="API key"
                  value={item.apiKey ?? ''}
                  onChange={(e) => updateItem(i, { apiKey: e.target.value })}
                />
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body2">URL</Typography>
                  <Typography variant="caption" color="text.secondary">
                    URL of the remote instance.
                  </Typography>
                </Box>
                <TextField
                  size="small"
                  placeholder="URL"
                  value={item.url ?? ''}
                  onChange={(e) => updateItem(i, { url: e.target.value })}
                />
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body2">Access</Typography>
                  <Typography variant="caption" color="text.secondary">
                    This downstream allows access to{' '}
                    <u>{item.systems === '*' ? 'all' : 'some'}</u> systems and
                    talkgroups.
                  </Typography>
                </Box>
                <Button onClick={() => openSelect(i)}>Choose systems</Button>
              </Box>

              <Box display="flex" justifyContent="flex-start">
                <Button color="error" onClick={() => remove(i)}>
                  Delete downstream
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
