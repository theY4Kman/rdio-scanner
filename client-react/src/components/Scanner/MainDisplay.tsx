import { Box } from '@mui/material';
import { QueueTicker } from './QueueTicker';
import { ScannerDisplay, LedDot } from './ScannerDisplay';
import { ControlButtons } from './ControlButtons';
import { useScannerStore } from '../../stores/scanner';

// ---------------------------------------------------------------------------
// MainDisplay -- orchestrates the scanner display, queue ticker, and controls
// ---------------------------------------------------------------------------

interface MainDisplayProps {
  onOpenSearch: () => void;
  onOpenSelect: () => void;
  onToggleFullscreen: () => void;
}

export function MainDisplay({
  onOpenSearch,
  onOpenSelect,
  onToggleFullscreen,
}: MainDisplayProps) {
  const call = useScannerStore((s) => s.call);
  const paused = useScannerStore((s) => s.paused);

  return (
    <Box
      sx={{
        boxSizing: 'border-box',
        display: 'block',
        maxHeight: '100%',
        maxWidth: 640,
        minWidth: 0,
        mx: '5px',
      }}
    >
      {/* Status bar: queue ticker + LED */}
      <Box
        sx={{
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'row',
          minHeight: '1.5rem',
          mb: 3,
        }}
      >
        <QueueTicker />
        <LedDot call={call} paused={paused} />
      </Box>

      {/* LCD display area */}
      <ScannerDisplay onDoubleClick={onToggleFullscreen} />

      {/* Control buttons */}
      <ControlButtons onOpenSearch={onOpenSearch} onOpenSelect={onOpenSelect} />
    </Box>
  );
}
