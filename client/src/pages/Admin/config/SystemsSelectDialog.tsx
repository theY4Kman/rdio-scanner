/*
 * Dialog to select which systems/talkgroups an access, apiKey, or downstream
 * applies to.  Mirrors the Angular RdioScannerAdminSystemsSelectComponent.
 */

import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Typography,
  Box,
} from '@mui/material';
import type {
  AccessSystems,
  AdminSystem,
  Group,
  Tag,
} from '../../../types/admin';

interface Props {
  open: boolean;
  systems: AdminSystem[];
  groups: Group[];
  tags: Tag[];
  value: AccessSystems;
  onClose: (result: AccessSystems | null) => void;
}

interface TgState {
  id: number;
  groupId?: number;
  tagId?: number;
  checked: boolean;
}

interface SysState {
  id: number;
  all: boolean;
  talkgroups: TgState[];
}

export default function SystemsSelectDialog({
  open,
  systems,
  groups,
  tags,
  value,
  onClose,
}: Props) {
  const [allChecked, setAllChecked] = useState(false);
  const [sysStates, setSysStates] = useState<SysState[]>([]);
  const [, setGroupChecks] = useState<boolean[]>([]);
  const [, setTagChecks] = useState<boolean[]>([]);

  // Initialize state from value when dialog opens
  useEffect(() => {
    if (!open) return;

    const initial: SysState[] = systems.map((sys) => ({
      id: sys.id ?? 0,
      all: false,
      talkgroups: (sys.talkgroups ?? []).map((tg) => ({
        id: tg.id ?? 0,
        groupId: tg.groupId,
        tagId: tg.tagId,
        checked: false,
      })),
    }));

    if (value === '*') {
      initial.forEach((s) => {
        s.all = true;
        s.talkgroups.forEach((t) => (t.checked = true));
      });
      setAllChecked(true);
    } else if (Array.isArray(value)) {
      value.forEach(
        (v: { id: number; talkgroups: { id: number }[] | number[] | '*' } | number) => {
          if (typeof v === 'number') {
            const sys = initial.find((s) => s.id === v);
            if (sys) {
              sys.all = true;
              sys.talkgroups.forEach((t) => (t.checked = true));
            }
          } else if (v && typeof v === 'object') {
            const sys = initial.find((s) => s.id === v.id);
            if (sys) {
              if (v.talkgroups === '*') {
                sys.all = true;
                sys.talkgroups.forEach((t) => (t.checked = true));
              } else if (Array.isArray(v.talkgroups)) {
                v.talkgroups.forEach((tg: { id: number } | number) => {
                  const tgId = typeof tg === 'number' ? tg : tg.id;
                  const found = sys.talkgroups.find((t) => t.id === tgId);
                  if (found) found.checked = true;
                });
                sys.all = sys.talkgroups.every((t) => t.checked);
              }
            }
          }
        },
      );
      setAllChecked(initial.every((s) => s.all));
    } else {
      setAllChecked(false);
    }

    setSysStates(initial);
    setGroupChecks(groups.map(() => false));
    setTagChecks(tags.map(() => false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Recompute group/tag checks from talkgroup states
  useEffect(() => {
    setGroupChecks(
      groups.map((g) => {
        const relevant = sysStates.flatMap((s) =>
          s.talkgroups.filter((t) => t.groupId === g._id),
        );
        return relevant.length > 0 && relevant.every((t) => t.checked);
      }),
    );
    setTagChecks(
      tags.map((t) => {
        const relevant = sysStates.flatMap((s) =>
          s.talkgroups.filter((tg) => tg.tagId === t._id),
        );
        return relevant.length > 0 && relevant.every((tg) => tg.checked);
      }),
    );
  }, [sysStates, groups, tags]);

  const toggleAll = (checked: boolean) => {
    setAllChecked(checked);
    setSysStates((prev) =>
      prev.map((s) => ({
        ...s,
        all: checked,
        talkgroups: s.talkgroups.map((t) => ({ ...t, checked })),
      })),
    );
  };

  const toggleSystem = (sysIdx: number, checked: boolean) => {
    setSysStates((prev) =>
      prev.map((s, i) =>
        i === sysIdx
          ? {
              ...s,
              all: checked,
              talkgroups: s.talkgroups.map((t) => ({ ...t, checked })),
            }
          : s,
      ),
    );
  };

  const toggleTalkgroup = (sysIdx: number, tgIdx: number, checked: boolean) => {
    setSysStates((prev) =>
      prev.map((s, si) => {
        if (si !== sysIdx) return s;
        const newTgs = s.talkgroups.map((t, ti) =>
          ti === tgIdx ? { ...t, checked } : t,
        );
        return { ...s, talkgroups: newTgs, all: newTgs.every((t) => t.checked) };
      }),
    );
  };

  const toggleGroup = (groupIdx: number, checked: boolean) => {
    const groupId = groups[groupIdx]?._id;
    setSysStates((prev) =>
      prev.map((s) => {
        const newTgs = s.talkgroups.map((t) =>
          t.groupId === groupId ? { ...t, checked } : t,
        );
        return { ...s, talkgroups: newTgs, all: newTgs.every((t) => t.checked) };
      }),
    );
  };

  const toggleTag = (tagIdx: number, checked: boolean) => {
    const tagId = tags[tagIdx]?._id;
    setSysStates((prev) =>
      prev.map((s) => {
        const newTgs = s.talkgroups.map((t) =>
          t.tagId === tagId ? { ...t, checked } : t,
        );
        return { ...s, talkgroups: newTgs, all: newTgs.every((t) => t.checked) };
      }),
    );
  };

  const handleAccept = () => {
    if (allChecked) {
      onClose('*');
      return;
    }
    const result: AccessSystems = sysStates
      .filter((s) => s.all || s.talkgroups.some((t) => t.checked))
      .map((s) => {
        if (s.all) {
          return { id: s.id, talkgroups: '*' as const };
        }
        return {
          id: s.id,
          talkgroups: s.talkgroups.filter((t) => t.checked).map((t) => t.id),
        };
      });
    onClose(result);
  };

  // Indeterminate states
  const allIndeterminate =
    !allChecked && sysStates.some((s) => s.all || s.talkgroups.some((t) => t.checked));

  return (
    <Dialog open={open} onClose={() => onClose(null)} maxWidth="md" fullWidth>
      <DialogTitle>Systems and talkgroups selection</DialogTitle>
      <DialogContent>
        <FormControlLabel
          control={
            <Checkbox
              checked={allChecked}
              indeterminate={allIndeterminate}
              onChange={(_, c) => toggleAll(c)}
            />
          }
          label="Everything"
        />

        {groups.length > 0 && (
          <>
            <Typography variant="caption" display="block" mt={2} mb={1}>
              Groups
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={0.5}>
              {groups.map((g, gi) => {
                const relevant = sysStates.flatMap((s) =>
                  s.talkgroups.filter((t) => t.groupId === g._id),
                );
                const someChecked = relevant.some((t) => t.checked);
                const allGroupChecked = relevant.length > 0 && relevant.every((t) => t.checked);
                return (
                  <FormControlLabel
                    key={g._id ?? gi}
                    control={
                      <Checkbox
                        checked={allGroupChecked}
                        indeterminate={someChecked && !allGroupChecked}
                        onChange={(_, c) => toggleGroup(gi, c)}
                        size="small"
                      />
                    }
                    label={g.label ?? ''}
                  />
                );
              })}
            </Box>
          </>
        )}

        {tags.length > 0 && (
          <>
            <Typography variant="caption" display="block" mt={2} mb={1}>
              Tags
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={0.5}>
              {tags.map((t, ti) => {
                const relevant = sysStates.flatMap((s) =>
                  s.talkgroups.filter((tg) => tg.tagId === t._id),
                );
                const someChecked = relevant.some((tg) => tg.checked);
                const allTagChecked = relevant.length > 0 && relevant.every((tg) => tg.checked);
                return (
                  <FormControlLabel
                    key={t._id ?? ti}
                    control={
                      <Checkbox
                        checked={allTagChecked}
                        indeterminate={someChecked && !allTagChecked}
                        onChange={(_, c) => toggleTag(ti, c)}
                        size="small"
                      />
                    }
                    label={t.label ?? ''}
                  />
                );
              })}
            </Box>
          </>
        )}

        <Typography variant="caption" display="block" mt={2} mb={1}>
          Systems
        </Typography>
        {sysStates.map((sys, si) => {
          const sysIndeterminate =
            !sys.all && sys.talkgroups.some((t) => t.checked);
          const sysLabel =
            systems[si]?.label ?? `System ${sys.id}`;
          return (
            <Box key={sys.id} mb={1}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={sys.all}
                    indeterminate={sysIndeterminate}
                    onChange={(_, c) => toggleSystem(si, c)}
                  />
                }
                label={sysLabel}
              />
              <Box display="flex" flexWrap="wrap" gap={0.5} pl={4}>
                {sys.talkgroups.map((tg, ti) => {
                  const tgLabel =
                    systems[si]?.talkgroups?.[ti]?.label ?? `TG ${tg.id}`;
                  return (
                    <FormControlLabel
                      key={tg.id}
                      control={
                        <Checkbox
                          checked={tg.checked}
                          onChange={(_, c) => toggleTalkgroup(si, ti, c)}
                          size="small"
                        />
                      }
                      label={tgLabel}
                    />
                  );
                })}
              </Box>
            </Box>
          );
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(null)}>Cancel</Button>
        <Button variant="contained" onClick={handleAccept}>
          Ok
        </Button>
      </DialogActions>
    </Dialog>
  );
}
