import { useMemo } from 'react';
import { Box } from '@mui/material';
import { useScannerStore } from '../../stores/scanner';
import { useAudioTime } from '../../hooks/useAudioTime';
import { formatDuration } from '../../utils/format';
import type { Call, CallSource } from '../../types/scanner';
import UnitLabel from '../UnitLabel';

// ---------------------------------------------------------------------------
// Helper: compute source duration
// ---------------------------------------------------------------------------
function getSourceDuration(call: Call, sourceIndex: number): number {
  const source = call.sources?.[sourceIndex];
  const sourcePos = source?.pos;
  if (sourcePos == null) {
    return call.audioDuration ?? 0;
  }
  const nextSource = call.sources?.[sourceIndex + 1];
  const nextPos = nextSource?.pos ?? call.audioDuration ?? 0;
  return nextPos - sourcePos;
}

// ---------------------------------------------------------------------------
// Helper: display info for each source
// ---------------------------------------------------------------------------
interface SourceDisplayInfo {
  offsetRem: number;
  widthRem: number;
  scrollRem: number;
}

function computeSourcesDisplayInfo(call: Call): {
  infos: SourceDisplayInfo[];
  totalRem: number;
} {
  if (!call.sources?.length) {
    return { infos: [], totalRem: 0 };
  }

  let totalRem = 0;
  const infos: SourceDisplayInfo[] = call.sources.map((_, sourceIndex) => {
    const widthRem = Math.max(8, getSourceDuration(call, sourceIndex) + 5);
    totalRem += widthRem;
    const scrollRem = Math.max(0, widthRem - 8);
    return { offsetRem: 0, widthRem, scrollRem };
  });

  infos.forEach((info, sourceIndex) => {
    const prevInfo = infos[sourceIndex - 1];
    if (prevInfo) {
      info.offsetRem = prevInfo.offsetRem + prevInfo.widthRem;
    }
  });

  return { infos, totalRem };
}



// ---------------------------------------------------------------------------
// UnitTimeline component
// ---------------------------------------------------------------------------

interface UnitTimelineProps {
  call: Call | null;
  callDuration: number;
  onEditUnit?: (call: Call, source: CallSource) => void;
}

