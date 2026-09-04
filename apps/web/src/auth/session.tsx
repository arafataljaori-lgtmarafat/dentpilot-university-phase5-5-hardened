import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SessionActorDto } from '@dentpilot/contracts';
import { api, ApiClientError, setUnauthorizedHandler } from '../api/client';

type SessionState =
  | { status: 'loading'; actor: null }
  | { status: 'anonymous'; actor: null }
  | { status: 'error'; actor: null; error: unknown }
  | { status: 'authenticated'; actor: SessionActorDto };

type SessionContextValue = SessionState & {
  login: (input: { organizationId: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading', actor: null });

  const refresh = useCallback(async () => {
    setState({ status: 'loading', actor: null });
    try {
      const actor = await api.session();
      setState({ status: 'authenticated', actor });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setState({ status: 'anonymous', actor: null });
        return;
      }
      setState({ status: 'error', actor: null, error });
      throw error;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ status: 'anonymous', actor: null }));
    refresh().catch(() => undefined);
    return () => setUnauthorizedHandler(undefined);
  }, [refresh]);

  const value = useMemo<SessionContextValue>(() => ({
    ...state,
    refresh,
    login: async (input) => {
      await api.login(input);
      await refresh();
    },
    logout: async () => {
      try {
        await api.logout();
        setState({ status: 'anonymous', actor: null });
      } catch (error) {
        setState({ status: 'error', actor: null, error });
      }
    },
  }), [refresh, state]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within SessionProvider.');
  return context;
}
