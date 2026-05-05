import { useMemo } from 'react';
import { Tooltip } from '@mui/material';
import { useScannerStore } from '../stores/scanner';
import type { Call, CallSource } from '../types/scanner';

// ---------------------------------------------------------------------------
// <UnitLabel> — shared component for rendering a call source's unit label.
//
// Renders one of four visual states:
//   1. Unknown (source.src not a number)  → italic white "?"
//   2. Known + labeled                    → green
//   3. Known + unlabeled                  → orange
//   4. Save in-flight (pending admin ack) → teal
//
// Subscribes to `unitsIndex` + `pendingUnitLabels` so every reference in the
// UI updates instantly when a label is saved, and reverts to green once the
// server confirms the change via config emission.
// ---------------------------------------------------------------------------

const COLOR_LABELED = 'rgb(0, 163, 84)';      // green
const COLOR_UNLABELED = 'rgb(204, 122, 0)';   // orange
const COLOR_PENDING = 'rgb(0, 180, 180)';     // teal — save in-flight
const COLOR_UNKNOWN = 'rgb(255, 255, 255)';   // white (italic)

export interface UnitLabelProps {
  /** The call this source belongs to — used for onEdit callback and systemId. */
  call: Call | null;
  /** The source being rendered. */
  source: CallSource;
  /**
   * Click handler — typically opens the Labeler.
   * When provided, the label renders with a pointer cursor and hover underline.
   */
  onEdit?: (call: Call, source: CallSource) => void;
  /** Optional extra inline style to merge on top of the computed color/cursor. */
  style?: React.CSSProperties;
  /** Optional class for layout/spacing control at the call site. */
  className?: string;
}

/**
 * Determine the authoritative label for a unit, preferring live pending state,
 * then source.label (baked at propagation), then unitsIndex, else undefined.
 */
function resolveLabel(
  systemId: number | undefined,
  unitId: number | undefined,
  sourceLabel: string | undefined,
  unitsIndex: Record<number, Record<number, string>>,
  pendingEntry: { label: string | null; ts: number } | undefined,
): { label: string | null; pending: boolean } {
  if (pendingEntry) {
    return { label: pendingEntry.label, pending: true };
  }
  if (sourceLabel) return { label: sourceLabel, pending: false };
  if (
    typeof systemId === 'number' &&
    typeof unitId === 'number' &&
    unitsIndex[systemId]?.[unitId]
  ) {
    return { label: unitsIndex[systemId]![unitId]!, pending: false };
  }
  return { label: null, pending: false };
}

export function UnitLabel({ call, source, onEdit, style, className }: UnitLabelProps) {
  const unitsIndex = useScannerStore((s) => s.unitsIndex);
  const pendingUnitLabels = useScannerStore((s) => s.pendingUnitLabels);

  const systemId = call?.system;
  const unitId = typeof source.src === 'number' ? source.src : undefined;

  const pendingEntry =
    systemId != null && unitId != null
      ? pendingUnitLabels[systemId]?.[unitId]
      : undefined;

  const { label, pending } = useMemo(
    () => resolveLabel(systemId, unitId, source.label, unitsIndex, pendingEntry),
    [systemId, unitId, source.label, unitsIndex, pendingEntry],
  );

  // Visual state computation
  const isUnknown = unitId == null;
  const color = pending
    ? COLOR_PENDING
    : isUnknown
      ? COLOR_UNKNOWN
      : label
        ? COLOR_LABELED
        : COLOR_UNLABELED;

  // Display text: pending-delete shows placeholder; otherwise label or unit id
  const displayText = isUnknown
    ? '?'
    : pending && label === null
      ? `${unitId}`                 // pending delete → show unit id
      : label ?? `${unitId}`;

  // Tooltip text
  const tooltipText = useMemo(() => {
    if (isUnknown) return 'Unknown unit';
    const base = `Unit ${unitId}`;
    if (pending) {
      return label === null
        ? `${base} — deleting label…`
        : `${base} — saving “${label}”…`;
    }
    if (label) return `${base} — ${label}`;
    return base;
  }, [isUnknown, unitId, label, pending]);

  const handleClick = onEdit && call
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        onEdit(call, source);
      }
    : undefined;

  const combinedStyle: React.CSSProperties = {
    color,
    fontStyle: isUnknown ? 'italic' : undefined,
    cursor: handleClick ? 'pointer' : undefined,
    ...style,
  };

  return (
    <Tooltip title={tooltipText} enterDelay={400} enterNextDelay={200}>
      <span className={className} style={combinedStyle} onClick={handleClick}>
        {displayText}
      </span>
    </Tooltip>
  );
}

export default UnitLabel;
