import { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import type { SxProps, Theme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlineIcon from '@mui/icons-material/InfoOutlined';
import { useScannerStore } from '../../stores/scanner';
import {
  BeepStyle,
  CategoryStatus,
  type AvoidOptions,
  type Category,
  type Livefeed,
  type System,
  type Talkgroup,
  type Unit,
} from '../../types/scanner';
import { LED_COLORS, LED_COLOR_DEFAULT, LED_COLOR_OFF } from '../../utils/led-colors';

// ---------------------------------------------------------------------------
// Retro button base styling (shared with ControlButtons.tsx)
// ---------------------------------------------------------------------------

const buttonBaseSx: SxProps<Theme> = {
  '--def': 'rgb(45, 45, 45)',
  '--green': 'rgb(0, 230, 118)',
  '--red': 'rgb(255, 23, 68)',
  '--yellow': 'rgb(255, 234, 0)',
  background: 'var(--def)',
  borderStyle: 'solid',
  borderWidth: 1,
  borderBottomColor: 'rgba(0, 0, 0, 0.87)',
  borderLeftColor: 'rgba(255, 255, 255, 0.7)',
  borderRightColor: 'rgba(0, 0, 0, 0.87)',
  borderTopColor: 'rgba(255, 255, 255, 0.7)',
  color: 'rgb(250, 250, 250)',
  fontFamily: 'inherit',
  fontWeight: 500,
  fontSize: 12,
  height: 40,
  lineHeight: '18px',
  m: '2px',
  overflow: 'hidden',
  px: 1,
  py: '2px',
  position: 'relative',
  textOverflow: 'clip',
  textShadow: '0 0 4px rgb(0, 0, 0)',
  whiteSpace: 'normal',
  textTransform: 'uppercase',
  cursor: 'pointer',
  '&:active, &:focus': { outline: 0 },
  '&:active': {
    top: 2,
    transform: 'scale(0.98)',
    transformOrigin: 'bottom center',
  },
} as SxProps<Theme>;

// ---------------------------------------------------------------------------
// Blink keyframes (injected once via global style)
// ---------------------------------------------------------------------------

const blinkKeyframes = `
@keyframes select-blink-off {
  0%, 50% {
    background: rgb(45, 45, 45);
    box-shadow: 1px 1px 1px rgba(255,255,255,0.7) inset, 0 0 0 0 rgb(45, 45, 45);
  }
  50.01%, 100% {
    background: rgb(255, 23, 68);
    box-shadow: 1px 1px 1px rgba(255,255,255,0.7) inset, 0 0 3px 1px rgb(255, 23, 68);
  }
}
`;

// Inject keyframes once
if (typeof document !== 'undefined') {
  const id = 'select-panel-keyframes';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = blinkKeyframes;
    document.head.appendChild(style);
  }
}

// ---------------------------------------------------------------------------
// LED dot helpers
// ---------------------------------------------------------------------------

function ledDotSx(
  state: 'off' | 'on' | 'partial',
  blink: boolean,
): SxProps<Theme> {
  const colorVar =
    state === 'on'
      ? 'var(--green)'
      : state === 'partial'
        ? 'var(--yellow)'
        : 'var(--red)';

  const blinkAnimation = blink
    ? state === 'off'
      ? 'select-blink-off 500ms linear infinite'
      : undefined
    : undefined;

  return {
    '&::after': {
      content: '""',
      display: 'block',
      height: 6,
      position: 'absolute',
      right: 4,
      top: 4,
      width: 6,
      background: colorVar,
      boxShadow: `1px 1px 1px rgba(255,255,255,0.7) inset, 0 0 3px 1px ${colorVar}`,
      ...(blinkAnimation ? { animation: blinkAnimation } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// TalkgroupButton
// ---------------------------------------------------------------------------

interface TgButtonProps {
  system: System;
  talkgroup: Talkgroup;
  livefeed: Livefeed | undefined;
  onAvoid: (opts: AvoidOptions) => void;
}

function TgButton({ system, talkgroup, livefeed, onAvoid }: TgButtonProps) {
  const isActive = livefeed?.active ?? false;
  const hasTimer = !!livefeed?.minutes;
  const state: 'on' | 'off' = isActive ? 'on' : 'off';

  // LED color from TG or system config
  const ledColor = LED_COLORS[talkgroup.led ?? system.led ?? ''] ?? LED_COLOR_DEFAULT;

  // Background color: active = LED color, inactive = grey
  const bgColor = isActive ? ledColor : LED_COLOR_OFF;

  return (
    <Box
      component="button"
      type="button"
      title={talkgroup.label}
      onClick={() => onAvoid({ system, talkgroup })}
      sx={{
        ...buttonBaseSx,
        background: bgColor,
        width: {
          xs: 'calc(25% - 4px)',
          sm: 'calc(20% - 4px)',
          lg: 'calc(10% - 4px)',
        },
        ...ledDotSx(state, hasTimer),
      } as SxProps<Theme>}
    >
      {talkgroup.label}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// CategoryButton
// ---------------------------------------------------------------------------

interface CategoryButtonProps {
  category: Category;
  onToggle: (cat: Category) => void;
}

function CategoryButton({ category, onToggle }: CategoryButtonProps) {
  const state = category.status === CategoryStatus.On
    ? 'on'
    : category.status === CategoryStatus.Partial
      ? 'partial'
      : 'off';

  return (
    <Box
      component="button"
      type="button"
      title={category.label}
      onClick={() => onToggle(category)}
      sx={{
        ...buttonBaseSx,
        width: 'auto',
        flex: 1,
        minWidth: 80,
        ...ledDotSx(state, false),
      } as SxProps<Theme>}
    >
      {category.label}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// MiniButton (OFF / ON)
// ---------------------------------------------------------------------------

interface MiniButtonProps {
  label: string;
  variant: 'off' | 'on';
  onClick: () => void;
}

function MiniButton({ label, variant, onClick }: MiniButtonProps) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        ...buttonBaseSx,
        background: variant === 'off' ? 'rgb(100, 50, 50)' : 'rgb(50, 100, 50)',
        fontSize: 11,
        fontWeight: 700,
        height: 32,
        minWidth: 40,
        width: {
          xs: 'calc(12.5% - 4px)',
          sm: 'calc(10% - 4px)',
          lg: 'calc(5% - 4px)',
        },
        '&:first-of-type': {
          ml: 'auto',
        },
      } as SxProps<Theme>}
    >
      {label}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Fieldset wrapper
// ---------------------------------------------------------------------------

const fieldsetSx: SxProps<Theme> = {
  borderColor: 'rgba(255, 255, 255, 0.7)',
  color: 'rgba(255, 255, 255, 0.7)',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 400,
  lineHeight: '20px',
  p: '4px',
  mb: 1.5,
};

// ---------------------------------------------------------------------------
// Unit helpers
// ---------------------------------------------------------------------------

type SystemUnit = [System, Unit];

function buildAvailableUnits(systems: System[]): SystemUnit[] {
  return systems
    .flatMap((system) =>
      (system.units ?? []).map((unit): SystemUnit => [system, unit]),
    )
    .sort((a, b) => a[1].label.localeCompare(b[1].label));
}

function makeUnitKey(su: SystemUnit): string {
  return `${su[0].id}-${su[1].id}`;
}

// ---------------------------------------------------------------------------
// SelectPanel
// ---------------------------------------------------------------------------

export default function SelectPanel() {
  // Store subscriptions
  const config = useScannerStore((s) => s.config);
  const livefeedMap = useScannerStore((s) => s.livefeedMap);
  const livefeedUnitsMap = useScannerStore((s) => s.livefeedUnitsMap);
  const categories = useScannerStore((s) => s.categories);
  const avoid = useScannerStore((s) => s.avoid);
  const avoidUnit = useScannerStore((s) => s.avoidUnit);
  const toggleCategory = useScannerStore((s) => s.toggleCategory);
  const beep = useScannerStore((s) => s.beep);

  const systems = config.systems;
  // const tagsToggle = config.tagsToggle; // reserved for future use

  // Unit selection state
  const [selectedUnitKeys, setSelectedUnitKeys] = useState<string[]>([]);
  const [unitFilterText, setUnitFilterText] = useState('');

  // Build available + filtered units
  const availableUnits = useMemo(() => buildAvailableUnits(systems), [systems]);

  const filteredUnits = useMemo(() => {
    const filter = unitFilterText.toLowerCase().trim();
    if (!filter) return availableUnits;
    return availableUnits.filter(
      ([, unit]) =>
        unit.label.toLowerCase().includes(filter) ||
        unit.id.toString().includes(filter),
    );
  }, [availableUnits, unitFilterText]);

  // Map keys back to SystemUnit tuples for selected units
  const selectedUnitDetails = useMemo(() => {
    const keyMap = new Map(availableUnits.map((su) => [makeUnitKey(su), su]));
    return selectedUnitKeys
      .map((k) => keyMap.get(k))
      .filter((su): su is SystemUnit => su !== undefined);
  }, [selectedUnitKeys, availableUnits]);

  // ---- Handlers ----

  const handleAvoid = useCallback(
    (options: AvoidOptions) => {
      if (options.all === true) {
        beep(BeepStyle.Activate);
      } else if (options.all === false) {
        beep(BeepStyle.Deactivate);
      } else if (options.system !== undefined && options.talkgroup !== undefined) {
        const sysMap = livefeedMap[options.system.id];
        const lf = sysMap?.[options.talkgroup.id];
        beep(lf?.active ? BeepStyle.Deactivate : BeepStyle.Activate);
      } else {
        beep(options.status ? BeepStyle.Activate : BeepStyle.Deactivate);
      }
      avoid(options);
    },
    [avoid, beep, livefeedMap],
  );

  const handleToggleCategory = useCallback(
    (category: Category) => {
      beep(
        category.status === CategoryStatus.On
          ? BeepStyle.Deactivate
          : BeepStyle.Activate,
      );
      toggleCategory(category);
    },
    [beep, toggleCategory],
  );

  const handleUnitSelectionChange = useCallback(
    (event: SelectChangeEvent<string[]>) => {
      const val = event.target.value;
      setSelectedUnitKeys(typeof val === 'string' ? val.split(',') : val);
    },
    [],
  );

  const handleSelectAllUnits = useCallback(() => {
    const filteredKeys = new Set(filteredUnits.map(makeUnitKey));
    setSelectedUnitKeys((prev) => {
      const merged = new Set([...prev, ...filteredKeys]);
      return Array.from(merged);
    });
  }, [filteredUnits]);

  const handleDeselectAllUnits = useCallback(() => {
    const filteredKeys = new Set(filteredUnits.map(makeUnitKey));
    setSelectedUnitKeys((prev) => prev.filter((k) => !filteredKeys.has(k)));
  }, [filteredUnits]);

  const handleClearAllUnits = useCallback(() => {
    setSelectedUnitKeys([]);
    setUnitFilterText('');
  }, []);

  const handleRemoveUnit = useCallback((key: string) => {
    setSelectedUnitKeys((prev) => prev.filter((k) => k !== key));
  }, []);

  const handleToggleUnit = useCallback(
    (unitId: number) => {
      const isActive = livefeedUnitsMap[unitId];
      beep(isActive ? BeepStyle.Deactivate : BeepStyle.Activate);
      avoidUnit(unitId);
    },
    [avoidUnit, beep, livefeedUnitsMap],
  );

  // ---- Render ----

  const showCategories = categories.length >= 2;

  return (
    <Box
      sx={{
        boxSizing: 'border-box',
        display: 'block',
        p: 1,
        userSelect: 'none',
      }}
    >
      {/* Category toggle buttons */}
      {showCategories && (
        <Box component="fieldset" sx={fieldsetSx}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-evenly',
            }}
          >
            {categories.map((cat) => (
              <CategoryButton
                key={cat.label}
                category={cat}
                onToggle={handleToggleCategory}
              />
            ))}
            <MiniButton
              label="OFF"
              variant="off"
              onClick={() => handleAvoid({ all: false })}
            />
            <MiniButton
              label="ON"
              variant="on"
              onClick={() => handleAvoid({ all: true })}
            />
          </Box>
        </Box>
      )}

      {/* System fieldsets */}
      {systems.map((system) => {
        if (!system.talkgroups.length) return null;
        const sysMap = livefeedMap[system.id] ?? {};

        return (
          <Box key={system.id} component="fieldset" sx={fieldsetSx}>
            <legend>{system.label}</legend>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-evenly',
              }}
            >
              {system.talkgroups.map((tg) => (
                <TgButton
                  key={tg.id}
                  system={system}
                  talkgroup={tg}
                  livefeed={sysMap[tg.id]}
                  onAvoid={handleAvoid}
                />
              ))}
              {system.talkgroups.length > 1 && (
                <>
                  <MiniButton
                    label="OFF"
                    variant="off"
                    onClick={() => handleAvoid({ system, status: false })}
                  />
                  <MiniButton
                    label="ON"
                    variant="on"
                    onClick={() => handleAvoid({ system, status: true })}
                  />
                </>
              )}
            </Box>
          </Box>
        );
      })}

      {/* Empty state when no systems */}
      {systems.length === 0 && (
        <Typography sx={{ color: 'rgba(255,255,255,0.7)', p: 2 }}>
          No talkgroup configured!
        </Typography>
      )}

      {/* Units section */}
      <Box component="fieldset" sx={{ ...fieldsetSx, mt: 2 }}>
        <legend style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Units
          <Tooltip title="Subscribe to calls that include specific units" placement="right">
            <InfoOutlineIcon
              sx={{
                fontSize: 18,
                cursor: 'help',
                opacity: 0.7,
                '&:hover': { opacity: 1 },
              }}
            />
          </Tooltip>
        </legend>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 1 }}>
          {/* Search + dropdown row */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1.5,
              width: '100%',
            }}
          >
            {/* Search input */}
            <TextField
              label="Search units by name or ID..."
              variant="outlined"
              size="small"
              value={unitFilterText}
              onChange={(e) => setUnitFilterText(e.target.value)}
              autoComplete="off"
              sx={{ flex: 1, minWidth: 0 }}
              slotProps={{
                input: {
                  endAdornment: unitFilterText ? (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setUnitFilterText('')}
                        aria-label="Clear filter"
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />

            {/* Unit multi-select dropdown */}
            <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
              <InputLabel id="unit-select-label">Select units to monitor...</InputLabel>
              <Select
                labelId="unit-select-label"
                multiple
                value={selectedUnitKeys}
                onChange={handleUnitSelectionChange}
                input={<OutlinedInput label="Select units to monitor..." />}
                disabled={filteredUnits.length === 0}
                renderValue={(selected) => {
                  const count = selected.length;
                  if (count === 0) return 'No units selected';
                  if (count === 1) return '1 unit selected';
                  return `${count} units selected`;
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      maxHeight: 400,
                      bgcolor: 'rgb(50, 50, 50)',
                      color: 'rgb(255, 255, 255)',
                    },
                  },
                }}
              >
                {filteredUnits.map((su) => {
                  const key = makeUnitKey(su);
                  return (
                    <MenuItem key={key} value={key} dense>
                      <Checkbox
                        checked={selectedUnitKeys.includes(key)}
                        size="small"
                        sx={{ color: 'rgba(255,255,255,0.7)' }}
                      />
                      <ListItemText
                        primary={
                          <>
                            {systems.length > 1 && (
                              <Typography
                                component="span"
                                variant="caption"
                                sx={{ opacity: 0.6, mr: 0.5 }}
                              >
                                [{su[0].label}]
                              </Typography>
                            )}
                            {su[1].label}
                          </>
                        }
                      />
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          </Box>

          {/* Bulk action buttons */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant="contained"
              color="primary"
              size="small"
              disabled={filteredUnits.length === 0}
              onClick={handleSelectAllUnits}
            >
              Select All
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={filteredUnits.length === 0 || selectedUnitDetails.length === 0}
              onClick={handleDeselectAllUnits}
              sx={{ color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.3)' }}
            >
              Deselect All
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={selectedUnitDetails.length === 0}
              onClick={handleClearAllUnits}
              sx={{ color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.3)' }}
            >
              Clear All
            </Button>
          </Box>

          {/* Selected units LED buttons */}
          {selectedUnitDetails.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              {selectedUnitDetails.map((su) => {
                const key = makeUnitKey(su);
                const [system, unit] = su;
                const isActive = livefeedUnitsMap[unit.id] === true;
                const ledColor = LED_COLORS[system.led ?? ''] ?? LED_COLOR_DEFAULT;
                const bgColor = isActive ? ledColor : LED_COLOR_OFF;

                return (
                  <Box
                    key={key}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      position: 'relative',
                    }}
                  >
                    <Box
                      component="button"
                      type="button"
                      title={unit.label}
                      onClick={() => handleToggleUnit(unit.id)}
                      sx={{
                        ...buttonBaseSx,
                        background: bgColor,
                        width: 'auto',
                        minWidth: 80,
                        pr: 1.5,
                        ...ledDotSx(isActive ? 'on' : 'off', false),
                      } as SxProps<Theme>}
                    >
                      {unit.label}
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveUnit(key)}
                      title={`Remove ${unit.label}`}
                      sx={{
                        width: 24,
                        height: 24,
                        ml: -1,
                        color: 'rgba(255,255,255,0.7)',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Empty state */}
          {selectedUnitDetails.length === 0 && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 3,
                textAlign: 'center',
                color: 'rgba(255,255,255,0.6)',
                gap: 1.5,
              }}
            >
              <InfoOutlineIcon sx={{ fontSize: 48, opacity: 0.5 }} />
              <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                No units selected. Use the dropdown above to select units to monitor.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
