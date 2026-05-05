import { useCallback, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  IconButton,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { AccessSystems, AdminSystem, ApiKey, Group, Tag } from '../../../types/admin';
import SystemsSelectDialog from './SystemsSelectDialog';

function uuid(): string {
  let dt = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (dt + Math.random() * 16) % 16 | 0;
    dt = Math.floor(dt / 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface Props {
  apiKeys: ApiKey[];
  systems: AdminSystem[];
  groups: Group[];
  tags: Tag[];
  onChange: (apiKeys: ApiKey[]) => void;
}

export default function ApiKeysConfig({ apiKeys, systems, groups, tags, onChange }: Props) {
  const [selectOpen, setSelectOpen] = useState(false);
  const [selectIndex, setSelectIndex] = useState<number | null>(null);

  const sorted = [...apiKeys].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const add = useCallback(() => {
    onChange([{ key: uuid(), ident: '', systems: '*', order: 0 }, ...apiKeys]);
  }, [apiKeys, onChange]);

  const remove = useCallback(
    (index: number) => {
      const item = sorted[index];
      if (!item) return;
      onChange(apiKeys.filter((a) => a !== item));
    },
    [apiKeys, sorted, onChange],
  );

  const updateItem = useCallback(
    (index: number, patch: Partial<ApiKey>) => {
      const item = sorted[index];
      if (!item) return;
      const origIdx = apiKeys.indexOf(item);
      if (origIdx < 0) return;
      const next = [...apiKeys];
      next[origIdx] = { ...next[origIdx], ...patch };
      onChange(next);
    },
    [apiKeys, sorted, onChange],
  );

  const copyKey = useCallback((key: string) => {
    navigator.clipboard?.writeText(key);
  }, []);

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
          API keys are used for recorder upload scripts and downstream instances. Each
          must authenticate with an API key to exchange audio files.
        </Typography>
        <Button color="secondary" onClick={add} sx={{ whiteSpace: 'nowrap', ml: 2 }}>
          New API key
        </Button>
      </Box>

      {sorted.length === 0 && (
        <Typography variant="body2" align="center" color="text.secondary">
          No defined API keys
        </Typography>
      )}

      {sorted.map((item, i) => (
        <Accordion key={item._id ?? i} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <DragIndicatorIcon sx={{ mr: 1, color: 'text.secondary' }} />
            <Typography>{item.ident || 'NewApiKey'}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box display="flex" flexDirection="column" gap={2}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body2">Disabled</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Disable the API key.
                  </Typography>
                </Box>
                <Switch
                  checked={item.disabled ?? false}
                  onChange={(e) => updateItem(i, { disabled: e.target.checked })}
                />
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body2">Key</Typography>
                  <Typography variant="caption" color="text.secondary">
                    API key.
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                  <TextField
                    size="small"
                    placeholder="Key"
                    value={item.key ?? ''}
                    onChange={(e) => updateItem(i, { key: e.target.value })}
                  />
                  <IconButton
                    size="small"
                    onClick={() => copyKey(item.key ?? '')}
                  >
                    <ContentCopyIcon />
                  </IconButton>
                </Box>
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body2">Ident</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Dummy identifier for this API key.
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
                  <Typography variant="body2">Access</Typography>
                  <Typography variant="caption" color="text.secondary">
                    This API key allows access to{' '}
                    <u>{item.systems === '*' ? 'all' : 'some'}</u> systems and
                    talkgroups.
                  </Typography>
                </Box>
                <Button onClick={() => openSelect(i)}>Choose systems</Button>
              </Box>

              <Box display="flex" justifyContent="flex-start">
                <Button color="error" onClick={() => remove(i)}>
                  Delete API key
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
