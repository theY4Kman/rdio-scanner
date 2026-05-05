import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Card,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CancelIcon from '@mui/icons-material/Cancel';
import type { Config, System, Talkgroup, Unit } from '../../types/scanner';
import type { PlaybackList, SearchOptions } from '../../types/scanner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchFormValues {
  sort: number;
  date: string;
  system: number;
  talkgroup: number;
  units: number[];
  unitsMode: 'any' | 'all';
  group: number;
  tag: number;
}

export const INITIAL_FORM_VALUES: SearchFormValues = {
  sort: -1,
  date: '',
  system: -1,
  talkgroup: -1,
  units: [],
  unitsMode: 'any',
  group: -1,
  tag: -1,
};

interface SearchFormProps {
  config: Config;
  playbackList: PlaybackList | null;
  values: SearchFormValues;
  disabled: boolean;
  onChange: (values: SearchFormValues) => void;
  onReset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers to compute filtered options
// ---------------------------------------------------------------------------

function getSelectedGroup(
  optionsGroup: string[],
  groupIndex: number,
): string | undefined {
  return optionsGroup[groupIndex];
}

function getSelectedSystem(
  config: Config,
  optionsSystem: string[],
  systemIndex: number,
): System | undefined {
  const label = optionsSystem[systemIndex];
  return config.systems.find((s) => s.label === label);
}

function getSelectedTalkgroup(
  config: Config,
  optionsTalkgroup: [System, string][],
  optionsSystem: string[],
  talkgroupIndex: number,
  systemIndex: number,
): [System | undefined, Talkgroup | undefined] {
  const opt = optionsTalkgroup[talkgroupIndex];
  if (!opt) return [undefined, undefined];

  const [sys, tgLabel] = opt;
  const selectedSystem = getSelectedSystem(config, optionsSystem, systemIndex);
  const selectedSystems = selectedSystem ? [selectedSystem] : config.systems;

  if (!selectedSystems.find((s) => s.id === sys.id)) {
    return [undefined, undefined];
  }

  const tg = sys.talkgroups.find((t) => t.label === tgLabel);
  return tg ? [sys, tg] : [undefined, undefined];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchForm({
  config,
  playbackList,
  values,
  disabled,
  onChange,
  onReset,
}: SearchFormProps) {
  const [unitsFilterText, setUnitsFilterText] = useState('');
  const unitsFilterRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Computed filter options (same logic as Angular refreshFilters)
  // -------------------------------------------------------------------------

  const computed = useMemo(() => {
    const selectedGroup = getSelectedGroup(
      Object.keys(config.groups).sort((a, b) => a.localeCompare(b)),
      values.group,
    );
    const allSystemLabels = config.systems.map((s) => s.label);
    const selectedSystem = config.systems.find(
      (s) => s.label === allSystemLabels[values.system],
    );
    const selectedSystems = selectedSystem ? [selectedSystem] : config.systems;

    // We need a preliminary computation of optionsTag so we can use selectedTag
    // for filtering optionsSystem, etc. Use the full tag list first.
    const allTags = Object.keys(config.tags).sort((a, b) => a.localeCompare(b));
    const selectedTag = allTags[values.tag];

    // optionsSystem: filtered by selected group and tag
    const optionsSystem = config.systems
      .filter((sys) => {
        const groupOk =
          selectedGroup === undefined ||
          sys.talkgroups.some((tg) => tg.group === selectedGroup);
        const tagOk =
          selectedTag === undefined ||
          sys.talkgroups.some((tg) => tg.tag === selectedTag);
        return groupOk && tagOk;
      })
      .map((s) => s.label);

    // optionsTalkgroup
    const optionsTalkgroup: [System, string][] = selectedSystems
      .flatMap((sys) =>
        sys.talkgroups.map(
          (tg) => [sys, tg] as [System, Talkgroup],
        ),
      )
      .filter(([, tg]) => {
        const groupOk =
          selectedGroup === undefined || tg.group === selectedGroup;
        const tagOk = selectedTag === undefined || tg.tag === selectedTag;
        return groupOk && tagOk;
      })
      .map(([sys, tg]) => [sys, tg.label] as [System, string]);

    // To compute optionsGroup and optionsTag, we need selectedTalkgroup
    const tgOpt = optionsTalkgroup[values.talkgroup];
    let selectedTalkgroup: Talkgroup | undefined;
    if (tgOpt) {
      const [tgSys, tgLabel] = tgOpt;
      const inScope = selectedSystems.find((s) => s.id === tgSys.id);
      if (inScope) {
        selectedTalkgroup = tgSys.talkgroups.find((t) => t.label === tgLabel);
      }
    }

    // optionsGroup
    const optionsGroup = Object.keys(config.groups)
      .filter((group) => {
        const systemOk =
          selectedSystem === undefined ||
          selectedSystem.talkgroups.some((tg) => tg.group === group);
        const talkgroupOk =
          selectedTalkgroup === undefined ||
          selectedTalkgroup.group === group;
        const tagOk =
          selectedTag === undefined ||
          (selectedTalkgroup !== undefined &&
            selectedTalkgroup.tag === selectedTag) ||
          config.systems
            .flatMap((s) => s.talkgroups)
            .some((tg) => tg.group === group && tg.tag === selectedTag);
        return systemOk && talkgroupOk && tagOk;
      })
      .sort((a, b) => a.localeCompare(b));

    // optionsTag
    const optionsTag = Object.keys(config.tags)
      .filter((tag) => {
        const systemOk =
          selectedSystem === undefined ||
          selectedSystem.talkgroups.some((tg) => tg.tag === tag);
        const talkgroupOk =
          selectedTalkgroup === undefined ||
          selectedTalkgroup.tag === tag;
        const groupOk =
          selectedGroup === undefined ||
          (selectedTalkgroup !== undefined &&
            selectedTalkgroup.group === selectedGroup) ||
          config.systems
            .flatMap((s) => s.talkgroups)
            .some((tg) => tg.tag === tag && tg.group === selectedGroup);
        return systemOk && talkgroupOk && groupOk;
      })
      .sort((a, b) => a.localeCompare(b));

    // optionsUnit
    const optionsUnit: [System, Unit][] = selectedSystems
      .flatMap((sys) =>
        (sys.units || []).map((u) => [sys, u] as [System, Unit]),
      )
      .sort((a, b) => a[1].label.localeCompare(b[1].label));

    return {
      optionsSystem,
      optionsTalkgroup,
      optionsGroup,
      optionsTag,
      optionsUnit,
    };
  }, [config, values.system, values.talkgroup, values.group, values.tag]);

  const { optionsSystem, optionsTalkgroup, optionsGroup, optionsTag, optionsUnit } =
    computed;

  // -------------------------------------------------------------------------
  // Filtered units (by search text)
  // -------------------------------------------------------------------------

  const optionsUnitFiltered = useMemo(() => {
    const filter = unitsFilterText.toLowerCase().trim();
    if (!filter) return optionsUnit;
    return optionsUnit.filter(
      ([, unit]) =>
        unit.label.toLowerCase().includes(filter) ||
        unit.id.toString().includes(filter),
    );
  }, [optionsUnit, unitsFilterText]);

  // -------------------------------------------------------------------------
  // Systems that have units (for grouped display)
  // -------------------------------------------------------------------------

  const systemsWithUnits = useMemo(() => {
    const map = new Map<number, System>();
    optionsUnit.forEach(([sys]) => {
      if (!map.has(sys.id)) map.set(sys.id, sys);
    });
    return Array.from(map.values());
  }, [optionsUnit]);

  const multipleSystemsWithUnits = systemsWithUnits.length > 1;

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const getUnitOptionIndex = useCallback(
    (option: [System, Unit]): number =>
      optionsUnit.findIndex(
        ([sys, unit]) => sys.id === option[0].id && unit.id === option[1].id,
      ),
    [optionsUnit],
  );

  const getUnitsForSystem = useCallback(
    (system: System): [System, Unit][] =>
      optionsUnitFiltered.filter(([sys]) => sys.id === system.id),
    [optionsUnitFiltered],
  );

  const areAllFilteredUnitsSelected = useMemo(() => {
    if (optionsUnitFiltered.length === 0) return true;
    const selected = new Set(values.units);
    return optionsUnitFiltered.every((opt) =>
      selected.has(getUnitOptionIndex(opt)),
    );
  }, [optionsUnitFiltered, values.units, getUnitOptionIndex]);

  // -------------------------------------------------------------------------
  // Change handlers
  // -------------------------------------------------------------------------

  const handleChange = useCallback(
    (field: keyof SearchFormValues, value: unknown) => {
      onChange({ ...values, [field]: value });
    },
    [onChange, values],
  );

  const handleSelectChange = useCallback(
    (field: keyof SearchFormValues) => (e: SelectChangeEvent<unknown>) => {
      handleChange(field, e.target.value);
    },
    [handleChange],
  );

  const handleUnitsChange = useCallback(
    (e: SelectChangeEvent<number[]>) => {
      const val = e.target.value;
      const newUnits = typeof val === 'string' ? [] : val;
      handleChange('units', newUnits);
    },
    [handleChange],
  );

  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleChange('date', e.target.value);
    },
    [handleChange],
  );

