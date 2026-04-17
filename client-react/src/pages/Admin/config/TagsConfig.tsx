import { useCallback } from 'react';
import { Box, Button, IconButton, TextField, Typography } from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import type { Tag } from '../../../types/admin';

interface Props {
  tags: Tag[];
  onChange: (tags: Tag[]) => void;
}

export default function TagsConfig({ tags, onChange }: Props) {
  const sorted = [...tags].sort((a, b) =>
    (a.label ?? '').localeCompare(b.label ?? ''),
  );

  const add = useCallback(() => {
    const id = tags.reduce(
      (pv, cv) => (typeof cv._id === 'number' && cv._id >= pv ? cv._id + 1 : pv),
      0,
    );
    onChange([{ _id: id, label: '' }, ...tags]);
  }, [tags, onChange]);

  const remove = useCallback(
    (index: number) => {
      const item = sorted[index];
      onChange(tags.filter((t) => t !== item));
    },
    [tags, sorted, onChange],
  );

  const updateLabel = useCallback(
    (index: number, label: string) => {
      const item = sorted[index];
      if (!item) return;
      const origIdx = tags.indexOf(item);
      if (origIdx < 0) return;
      const next = [...tags];
      next[origIdx] = { ...next[origIdx], label };
      onChange(next);
    },
    [tags, sorted, onChange],
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="body2">
          All system talkgroups must be associated with a tag, which is then used to
          search for calls based on their tag.
        </Typography>
        <Button color="secondary" onClick={add} sx={{ whiteSpace: 'nowrap', ml: 2 }}>
          New tag
        </Button>
      </Box>

      {sorted.map((tag, i) => (
        <Box key={tag._id ?? i} display="flex" alignItems="center" gap={1} mb={1}>
          <IconButton size="small" color="error" onClick={() => remove(i)}>
            <ClearIcon />
          </IconButton>
          <TextField
            size="small"
            fullWidth
            placeholder="Tag"
            value={tag.label ?? ''}
            onChange={(e) => updateLabel(i, e.target.value)}
            error={!tag.label}
            helperText={!tag.label ? 'Tag is required' : undefined}
          />
        </Box>
      ))}
    </Box>
  );
}
