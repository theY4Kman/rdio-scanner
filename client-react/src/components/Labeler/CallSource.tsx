import { useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import type { Call, CallSource as CallSourceType } from '../../types/scanner';

// ---------------------------------------------------------------------------
// formatSrcId -- format a unit source ID for display
// ---------------------------------------------------------------------------

export function formatSrcId(
  src: number | undefined,
  hexFormat: boolean | 'uppercase' | 'lowercase' = true,
): string {
  if (src == null) return '';

  if (hexFormat) {
    let formatted = src.toString(16);
    if (formatted.length % 2) {
      formatted = '0' + formatted;
    }
    if (hexFormat !== 'lowercase') {
      formatted = formatted.toUpperCase();
    }
    return formatted;
  }

  return src.toString();
}

// ---------------------------------------------------------------------------
// CallSource component
// ---------------------------------------------------------------------------

export interface CallSourceProps {
  call: Call | undefined;
  source: CallSourceType | undefined;
  /** When true, clicking the label will NOT open the labeler form */
  disableEditForm?: boolean;
  /** Display unit IDs in hex. Pass 'uppercase' or 'lowercase', or boolean */
  hexFormat?: boolean | 'uppercase' | 'lowercase';
  /** Callback fired when the label is clicked */
  onEdit?: (data: { system: number; source: CallSourceType }) => void;
}

const knownSx: SxProps<Theme> = {
  color: 'rgb(0, 163, 84)',
  fontWeight: 500,
};

const unknownSx: SxProps<Theme> = {
  color: 'rgb(204, 122, 0)',
  fontStyle: 'italic',
};

const clickableSx: SxProps<Theme> = {
  cursor: 'pointer',
  textDecoration: 'underline',
  textDecorationColor: 'transparent',
  transition: 'text-decoration-color 0.15s',
  '&:hover': {
    textDecorationColor: 'currentColor',
  },
};

export default function CallSource({
  call,
  source,
  disableEditForm = false,
  hexFormat = true,
  onEdit,
}: CallSourceProps) {
  const isClickable = !disableEditForm || !!onEdit;

  const handleClick = useCallback(() => {
    if (!call || !source) return;

    onEdit?.({ system: call.system, source });
  }, [call, source, onEdit]);

  if (!call || !source) return null;

  // No source ID
  if (!source.src) {
    return (
      <Typography component="em" variant="body2" sx={{ display: 'inline' }}>
        {source.label ?? '?'}
      </Typography>
    );
  }

  const displayText = source.label ?? formatSrcId(source.src, hexFormat);
  const isKnown = source.label != null;

  return (
    <Box
      component="a"
      onClick={isClickable ? handleClick : undefined}
      title={formatSrcId(source.src, hexFormat)}
      sx={[
        {
          display: 'inline',
        },
        ...(isKnown ? [knownSx] : [unknownSx]),
        ...(isClickable ? [clickableSx] : []),
      ] as SxProps<Theme>}
    >
      {displayText}
    </Box>
  );
}
