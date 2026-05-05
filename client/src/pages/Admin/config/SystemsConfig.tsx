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
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  AdminSystem,
  AdminTalkgroup,
  AdminUnit,
  Group,
  Tag,
} from '../../../types/admin';
import { LED_COLORS } from '../../../types/admin';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  systems: AdminSystem[];
  groups: Group[];
  tags: Tag[];
  onChange: (systems: AdminSystem[]) => void;
}

// ---------------------------------------------------------------------------
// Sortable wrapper
// ---------------------------------------------------------------------------

function SortableItem({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Talkgroup editor
// ---------------------------------------------------------------------------

function TalkgroupEditor({
  tg,
  groups,
  tags,
  onUpdate,
  onRemove,
  onBlacklist,
}: {
  tg: AdminTalkgroup;
  groups: Group[];
  tags: Tag[];
  onUpdate: (patch: Partial<AdminTalkgroup>) => void;
  onRemove: () => void;
  onBlacklist: () => void;
}) {
  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2">Id</Typography>
          <Typography variant="caption" color="text.secondary">
            Talkgroup identifier in decimal format.
          </Typography>
        </Box>
        <TextField
          type="number"
          size="small"
          placeholder="Id"
          value={tg.id ?? ''}
          onChange={(e) =>
            onUpdate({ id: e.target.value ? Number(e.target.value) : undefined })
          }
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
        />
      </Box>

      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2">Label</Typography>
          <Typography variant="caption" color="text.secondary">
            Talkgroup label on the main screen and on buttons.
          </Typography>
        </Box>
        <TextField
          size="small"
          placeholder="Label"
          value={tg.label ?? ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </Box>

      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2">Name</Typography>
          <Typography variant="caption" color="text.secondary">
            Talkgroup name displayed on the main screen.
          </Typography>
        </Box>
        <TextField
          size="small"
          placeholder="Name"
          value={tg.name ?? ''}
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
      </Box>

      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2">Group</Typography>
          <Typography variant="caption" color="text.secondary">
            Group to which this talkgroup belongs.
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          value={tg.groupId ?? ''}
          onChange={(e) =>
            onUpdate({ groupId: e.target.value ? Number(e.target.value) : undefined })
          }
          sx={{ minWidth: 160 }}
        >
          {groups.map((g) => (
            <MenuItem key={g._id} value={g._id}>
              {g.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2">Tag</Typography>
          <Typography variant="caption" color="text.secondary">
            Tag to which this talkgroup belongs.
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          value={tg.tagId ?? ''}
          onChange={(e) =>
            onUpdate({ tagId: e.target.value ? Number(e.target.value) : undefined })
          }
          sx={{ minWidth: 160 }}
        >
          {tags.map((t) => (
            <MenuItem key={t._id} value={t._id}>
              {t.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2">Led Color</Typography>
          <Typography variant="caption" color="text.secondary">
            Indicator color when playing audio from this talkgroup.
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          value={tg.led ?? ''}
          onChange={(e) => onUpdate({ led: e.target.value || null })}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="">Default</MenuItem>
          {LED_COLORS.map((c) => (
            <MenuItem key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </MenuItem>
          ))}
        </TextField>
      </Box>

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
          value={tg.frequency ?? ''}
          onChange={(e) =>
            onUpdate({
              frequency: e.target.value ? Number(e.target.value) : null,
            })
          }
          slotProps={{ htmlInput: { min: 0 } }}
        />
      </Box>

      <Box display="flex" gap={1}>
        {tg.id != null && (
          <Button onClick={onBlacklist}>Blacklist talkgroup</Button>
        )}
        <Button color="error" onClick={onRemove}>
          Delete talkgroup
        </Button>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Unit editor
// ---------------------------------------------------------------------------

function UnitEditor({
  unit,
  onUpdate,
  onRemove,
}: {
  unit: AdminUnit;
  onUpdate: (patch: Partial<AdminUnit>) => void;
  onRemove: () => void;
}) {
  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2">Id</Typography>
          <Typography variant="caption" color="text.secondary">
            Unit identifier in decimal format.
          </Typography>
        </Box>
        <TextField
          type="number"
          size="small"
          placeholder="Id"
          value={unit.id ?? ''}
          onChange={(e) =>
            onUpdate({ id: e.target.value ? Number(e.target.value) : undefined })
          }
          slotProps={{ htmlInput: { min: 0, step: 1 } }}
        />
      </Box>

      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2">Label</Typography>
          <Typography variant="caption" color="text.secondary">
            Unit label.
          </Typography>
        </Box>
        <TextField
          size="small"
          placeholder="Label"
          value={unit.label ?? ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </Box>

      <Box display="flex" justifyContent="flex-start">
        <Button color="error" onClick={onRemove}>
          Delete unit
        </Button>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Single system editor
// ---------------------------------------------------------------------------

function SystemEditor({
  system,
  groups,
  tags,
  onUpdate,
  onRemove,
}: {
  system: AdminSystem;
  groups: Group[];
  tags: Tag[];
  onUpdate: (patch: Partial<AdminSystem>) => void;
  onRemove: () => void;
}) {
  const talkgroups = [...(system.talkgroups ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const units = [...(system.units ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const updateTalkgroup = (tgIndex: number, patch: Partial<AdminTalkgroup>) => {
    const next = [...(system.talkgroups ?? [])];
    const origItem = talkgroups[tgIndex];
    if (!origItem) return;
    const origIdx = next.indexOf(origItem);
    if (origIdx >= 0) next[origIdx] = { ...next[origIdx], ...patch };
    onUpdate({ talkgroups: next });
  };

  const removeTalkgroup = (tgIndex: number) => {
    const origItem = talkgroups[tgIndex];
    if (!origItem) return;
    onUpdate({
      talkgroups: (system.talkgroups ?? []).filter((t) => t !== origItem),
    });
  };

  const blacklistTalkgroup = (tgIndex: number) => {
    const tg = talkgroups[tgIndex];
    if (!tg || typeof tg.id !== 'number') return;
    const bl = system.blacklists?.trim()
      ? `${system.blacklists},${tg.id}`
      : `${tg.id}`;
    const nextTgs = (system.talkgroups ?? []).filter((t) => t !== tg);
    onUpdate({ blacklists: bl, talkgroups: nextTgs });
  };

  const addTalkgroup = () => {
    onUpdate({
      talkgroups: [
        { id: undefined, label: '', name: '', order: 0 },
        ...(system.talkgroups ?? []),
      ],
    });
  };

  const updateUnit = (uIndex: number, patch: Partial<AdminUnit>) => {
    const next = [...(system.units ?? [])];
    const origItem = units[uIndex];
    if (!origItem) return;
    const origIdx = next.indexOf(origItem);
    if (origIdx >= 0) next[origIdx] = { ...next[origIdx], ...patch };
    onUpdate({ units: next });
  };

  const removeUnit = (uIndex: number) => {
    const origItem = units[uIndex];
    onUpdate({ units: (system.units ?? []).filter((u) => u !== origItem) });
  };

  const addUnit = () => {
    onUpdate({
      units: [{ id: undefined, label: '', order: 0 }, ...(system.units ?? [])],
    });
  };

  const handleTgDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = talkgroups.findIndex((_, i) => `tg-${i}` === active.id);
    const newIndex = talkgroups.findIndex((_, i) => `tg-${i}` === over.id);
    const reordered = arrayMove(talkgroups, oldIndex, newIndex).map((tg, idx) => ({
      ...tg,
      order: idx + 1,
    }));
    onUpdate({ talkgroups: reordered });
  };

  const handleUnitDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = units.findIndex((_, i) => `unit-${i}` === active.id);
    const newIndex = units.findIndex((_, i) => `unit-${i}` === over.id);
    const reordered = arrayMove(units, oldIndex, newIndex).map((u, idx) => ({
      ...u,
      order: idx + 1,
    }));
    onUpdate({ units: reordered });
  };

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2">Id</Typography>
          <Typography variant="caption" color="text.secondary">
            System identifier in decimal format.
          </Typography>
        </Box>
        <TextField
          type="number"
          size="small"
          placeholder="Id"
          value={system.id ?? ''}
          onChange={(e) =>
            onUpdate({ id: e.target.value ? Number(e.target.value) : undefined })
          }
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
        />
      </Box>

      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2">Label</Typography>
          <Typography variant="caption" color="text.secondary">
            System label on the main screen and search panel.
          </Typography>
        </Box>
        <TextField
          size="small"
          placeholder="Label"
          value={system.label ?? ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </Box>

      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2">Led Color</Typography>
          <Typography variant="caption" color="text.secondary">
            Indicator color when playing audio from this system.
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          value={system.led ?? ''}
          onChange={(e) => onUpdate({ led: e.target.value || null })}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="">Default</MenuItem>
          {LED_COLORS.map((c) => (
            <MenuItem key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2">Auto Populate</Typography>
          <Typography variant="caption" color="text.secondary">
            Allows the automatic creation of unconfigured talkgroups.
          </Typography>
        </Box>
        <Switch
          checked={system.autoPopulate ?? false}
          onChange={(e) => onUpdate({ autoPopulate: e.target.checked })}
        />
      </Box>

      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2">Blacklists</Typography>
          <Typography variant="caption" color="text.secondary">
            A comma separated list of talkgroup Ids to blacklist.
          </Typography>
        </Box>
        <TextField
          size="small"
          multiline
          minRows={1}
          maxRows={3}
          placeholder="Blacklists"
          value={system.blacklists ?? ''}
          onChange={(e) => onUpdate({ blacklists: e.target.value })}
        />
      </Box>

      {/* Talkgroups */}
      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Talkgroups</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="caption" color="text.secondary">
              System talkgroups. Drag and drop to rearrange.
            </Typography>
            <Button color="secondary" size="small" onClick={addTalkgroup}>
              New talkgroup
            </Button>
          </Box>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleTgDragEnd}
          >
            <SortableContext
              items={talkgroups.map((_, i) => `tg-${i}`)}
              strategy={verticalListSortingStrategy}
            >
              {talkgroups.map((tg, ti) => (
                <SortableItem key={`tg-${ti}`} id={`tg-${ti}`}>
                  <Accordion disableGutters>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <DragIndicatorIcon
                        sx={{ mr: 1, color: 'text.secondary' }}
                      />
                      <Typography>
                        {tg.label?.trim() || 'NewTalkgroup'}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <TalkgroupEditor
                        tg={tg}
                        groups={groups}
                        tags={tags}
                        onUpdate={(patch) => updateTalkgroup(ti, patch)}
                        onRemove={() => removeTalkgroup(ti)}
                        onBlacklist={() => blacklistTalkgroup(ti)}
                      />
                    </AccordionDetails>
                  </Accordion>
                </SortableItem>
              ))}
            </SortableContext>
          </DndContext>
        </AccordionDetails>
      </Accordion>

      {/* Units */}
      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Units</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="caption" color="text.secondary">
              Create units to display a label instead of the unit id. Drag and drop to
              rearrange.
            </Typography>
            <Button color="secondary" size="small" onClick={addUnit}>
              New unit
            </Button>
          </Box>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleUnitDragEnd}
          >
            <SortableContext
              items={units.map((_, i) => `unit-${i}`)}
              strategy={verticalListSortingStrategy}
            >
              {units.map((unit, ui) => (
                <SortableItem key={`unit-${ui}`} id={`unit-${ui}`}>
                  <Accordion disableGutters>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <DragIndicatorIcon
                        sx={{ mr: 1, color: 'text.secondary' }}
                      />
                      <Typography>
                        {unit.label?.trim() || 'NewUnit'}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <UnitEditor
                        unit={unit}
                        onUpdate={(patch) => updateUnit(ui, patch)}
                        onRemove={() => removeUnit(ui)}
                      />
                    </AccordionDetails>
                  </Accordion>
                </SortableItem>
              ))}
            </SortableContext>
          </DndContext>
        </AccordionDetails>
      </Accordion>

      <Box display="flex" justifyContent="flex-start">
        <Button color="error" onClick={onRemove}>
          Delete system
        </Button>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main SystemsConfig component
// ---------------------------------------------------------------------------

export default function SystemsConfig({ systems, groups, tags, onChange }: Props) {
  const sorted = [...systems].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const add = useCallback(() => {
    onChange([
      { id: undefined, label: '', talkgroups: [], units: [], order: 0 },
      ...systems,
    ]);
  }, [systems, onChange]);

  const remove = useCallback(
    (index: number) => {
      const item = sorted[index];
      if (!item) return;
      onChange(systems.filter((s) => s !== item));
    },
    [systems, sorted, onChange],
  );

  const updateSystem = useCallback(
    (index: number, patch: Partial<AdminSystem>) => {
      const item = sorted[index];
      if (!item) return;
      const origIdx = systems.indexOf(item);
      if (origIdx < 0) return;
      const next = [...systems];
      next[origIdx] = { ...next[origIdx], ...patch };
      onChange(next);
    },
    [systems, sorted, onChange],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sorted.findIndex((_, i) => `sys-${i}` === active.id);
      const newIndex = sorted.findIndex((_, i) => `sys-${i}` === over.id);
      const reordered = arrayMove(sorted, oldIndex, newIndex).map((s, idx) => ({
        ...s,
        order: idx + 1,
      }));
      onChange(reordered);
    },
    [sorted, onChange],
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="body2">
          This is where you define all your systems and talkgroups. Audio files to
          unknown systems/talkgroups will not be ingested unless the auto populate
          option is activated. You can drag and drop systems to rearrange their order.
        </Typography>
        <Button color="secondary" onClick={add} sx={{ whiteSpace: 'nowrap', ml: 2 }}>
          New system
        </Button>
      </Box>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sorted.map((_, i) => `sys-${i}`)}
          strategy={verticalListSortingStrategy}
        >
          {sorted.map((system, i) => (
            <SortableItem key={`sys-${i}`} id={`sys-${i}`}>
              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <DragIndicatorIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  <Typography>
                    {system.label?.trim() || 'NewSystem'}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <SystemEditor
                    system={system}
                    groups={groups}
                    tags={tags}
                    onUpdate={(patch) => updateSystem(i, patch)}
                    onRemove={() => remove(i)}
                  />
                </AccordionDetails>
              </Accordion>
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
    </Box>
  );
}
