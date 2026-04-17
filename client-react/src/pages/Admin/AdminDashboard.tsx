import { useCallback, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SettingsIcon from '@mui/icons-material/Settings';
import ArticleIcon from '@mui/icons-material/Article';
import BuildIcon from '@mui/icons-material/Build';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAdminStore } from '../../stores/admin';
import AdminTodos from './AdminTodos';
import AdminConfig from './AdminConfig';
import AdminLogs from './AdminLogs';
import AdminTools from './AdminTools';
import type { AdminConfig as AdminConfigType } from '../../types/admin';

export default function AdminDashboard() {
  const logout = useAdminStore((s) => s.logout);
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({});

  const configRef = useRef<{
    reset: (config?: AdminConfigType, options?: { dirty?: boolean }) => void;
    closeAll: () => void;
  }>(null);
  const logsRef = useRef<{ reload: () => void }>(null);

  const togglePanel = useCallback(
    (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpandedPanels((prev) => ({ ...prev, [panel]: isExpanded }));
      if (!isExpanded) {
        if (panel === 'config') configRef.current?.closeAll();
        if (panel === 'tools') {
          // no-op: tools panel sub-accordions manage themselves
        }
      }
      if (isExpanded && panel === 'logs') {
        logsRef.current?.reload();
      }
    },
    [],
  );

  const handleToolsConfig = useCallback(
    (config: AdminConfigType) => {
      configRef.current?.reset(config, { dirty: true });
      setExpandedPanels((prev) => ({ ...prev, config: true }));
    },
    [],
  );

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', py: 2, px: 1 }}>
      <AdminTodos />

      <Accordion
        expanded={expandedPanels.config ?? false}
        onChange={togglePanel('config')}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <SettingsIcon sx={{ mr: 1 }} />
          <Typography>Config</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          <AdminConfig ref={configRef} />
        </AccordionDetails>
      </Accordion>

      <Accordion
        expanded={expandedPanels.logs ?? false}
        onChange={togglePanel('logs')}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <ArticleIcon sx={{ mr: 1 }} />
          <Typography>Logs</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <AdminLogs ref={logsRef} />
        </AccordionDetails>
      </Accordion>

      <Accordion
        expanded={expandedPanels.tools ?? false}
        onChange={togglePanel('tools')}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <BuildIcon sx={{ mr: 1 }} />
          <Typography>Tools</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          <AdminTools onConfig={handleToolsConfig} />
        </AccordionDetails>
      </Accordion>

      <Accordion
        expanded={false}
        onChange={() => logout()}
      >
        <AccordionSummary>
          <LogoutIcon sx={{ mr: 1 }} />
          <Typography>Logout</Typography>
        </AccordionSummary>
      </Accordion>
    </Box>
  );
}
