import { useCallback } from 'react';
import { Box } from '@mui/material';
import { QueueTicker } from './QueueTicker';
import { ScannerDisplay, LedDot } from './ScannerDisplay';
import { ControlButtons } from './ControlButtons';
import { useScannerStore } from '../../stores/scanner';
import { registerTranscriptSlot } from '../../services/extension';

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

  // Stable callback ref — registers the transcript slot element with the
  // extension API so browser extensions can inject content here.
  const transcriptSlotRef = useCallback((el: HTMLDivElement | null) => {
    registerTranscriptSlot(el);
  }, []);

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

      {/* Extension slot: transcript area (stable anchor for browser extensions) */}
      <Box id="rdio-ext-transcript-slot" ref={transcriptSlotRef} />

      {/* Control buttons */}
      <ControlButtons onOpenSearch={onOpenSearch} onOpenSelect={onOpenSelect} />
    </Box>
  );
}
