import { useCallback } from 'react';
import { Box, Button, IconButton, TextField, Typography } from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import type { Group } from '../../../types/admin';

interface Props {
  groups: Group[];
  onChange: (groups: Group[]) => void;
}

export default function GroupsConfig({ groups, onChange }: Props) {
  const sorted = [...groups].sort((a, b) =>
    (a.label ?? '').localeCompare(b.label ?? ''),
  );

  const add = useCallback(() => {
    const id = groups.reduce(
      (pv, cv) => (typeof cv._id === 'number' && cv._id >= pv ? cv._id + 1 : pv),
      0,
    );
    onChange([{ _id: id, label: '' }, ...groups]);
  }, [groups, onChange]);

  const remove = useCallback(
    (index: number) => {
      const item = sorted[index];
      onChange(groups.filter((g) => g !== item));
    },
    [groups, sorted, onChange],
  );

  const updateLabel = useCallback(
    (index: number, label: string) => {
      const item = sorted[index];
      if (!item) return;
      const origIdx = groups.indexOf(item);
      if (origIdx < 0) return;
      const next = [...groups];
      next[origIdx] = { ...next[origIdx], label };
      onChange(next);
    },
    [groups, sorted, onChange],
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="body2">
          All system talkgroups must be associated with a group, which is then used to
          toggle between active talkgroups.
        </Typography>
        <Button color="secondary" onClick={add} sx={{ whiteSpace: 'nowrap', ml: 2 }}>
          New group
        </Button>
      </Box>

      {sorted.map((group, i) => (
        <Box key={group._id ?? i} display="flex" alignItems="center" gap={1} mb={1}>
          <IconButton size="small" color="error" onClick={() => remove(i)}>
            <ClearIcon />
          </IconButton>
          <TextField
            size="small"
            fullWidth
            placeholder="Group"
            value={group.label ?? ''}
            onChange={(e) => updateLabel(i, e.target.value)}
            error={!group.label}
            helperText={!group.label ? 'Group is required' : undefined}
          />
        </Box>
      ))}
    </Box>
  );
}
