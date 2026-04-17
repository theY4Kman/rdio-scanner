/*
 * Admin Zustand store — replaces the Angular RdioScannerAdminService.
 *
 * Manages authentication, config CRUD, logs, password changes, and a
 * WebSocket that pushes live config updates from the server.
 */

import { create } from 'zustand';
import type { AdminConfig, LogsQuery, LogsQueryOptions } from '../types/admin';

const SESSION_STORAGE_KEY = 'rdio-scanner-admin-token';

function getToken(): string {
  return window.sessionStorage?.getItem(SESSION_STORAGE_KEY) ?? '';
}

function setToken(token: string): void {
  if (token) {
    window.sessionStorage?.setItem(SESSION_STORAGE_KEY, token);
  } else {
    window.sessionStorage?.removeItem(SESSION_STORAGE_KEY);
  }
}

function apiUrl(path: string): string {
  return `${window.location.href}/../api/admin/${path}`.replace(/([^:]\/)\/+/g, '$1');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: token } : {};
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface AdminState {
  authenticated: boolean;
  config: AdminConfig | null;
  docker: boolean;
  passwordNeedChange: boolean;
  loading: boolean;
  error: string | null;

  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  getConfig: () => Promise<AdminConfig>;
  saveConfig: (config: AdminConfig) => Promise<AdminConfig>;
  patchConfig: (config: AdminConfig) => Promise<AdminConfig>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  getLogs: (options: LogsQueryOptions) => Promise<LogsQuery | undefined>;
  setConfig: (config: AdminConfig | null) => void;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
}

// ---------------------------------------------------------------------------
// Module-level WebSocket state
// ---------------------------------------------------------------------------

let configWs: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAdminStore = create<AdminState>((set, _get) => {
  // ----- helpers -----------------------------------------------------------

  async function uploadConfig(
    method: string,
    config: AdminConfig,
  ): Promise<AdminConfig> {
    try {
      const res = await fetch(apiUrl('config'), {
        method,
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.status === 401) {
        handleUnauth();
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.config as AdminConfig;
    } catch (err) {
      set({ error: (err as Error).message });
      return config;
    }
  }

  function handleUnauth() {
    setToken('');
    closeWs();
    set({ authenticated: false, config: null });
  }

  function closeWs() {
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    if (configWs) {
      configWs.onclose = null;
      configWs.onmessage = null;
      configWs.onopen = null;
      configWs.close();
      configWs = null;
    }
  }

  function openWs() {
    const token = getToken();
    if (!token) return;

    const wsUrl = new URL(apiUrl('config'), window.location.href).href.replace(
      /^http/,
      'ws',
    );

    configWs = new WebSocket(wsUrl);

    configWs.onclose = (ev: CloseEvent) => {
      if (ev.code === 1000) {
        // Normal close — server invalidated the token
        handleUnauth();
      } else {
        wsReconnectTimer = setTimeout(() => {
          closeWs();
          openWs();
        }, 2000);
      }
    };

    configWs.onopen = () => {
      configWs?.send(token);
      if (configWs) {
        configWs.onmessage = (ev: MessageEvent<string>) => {
          try {
            const config = JSON.parse(ev.data) as AdminConfig;
            set({ config });
          } catch {
            // ignore bad json
          }
        };
      }
    };
  }

  return {
    authenticated: !!getToken(),
    config: null,
    docker: false,
    passwordNeedChange: false,
    loading: false,
    error: null,

    login: async (password: string): Promise<boolean> => {
      set({ loading: true, error: null });
      try {
        const res = await fetch(apiUrl('login'), {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        if (!res.ok) {
          set({ loading: false, error: 'Invalid password' });
          return false;
        }
        const data = await res.json();
        setToken(data.token);
        set({
          authenticated: true,
          passwordNeedChange: data.passwordNeedChange ?? false,
          loading: false,
        });
        openWs();
        return true;
      } catch (err) {
        set({ loading: false, error: (err as Error).message });
        return false;
      }
    },

    logout: async () => {
      try {
        await fetch(apiUrl('logout'), {
          method: 'POST',
          headers: authHeaders(),
        });
      } catch {
        // ignore
      }
      closeWs();
      setToken('');
      set({ authenticated: false, config: null, passwordNeedChange: false });
    },

    getConfig: async (): Promise<AdminConfig> => {
      set({ loading: true, error: null });
      try {
        const res = await fetch(apiUrl('config'), {
          headers: authHeaders(),
        });
        if (res.status === 401) {
          handleUnauth();
          throw new Error('Unauthorized');
        }
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        const newState: Partial<AdminState> = {
          config: data.config as AdminConfig,
          loading: false,
        };
        if (typeof data.docker === 'boolean') {
          newState.docker = data.docker;
        }
        if (typeof data.passwordNeedChange === 'boolean') {
          newState.passwordNeedChange = data.passwordNeedChange;
        }
        set(newState as AdminState);
        return data.config as AdminConfig;
      } catch (err) {
        set({ loading: false, error: (err as Error).message });
        return {};
      }
    },

    saveConfig: (config: AdminConfig) => uploadConfig('PUT', config),

    patchConfig: (config: AdminConfig) => uploadConfig('PATCH', config),

    changePassword: async (currentPassword: string, newPassword: string) => {
      const res = await fetch(apiUrl('password'), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.status === 401) {
        handleUnauth();
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      set({ passwordNeedChange: data.passwordNeedChange ?? false });
    },

    getLogs: async (
      options: LogsQueryOptions,
    ): Promise<LogsQuery | undefined> => {
      try {
        const res = await fetch(apiUrl('logs'), {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(options),
        });
        if (res.status === 401) {
          handleUnauth();
          return undefined;
        }
        if (!res.ok) return undefined;
        return (await res.json()) as LogsQuery;
      } catch {
        return undefined;
      }
    },

    setConfig: (config: AdminConfig | null) => set({ config }),

    connectWebSocket: () => openWs(),

    disconnectWebSocket: () => closeWs(),
  };
});
