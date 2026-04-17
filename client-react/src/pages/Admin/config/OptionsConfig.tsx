import { useCallback } from 'react';
import { Box, MenuItem, Switch, TextField, Typography } from '@mui/material';
import type { AdminOptions } from '../../../types/admin';

interface Props {
  options: AdminOptions;
  onChange: (options: AdminOptions) => void;
}

interface OptionRow {
  key: keyof AdminOptions;
  label: string;
  caption: string;
  type: 'switch' | 'text' | 'number' | 'textarea' | 'select';
  selectOptions?: { value: string | number; label: string }[];
  min?: number;
}

const rows: OptionRow[] = [
  {
    key: 'time12hFormat',
    label: '12-Hour Time Format',
    caption: 'Display time stamp in 12-hour format.',
    type: 'switch',
  },
  {
    key: 'afsSystems',
    label: 'AFS Systems',
    caption:
      'A comma separated list of system Ids where talkgroup Ids should be displayed in AFS format.',
    type: 'textarea',
  },
  {
    key: 'audioConversion',
    label: 'Audio Conversion',
    caption: 'Convert incoming audio files to H.264 m4a with ffmpeg.',
    type: 'select',
    selectOptions: [
      { value: 0, label: 'Disabled' },
      { value: 1, label: 'Enabled without normalization' },
      { value: 2, label: 'Enabled with normalization' },
      { value: 3, label: 'Enabled with loud normalization' },
    ],
  },
  {
    key: 'autoPopulate',
    label: 'Auto Populate',
    caption:
      'Globally allows the automatic creation of unconfigured systems and talkgroups.',
    type: 'switch',
  },
  {
    key: 'branding',
    label: 'Branding Label',
    caption:
      'A simple line of text displayed above the main screen to help identify the Rdio Scanner instance.',
    type: 'text',
  },
  {
    key: 'dimmerDelay',
    label: 'Dimmer Delay',
    caption:
      'Delay in milliseconds before turning off the screen backlight when inactive.',
    type: 'number',
    min: 0,
  },
  {
    key: 'disableDuplicateDetection',
    label: 'Disable Duplicate Call Detection',
    caption: 'Disable duplicate audio file detection.',
    type: 'switch',
  },
  {
    key: 'duplicateDetectionTimeFrame',
    label: 'Duplicate Call Detection Time Frame',
    caption:
      'New incoming calls will be rejected if a call already exists in the database with a start time of +/- this delay in milliseconds.',
    type: 'number',
    min: 0,
  },
  {
    key: 'keypadBeeps',
    label: 'Keypad Beep Style',
    caption: 'Provide audio feedback when pressing buttons.',
    type: 'select',
    selectOptions: [
      { value: 'uniden', label: 'Uniden' },
      { value: 'whistler', label: 'Whistler' },
    ],
  },
  {
    key: 'maxClients',
    label: 'Max Clients',
    caption: 'Max number of simultaneous clients.',
    type: 'number',
    min: 1,
  },
  {
    key: 'playbackGoesLive',
    label: 'Playback Mode Goes Live',
    caption:
      'Playback mode changes to live stream mode when the search list is exhausted.',
    type: 'switch',
  },
  {
    key: 'pruneDays',
    label: 'Prune Days',
    caption:
      'Prune the database for data older than the specified number of days. Set to 0 to disable.',
    type: 'number',
    min: 0,
  },
  {
    key: 'searchPatchedTalkgroups',
    label: 'Search Patched Talkgroups',
    caption:
      'Search for patched talkgroups when using the search panel. Be aware this has a negative impact on search response time.',
    type: 'switch',
  },
  {
    key: 'showListenersCount',
    label: 'Show Listeners Count',
    caption: 'Show listeners count on main screen.',
    type: 'switch',
  },
  {
    key: 'sortTalkgroups',
    label: 'Sort Talkgroups',
    caption: 'Automatically sort talkgroups by their id.',
    type: 'switch',
  },
  {
    key: 'tagsToggle',
    label: 'Toggle By Tags',
    caption: 'Allow toggling talkgroups by their tag.',
    type: 'switch',
  },
];

export default function OptionsConfig({ options, onChange }: Props) {
  const update = useCallback(
    (key: keyof AdminOptions, value: unknown) => {
      onChange({ ...options, [key]: value });
    },
    [options, onChange],
  );

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      {rows.map((row) => (
        <Box
          key={row.key}
          display="flex"
          justifyContent="space-between"
          alignItems="center"
        >
          <Box flex={1} mr={2}>
            <Typography variant="body2">{row.label}</Typography>
            <Typography variant="caption" color="text.secondary">
              {row.caption}
            </Typography>
          </Box>
          <Box>
            {row.type === 'switch' && (
              <Switch
                checked={!!(options[row.key] as boolean)}
                onChange={(e) => update(row.key, e.target.checked)}
              />
            )}
            {row.type === 'text' && (
              <TextField
                size="small"
                value={(options[row.key] as string) ?? ''}
                onChange={(e) => update(row.key, e.target.value)}
              />
            )}
            {row.type === 'textarea' && (
              <TextField
                size="small"
                multiline
                minRows={1}
                maxRows={3}
                value={(options[row.key] as string) ?? ''}
                onChange={(e) => update(row.key, e.target.value)}
              />
            )}
            {row.type === 'number' && (
              <TextField
                type="number"
                size="small"
                value={options[row.key] ?? ''}
                onChange={(e) =>
                  update(row.key, e.target.value ? Number(e.target.value) : undefined)
                }
                slotProps={{ htmlInput: { min: row.min ?? 0, step: 1 } }}
              />
            )}
            {row.type === 'select' && (
              <TextField
                select
                size="small"
                value={options[row.key] ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  const num = Number(v);
                  update(row.key, isNaN(num) ? v : num);
                }}
                sx={{ minWidth: 180 }}
              >
                {row.selectOptions?.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