export function UnitTimeline({ call, callDuration, onEditUnit }: UnitTimelineProps) {
  const callTime = useAudioTime();
  const seek = useScannerStore.getState().seek;

  const sources = call?.sources;
  const hasSources = Array.isArray(sources) && sources.length > 0;

  // Compute active source index
  const callSourceIndex = useMemo(() => {
    if (!hasSources) return 0;
    if (callTime >= callDuration) return sources!.length - 1;
    let idx = 0;
    for (let i = 0; i < sources!.length; i++) {
      if ((sources![i]!.pos || 0) <= callTime) {
        idx = i;
      }
    }
    return idx;
  }, [hasSources, sources, callTime, callDuration]);

  const activeSource = hasSources ? sources![callSourceIndex] : undefined;
  const callSourcePos = activeSource ? callTime - (activeSource.pos || 0) : 0;
  const callSourceDuration = hasSources
    ? getSourceDuration(call!, callSourceIndex)
    : callDuration;

  // Compute display info
  const { infos } = useMemo(
    () => call ? computeSourcesDisplayInfo(call) : { infos: [], totalRem: 0 },
    [call],
  );

  const numSources = hasSources ? sources!.length : typeof call?.source === 'number' ? 1 : 0;

  if (!hasSources) {
    // Render an empty placeholder with the same dimensions to prevent
    // layout reflow when the timeline mounts/unmounts between calls.
    return (
      <Box
        sx={{
          position: 'relative',
          width: '30rem',
          height: 'calc(3rem + 2.2rem)',
          mt: '-1rem',
        }}
      />
    );
  }

  // Compute wrapper left offset for scrolling units into view
  const activeInfo = infos[callSourceIndex];
  const wrapperLeft = activeInfo
    ? -(
        activeInfo.offsetRem +
        (callSourceDuration > 0
          ? (callSourcePos / callSourceDuration) * activeInfo.widthRem
          : 0)
      ) + 16
    : 0;

  return (
    <Box
      sx={{
        position: 'relative',
        width: '30rem',
        height: 'calc(3rem + 2.2rem)',
        overflow: 'hidden',
        mt: '-1rem',
      }}
    >
      {/* Active needle */}
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: '8px',
          WebkitTextStrokeWidth: '1px',
          WebkitTextStrokeColor: 'white',
          zIndex: 2,
        }}
      >
        {'\u25BC'}
      </Box>

      {/* Call length bar with unit markers */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: '14px',
          width: '100%',
          height: 3,
          bgcolor: 'gray',
          borderRadius: '4px',
        }}
      >
        {/* Unit markers — inline style to avoid CSS class churn */}
        {sources!.map((source, sourceIndex) => {
          if (source.pos == null) return null;
          const leftPct = (source.pos / callDuration) * 100;
          const widthPct =
            (getSourceDuration(call!, sourceIndex) / callDuration) * 100;

          const isKnown = source.label != null;
          const isPrev = sourceIndex < callSourceIndex;
          const isActive = sourceIndex === callSourceIndex;
          const isNext = sourceIndex > callSourceIndex;

          return (
            <div
              key={sourceIndex}
              onClick={() => {
                if (source.pos != null) seek(source.pos);
              }}
              style={{
                position: 'absolute',
                top: isActive ? -1 : 0,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                height: isActive ? 4 : '100%',
                background: isKnown
                  ? 'rgb(0, 163, 84)'
                  : 'rgb(204, 122, 0)',
                border: '1px solid black',
                cursor: 'pointer',
                opacity: isPrev ? 0.3 : isNext ? 0.6 : 0.95,
              }}
            />
          );
        })}

        {/* Progress position bar — inline style to avoid CSS class churn */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: callDuration > 0 ? `${(callTime / callDuration) * 100}%` : 0,
            height: 4,
            background: 'rgba(255, 255, 255, 0.8)',
            borderRadius: 4,
            pointerEvents: 'none',
            transition: 'width 100ms',
          }}
        />
      </Box>

      {/* Scrolling unit labels wrapper — inline style for high-frequency left offset */}
      <div
        style={{
          position: 'absolute',
          left: `${wrapperLeft}rem`,
          marginTop: '1.3rem',
          transition: 'left 100ms',
          whiteSpace: 'nowrap',
        }}
      >
        {sources!.map((source, sourceIndex) => {
          const isActive = sourceIndex === callSourceIndex;
          const info = infos[sourceIndex];
          if (!info) return null;

          const paddingLeftRem =
            sourceIndex === callSourceIndex
              ? (callSourceDuration > 0
                  ? callSourcePos / callSourceDuration
                  : 0) * info.scrollRem
              : sourceIndex < callSourceIndex
                ? info.scrollRem
                : 0;

          return (
            <div
              key={sourceIndex}
              style={{
                display: 'inline-block',
                width: `${info.widthRem}rem`,
                transition: 'padding-left 100ms',
                paddingLeft: `${paddingLeftRem}rem`,
                fontWeight: isActive ? 'bold' : 'normal',
              }}
            >
              <UnitLabel
                call={call}
                source={source}
                onEdit={onEditUnit}
                style={{
                  fontSize: isActive ? '1.2em' : 'inherit',
                  display: 'block',
                }}
              />
              <div
                onClick={() => {
                  if (source.pos != null) seek(source.pos);
                }}
                style={{
                  fontSize: isActive ? '1.1em' : 12,
                  height: 14,
                  cursor: 'pointer',
                }}
              >
                [{sourceIndex + 1}/{numSources}]{' '}
                {formatDuration(getSourceDuration(call!, sourceIndex))}s
              </div>
            </div>
          );
        })}
      </div>
    </Box>
  );
}