  const handleUnitsModeChange = useCallback(
    (_e: React.MouseEvent<HTMLElement>, val: string | null) => {
      if (val === 'any' || val === 'all') {
        handleChange('unitsMode', val);
      }
    },
    [handleChange],
  );

  const handleSelectAllFiltered = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const filteredIndices = optionsUnitFiltered.map((opt) =>
        getUnitOptionIndex(opt),
      );
      const merged = Array.from(new Set([...values.units, ...filteredIndices]));
      handleChange('units', merged);
    },
    [optionsUnitFiltered, values.units, getUnitOptionIndex, handleChange],
  );

  const handleDeselectAllFiltered = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const filteredSet = new Set(
        optionsUnitFiltered.map((opt) => getUnitOptionIndex(opt)),
      );
      const remaining = values.units.filter((i) => !filteredSet.has(i));
      handleChange('units', remaining);
    },
    [optionsUnitFiltered, values.units, getUnitOptionIndex, handleChange],
  );

  const handleClearAllUnits = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleChange('units', []);
    },
    [handleChange],
  );

  const handleRemoveUnit = useCallback(
    (unitIndex: number) => {
      const newUnits = values.units.filter((i) => i !== unitIndex);
      handleChange('units', newUnits);
    },
    [values.units, handleChange],
  );

  const handleUnitsSelectOpen = useCallback(() => {
    setTimeout(() => {
      unitsFilterRef.current?.focus();
    }, 0);
  }, []);

  // -------------------------------------------------------------------------
  // Units select trigger text
  // -------------------------------------------------------------------------

  const unitsDisplayText = useMemo(() => {
    if (values.units.length === 0) return 'All Units';
    if (values.units.length === 1) {
      return optionsUnit[values.units[0]!]?.[1]?.label ?? 'All Units';
    }
    return `${values.units.length} units selected`;
  }, [values.units, optionsUnit]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const formFieldSx = { flex: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.33% - 11px)' } };

  return (
    <Card
      sx={{
        p: 2,
        bgcolor: 'rgba(255,255,255,0.04)',
        borderRadius: 1,
      }}
    >
      <Box
        component="form"
        autoComplete="off"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        {/* Sort order */}
        <FormControl size="small" sx={formFieldSx} disabled={disabled}>
          <InputLabel>Sort order</InputLabel>
          <Select
            value={values.sort}
            label="Sort order"
            onChange={handleSelectChange('sort')}
          >
            <MenuItem value={1}>Ascending</MenuItem>
            <MenuItem value={-1}>Descending</MenuItem>
          </Select>
        </FormControl>

        {/* Date */}
        <TextField
          size="small"
          type="datetime-local"
          label="Date"
          value={values.date}
          onChange={handleDateChange}
          disabled={disabled}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: {
              max: playbackList?.dateStop
                ? new Date(playbackList.dateStop).toISOString().slice(0, 16)
                : undefined,
              min: playbackList?.dateStart
                ? new Date(playbackList.dateStart).toISOString().slice(0, 16)
                : undefined,
            },
          }}
          sx={formFieldSx}
        />

        {/* System */}
        <FormControl size="small" sx={formFieldSx} disabled={disabled}>
          <InputLabel>System</InputLabel>
          <Select
            value={values.system}
            label="System"
            onChange={handleSelectChange('system')}
          >
            <MenuItem value={-1}>All Systems</MenuItem>
            {optionsSystem.map((label, i) => (
              <MenuItem key={label} value={i}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Talkgroup */}
        <FormControl size="small" sx={formFieldSx} disabled={disabled}>
          <InputLabel>Talkgroup</InputLabel>
          <Select
            value={values.talkgroup}
            label="Talkgroup"
            onChange={handleSelectChange('talkgroup')}
          >
            <MenuItem value={-1}>All Talkgroups</MenuItem>
            {optionsTalkgroup.map(([, label], i) => (
              <MenuItem key={`${label}-${i}`} value={i}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Units */}
        <Box sx={{ flex: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <FormControl
            size="small"
            disabled={disabled || optionsUnit.length === 0}
            fullWidth
          >
            <InputLabel>Unit(s)</InputLabel>
            <Select<number[]>
              multiple
              value={values.units}
              label="Unit(s)"
              onChange={handleUnitsChange}
              onOpen={handleUnitsSelectOpen}
              renderValue={() => unitsDisplayText}
              MenuProps={{
                PaperProps: {
                  sx: { maxHeight: 400 },
                },
                autoFocus: false,
              }}
            >
              {/* Filter input and action buttons inside dropdown */}
              <ListSubheader
                sx={{
                  bgcolor: 'background.paper',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  pb: 1,
                }}
              >
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Search by name or ID"
                  label="Filter units"
                  value={unitsFilterText}
                  onChange={(e) => {
                    setUnitsFilterText(e.target.value);
                  }}
                  inputRef={unitsFilterRef}
                  onKeyDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  slotProps={{
                    input: {
                      endAdornment: unitsFilterText ? (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUnitsFilterText('');
                          }}
                          aria-label="Clear filter"
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      ) : undefined,
                    },
                  }}
                  sx={{ my: 1 }}
                />
                <Box
                  sx={{
                    display: 'flex',
                    gap: 0.5,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                  }}
                >
                  <Button
                    size="small"
                    onClick={handleSelectAllFiltered}
                    disabled={
                      optionsUnitFiltered.length === 0 ||
                      areAllFilteredUnitsSelected
                    }
                  >
                    Select All
                  </Button>
                  <Button
                    size="small"
                    onClick={handleDeselectAllFiltered}
                    disabled={optionsUnitFiltered.length === 0}
                  >
                    Deselect All
                  </Button>
                  <Button
                    size="small"
                    onClick={handleClearAllUnits}
                    disabled={values.units.length === 0}
                  >
                    Clear All
                  </Button>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={values.unitsMode}
                    onChange={handleUnitsModeChange}
                    disabled={values.units.length === 0}
                    sx={{
                      height: 28,
                      '& .MuiToggleButton-root': {
                        fontSize: 11,
                        px: 1,
                        py: 0,
                        lineHeight: '28px',
                      },
                    }}
                  >
                    <ToggleButton value="any" title="Match calls with ANY of the selected units">
                      ANY
                    </ToggleButton>
                    <ToggleButton value="all" title="Match calls with ALL of the selected units">
                      ALL
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              </ListSubheader>

              {/* Units grouped by system when multiple systems */}
              {multipleSystemsWithUnits
                ? systemsWithUnits.map((sys) => [
                    <ListSubheader key={`hdr-${sys.id}`} sx={{ bgcolor: 'background.paper' }}>
                      {sys.label}
                    </ListSubheader>,
                    ...getUnitsForSystem(sys).map((opt) => {
                      const idx = getUnitOptionIndex(opt);
                      return (
                        <MenuItem key={`${opt[0].id}-${opt[1].id}`} value={idx}>
                          {opt[1].label}
                        </MenuItem>
                      );
                    }),
                  ])
                : optionsUnitFiltered.map((opt) => {
                    const idx = getUnitOptionIndex(opt);
                    return (
                      <MenuItem key={`${opt[0].id}-${opt[1].id}`} value={idx}>
                        {opt[1].label}
                      </MenuItem>
                    );
                  })}
            </Select>
          </FormControl>

          {/* Chips for selected units */}
          {values.units.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {values.units.slice(0, 5).map((unitIndex) => {
                const unitOpt = optionsUnit[unitIndex];
                if (!unitOpt) return null;
                return (
                  <Chip
                    key={`chip-${unitIndex}`}
                    label={unitOpt[1].label}
                    size="small"
                    color="primary"
                    onDelete={() => handleRemoveUnit(unitIndex)}
                    deleteIcon={<CancelIcon />}
                  />
                );
              })}
              {values.units.length > 5 && (
                <Chip
                  label={`+${values.units.length - 5} more`}
                  size="small"
                  disabled
                />
              )}
            </Box>
          )}
        </Box>

        {/* Group */}
        <FormControl size="small" sx={formFieldSx} disabled={disabled}>
          <InputLabel>Group</InputLabel>
          <Select
            value={values.group}
            label="Group"
            onChange={handleSelectChange('group')}
          >
            <MenuItem value={-1}>All Groups</MenuItem>
            {optionsGroup.map((label, i) => (
              <MenuItem key={label} value={i}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Tag */}
        <FormControl size="small" sx={formFieldSx} disabled={disabled}>
          <InputLabel>Tag</InputLabel>
          <Select
            value={values.tag}
            label="Tag"
            onChange={handleSelectChange('tag')}
          >
            <MenuItem value={-1}>All Tags</MenuItem>
            {optionsTag.map((label, i) => (
              <MenuItem key={label} value={i}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Reset */}
        <Box
          sx={{
            flex: '100%',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button
            variant="contained"
            disabled={disabled}
            onClick={onReset}
          >
            Reset
          </Button>
        </Box>
      </Box>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Utility: build SearchOptions from form values + computed filter lists
// ---------------------------------------------------------------------------

export function buildSearchOptions(
  values: SearchFormValues,
  config: Config,
  offset: number,
  limit: number,
): SearchOptions {
  // Recompute the option arrays (same as the memo above, but standalone)
  const allTags = Object.keys(config.tags).sort((a, b) => a.localeCompare(b));
  const selectedTag = allTags[values.tag];

  const allGroups = Object.keys(config.groups).sort((a, b) => a.localeCompare(b));
  const selectedGroup = allGroups[values.group];

  const allSystemLabels = config.systems.map((s) => s.label);
  const selectedSystem = config.systems.find(
    (s) => s.label === allSystemLabels[values.system],
  );
  const selectedSystems = selectedSystem ? [selectedSystem] : config.systems;

  // Filter options by cross-dependencies (same as Angular)
  const optionsSystem = config.systems
    .filter((sys) => {
      const groupOk =
        selectedGroup === undefined ||
        sys.talkgroups.some((tg) => tg.group === selectedGroup);
      const tagOk =
        selectedTag === undefined ||
        sys.talkgroups.some((tg) => tg.tag === selectedTag);
      return groupOk && tagOk;
    })
    .map((s) => s.label);

  const optionsTalkgroup: [System, string][] = selectedSystems
    .flatMap((sys) =>
      sys.talkgroups.map((tg) => [sys, tg] as [System, Talkgroup]),
    )
    .filter(([, tg]) => {
      const groupOk =
        selectedGroup === undefined || tg.group === selectedGroup;
      const tagOk = selectedTag === undefined || tg.tag === selectedTag;
      return groupOk && tagOk;
    })
    .map(([sys, tg]) => [sys, tg.label] as [System, string]);

  const optionsGroup = Object.keys(config.groups)
    .filter((group) => {
      const systemOk =
        selectedSystem === undefined ||
        selectedSystem.talkgroups.some((tg) => tg.group === group);
      return systemOk;
    })
    .sort((a, b) => a.localeCompare(b));

  const optionsTag = Object.keys(config.tags)
    .filter((tag) => {
      const systemOk =
        selectedSystem === undefined ||
        selectedSystem.talkgroups.some((tg) => tg.tag === tag);
      return systemOk;
    })
    .sort((a, b) => a.localeCompare(b));

  const optionsUnit: [System, Unit][] = selectedSystems
    .flatMap((sys) =>
      (sys.units || []).map((u) => [sys, u] as [System, Unit]),
    )
    .sort((a, b) => a[1].label.localeCompare(b[1].label));

  // Build search options
  const options: SearchOptions = {
    limit,
    offset,
    sort: values.sort,
  };

  if (values.date) {
    options.date = new Date(Date.parse(values.date));
  }

  if (values.group >= 0) {
    const group = optionsGroup[values.group];
    if (group) options.group = group;
  }

  if (values.system >= 0) {
    const sys = getSelectedSystem(config, optionsSystem, values.system);
    if (sys) options.system = sys.id;
  }

  if (values.tag >= 0) {
    const tag = optionsTag[values.tag];
    if (tag) options.tag = tag;
  }

  if (values.talkgroup >= 0) {
    const [tgSys, tg] = getSelectedTalkgroup(
      config,
      optionsTalkgroup,
      optionsSystem,
      values.talkgroup,
      values.system,
    );
    if (tg) {
      options.talkgroup = tg.id;
      if (tgSys && options.system === undefined) {
        options.system = tgSys.id;
      }
    }
  }

  // Units
  const selectedUnits = values.units
    .map((i) => optionsUnit[i]?.[1])
    .filter((u): u is Unit => u !== undefined);

  if (selectedUnits.length > 0) {
    options.units = selectedUnits.map((u) => u.id);
    options.unitsMode = values.unitsMode;
  }

  return options;
}
