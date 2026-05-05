import { useCallback } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { AdminSystem, DirWatch } from '../../../types/admin';

interface Props {
  dirWatch: DirWatch[];
  systems: AdminSystem[];
  onChange: (dirWatch: DirWatch[]) => void;
}

export default function DirWatchConfig({ dirWatch, systems, onChange }: Props) {
  const sorted = [...dirWatch].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const add = useCallback(() => {
    onChange([{ delay: 2000, deleteAfter: true, type: 'default', order: 0 }, ...dirWatch]);
  }, [dirWatch, onChange]);

  const remove = useCallback(
    (index: number) => {
      const item = sorted[index];
      onChange(dirWatch.filter((d) => d !== item));
    },
    [dirWatch, sorted, onChange],
  );

  const updateItem = useCallback(
    (index: number, patch: Partial<DirWatch>) => {
      const item = sorted[index];
      if (!item) return;
      const origIdx = dirWatch.indexOf(item);
      if (origIdx < 0) return;
      const next = [...dirWatch];
      next[origIdx] = { ...next[origIdx], ...patch };
      onChange(next);
    },
    [dirWatch, sorted, onChange],
  );

  const getTalkgroups = (systemId: number | null | undefined) => {
    if (systemId == null) return [];
    const sys = systems.find((s) => s.id === systemId);
    return sys?.talkgroups ?? [];
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="body2">
          Define a dirwatch to monitor new audio files from any directory.
        </Typography>
        <Button color="secondary" onClick={add} sx={{ whiteSpace: 'nowrap', ml: 2 }}>
          New dir watch
        </Button>
      </Box>

      {sorted.map((item, i) => {
        const typ = item.type ?? 'default';
        const showExtension = ['default', 'dsdplus', 'trunk-recorder'].includes(typ);
        const showSystemTg = ['default', 'dsdplus'].includes(typ);
        const showMask = typ === 'default';
        const showFrequency = typ === 'default';
        const showDelay = typ === 'default';

        return (
          <Accordion key={item._id ?? i} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <DragIndicatorIcon sx={{ mr: 1, color: 'text.secondary' }} />
              <Typography>{item.directory || 'NewDirWatch'}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box display="flex" flexDirection="column" gap={2}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="body2">Disabled</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Disable the dirwatch.
                    </Typography>
                  </Box>
                  <Switch
                    checked={item.disabled ?? false}
                    onChange={(e) => updateItem(i, { disabled: e.target.checked })}
                  />
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="body2">Delete After</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Delete the audio file after being ingested.
                    </Typography>
                  </Box>
                  <Switch
                    checked={item.deleteAfter ?? false}
                    onChange={(e) =>
                      updateItem(i, { deleteAfter: e.target.checked })
                    }
                  />
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="body2">Type</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Dirwatch type defines how the metadata are obtained.
                    </Typography>
                  </Box>
                  <TextField
                    select
                    size="small"
                    value={typ}
                    onChange={(e) => updateItem(i, { type: e.target.value })}
                    sx={{ minWidth: 180 }}
                  >
                    <MenuItem value="default">Default</MenuItem>
                    <MenuItem value="dsdplus">DSDPlus Fast Lane</MenuItem>
                    <MenuItem value="sdr-trunk">SDR Trunk</MenuItem>
                    <MenuItem value="trunk-recorder">Trunk Recorder</MenuItem>
                  </TextField>
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="body2">Directory</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Path of the directory to monitor for file ingestion.
                    </Typography>
                  </Box>
                  <TextField
                    size="small"
                    placeholder="Directory"
                    value={item.directory ?? ''}
                    onChange={(e) => updateItem(i, { directory: e.target.value })}
                  />
                </Box>

                {showExtension && (
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="body2">Extension</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Audio call extension without the period (e.g. "mp3", "wav").
                      </Typography>
                    </Box>
                    <TextField
                      size="small"
                      placeholder="Extension"
                      value={item.extension ?? ''}
                      onChange={(e) =>
                        updateItem(i, { extension: e.target.value })
                      }
                    />
                  </Box>
                )}

                {showSystemTg && (
                  <>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="body2">System</Typography>
                        <Typography variant="caption" color="text.secondary">
                          System to where the audio files should go.
                        </Typography>
                      </Box>
                      <TextField
                        select
                        size="small"
                        value={item.systemId ?? ''}
                        onChange={(e) =>
                          updateItem(i, {
                            systemId: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        sx={{ minWidth: 180 }}
                      >
                        <MenuItem value="">
                          <em>None</em>
                        </MenuItem>
                        {systems.map((sys) => (
                          <MenuItem key={sys.id} value={sys.id}>
                            {sys.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Box>

                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="body2">Talkgroup</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Talkgroup to where the audio files should go.
                        </Typography>
                      </Box>
                      <TextField
                        select
                        size="small"
                        value={item.talkgroupId ?? ''}
                        onChange={(e) =>
                          updateItem(i, {
                            talkgroupId: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                        sx={{ minWidth: 180 }}
                      >
                        <MenuItem value="">
                          <em>None</em>
                        </MenuItem>
                        {getTalkgroups(item.systemId).map((tg) => (
                          <MenuItem key={tg.id} value={tg.id}>
                            {tg.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Box>
                  </>
                )}

                {showMask && (
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="body2">Mask</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Metadata can be extracted from the file name using META tags
                        (#DATE, #SYS, #TG, #TIME, etc.).
                      </Typography>
                    </Box>
                    <TextField
                      size="small"
                      placeholder="Mask"
                      value={item.mask ?? ''}
                      onChange={(e) => updateItem(i, { mask: e.target.value })}
                    />
                  </Box>
                )}

                {showFrequency && (
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="body2">Frequency</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Fake frequency in hertz displayed on the main screen.
                      </Typography>
                    </Box>
                    <TextField
                      type="number"
                      size="small"
                      placeholder="Frequency"
                      value={item.frequency ?? ''}
                      onChange={(e) =>
                        updateItem(i, {
                          frequency: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      slotProps={{ htmlInput: { min: 0 } }}
                    />
                  </Box>
                )}

                {showDelay && (
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="body2">Delay</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Delay in milliseconds for the audio file to settle before
                        ingesting. Minimum 2000ms.
                      </Typography>
                    </Box>
                    <TextField
                      type="number"
                      size="small"
                      placeholder="Delay"
                      value={item.delay ?? 2000}
                      onChange={(e) =>
                        updateItem(i, {
                          delay: Math.max(2000, Number(e.target.value) || 2000),
                        })
                      }
                      slotProps={{ htmlInput: { min: 2000 } }}
                    />
                  </Box>
                )}

                <Box display="flex" justifyContent="flex-start">
                  <Button color="error" onClick={() => remove(i)}>
                    Delete dirwatch
                  </Button>
                </Box>
              </Box>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
