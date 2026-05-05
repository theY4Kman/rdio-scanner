import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import FolderIcon from '@mui/icons-material/Folder';
import ShareIcon from '@mui/icons-material/Share';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import TuneIcon from '@mui/icons-material/Tune';
import PodcastsIcon from '@mui/icons-material/Podcasts';
import SellIcon from '@mui/icons-material/Sell';
import ErrorIcon from '@mui/icons-material/Error';
import { useAdminStore } from '../../stores/admin';
import type { AdminConfig as AdminConfigType } from '../../types/admin';
import AccessConfig from './config/AccessConfig';
import ApiKeysConfig from './config/ApiKeysConfig';
import DirWatchConfig from './config/DirWatchConfig';
import DownstreamsConfig from './config/DownstreamsConfig';
import GroupsConfig from './config/GroupsConfig';
import OptionsConfig from './config/OptionsConfig';
import SystemsConfig from './config/SystemsConfig';
import TagsConfig from './config/TagsConfig';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export interface AdminConfigHandle {
  reset: (config?: AdminConfigType, options?: { dirty?: boolean }) => void;
  closeAll: () => void;
}

const AdminConfig = forwardRef<AdminConfigHandle>(function AdminConfig(_, ref) {
  const storeConfig = useAdminStore((s) => s.config);
  const docker = useAdminStore((s) => s.docker);
  const getConfig = useAdminStore((s) => s.getConfig);
  const saveConfig = useAdminStore((s) => s.saveConfig);

  // Local working copy of config for editing
  const [formConfig, setFormConfig] = useState<AdminConfigType | null>(null);
  const [dirty, setDirty] = useState(false);
  const [valid] = useState(true);
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({});

  // Keep a reference to the "pristine" server config
  const pristineRef = useRef<AdminConfigType | null>(null);

  // Load config on mount
  useEffect(() => {
    getConfig().then((cfg) => {
      pristineRef.current = deepClone(cfg);
      setFormConfig(deepClone(cfg));
      setDirty(false);
    });
  }, [getConfig]);

  // When store config updates (from WebSocket) and form is not dirty, refresh
  useEffect(() => {
    if (storeConfig && !dirty) {
      pristineRef.current = deepClone(storeConfig);
      setFormConfig(deepClone(storeConfig));
    }
  }, [storeConfig, dirty]);

  const reset = useCallback(
    (config?: AdminConfigType, options?: { dirty?: boolean }) => {
      const source = config ?? pristineRef.current ?? {};
      pristineRef.current = deepClone(source);
      setFormConfig(deepClone(source));
      setDirty(options?.dirty ?? false);
    },
    [],
  );

  const closeAll = useCallback(() => {
    setExpandedPanels({});
  }, []);

  useImperativeHandle(ref, () => ({ reset, closeAll }), [reset, closeAll]);

  const handleChange = useCallback((patch: Partial<AdminConfigType>) => {
    setFormConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, ...patch };
    });
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formConfig) return;
    setDirty(false);
    const saved = await saveConfig(formConfig);
    pristineRef.current = deepClone(saved);
    setFormConfig(deepClone(saved));
  }, [formConfig, saveConfig]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  const togglePanel = useCallback(
    (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpandedPanels((prev) => ({ ...prev, [panel]: isExpanded }));
    },
    [],
  );

  if (!formConfig) return null;

  const sections: {
    key: string;
    label: string;
    icon: React.ReactNode;
    hidden?: boolean;
    hasError?: boolean;
    content: React.ReactNode;
  }[] = [
    {
      key: 'access',
      label: 'Access',
      icon: <ManageAccountsIcon />,
      content: (
        <AccessConfig
          access={formConfig.access ?? []}
          systems={formConfig.systems ?? []}
          groups={formConfig.groups ?? []}
          tags={formConfig.tags ?? []}
          onChange={(access) => handleChange({ access })}
        />
      ),
    },
    {
      key: 'apiKeys',
      label: 'API Keys',
      icon: <VpnKeyIcon />,
      content: (
        <ApiKeysConfig
          apiKeys={formConfig.apiKeys ?? []}
          systems={formConfig.systems ?? []}
          groups={formConfig.groups ?? []}
          tags={formConfig.tags ?? []}
          onChange={(apiKeys) => handleChange({ apiKeys })}
        />
      ),
    },
    {
      key: 'dirWatch',
      label: 'Dirwatch',
      icon: <FolderIcon />,
      hidden: docker,
      content: (
        <DirWatchConfig
          dirWatch={formConfig.dirWatch ?? []}
          systems={formConfig.systems ?? []}
          onChange={(dirWatch) => handleChange({ dirWatch })}
        />
      ),
    },
    {
      key: 'downstreams',
      label: 'Downstreams',
      icon: <ShareIcon />,
      content: (
        <DownstreamsConfig
          downstreams={formConfig.downstreams ?? []}
          systems={formConfig.systems ?? []}
          groups={formConfig.groups ?? []}
          tags={formConfig.tags ?? []}
          onChange={(downstreams) => handleChange({ downstreams })}
        />
      ),
    },
    {
      key: 'groups',
      label: 'Groups',
      icon: <WorkspacesIcon />,
      content: (
        <GroupsConfig
          groups={formConfig.groups ?? []}
          onChange={(groups) => handleChange({ groups })}
        />
      ),
    },
    {
      key: 'options',
      label: 'Options',
      icon: <TuneIcon />,
      content: (
        <OptionsConfig
          options={formConfig.options ?? {}}
          onChange={(options) => handleChange({ options })}
        />
      ),
    },
    {
      key: 'systems',
      label: 'Systems',
      icon: <PodcastsIcon />,
      content: (
        <SystemsConfig
          systems={formConfig.systems ?? []}
          groups={formConfig.groups ?? []}
          tags={formConfig.tags ?? []}
          onChange={(systems) => handleChange({ systems })}
        />
      ),
    },
    {
      key: 'tags',
      label: 'Tags',
      icon: <SellIcon />,
      content: (
        <TagsConfig
          tags={formConfig.tags ?? []}
          onChange={(tags) => handleChange({ tags })}
        />
      ),
    },
  ];

  return (
    <Box>
      {sections
        .filter((s) => !s.hidden)
        .map((section) => (
          <Accordion
            key={section.key}
            expanded={expandedPanels[section.key] ?? false}
            onChange={togglePanel(section.key)}
            disableGutters
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              {section.icon}
              <Typography sx={{ ml: 1 }}>{section.label}</Typography>
              {section.hasError && <ErrorIcon color="warning" sx={{ ml: 1 }} />}
            </AccordionSummary>
            <AccordionDetails>{section.content}</AccordionDetails>
          </Accordion>
        ))}

      <Box
        display="flex"
        justifyContent="flex-end"
        gap={1}
        p={2}
      >
        <Button variant="outlined" disabled={!dirty} onClick={handleReset}>
          Reset
        </Button>
        <Button
          variant="contained"
          disabled={!dirty || !valid}
          onClick={handleSave}
        >
          Save
        </Button>
      </Box>
    </Box>
  );
});

export default AdminConfig;
