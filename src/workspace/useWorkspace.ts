import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type { WorkspaceGateway, WorkspaceSnapshot } from './types';

export function useWorkspace(user: AuthUser, gateway: WorkspaceGateway) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>({ status: 'loading' });

  const provision = useCallback(async () => {
    setSnapshot({ status: 'loading' });
    try {
      setSnapshot({ status: 'ready', workspace: await gateway.ensure(user) });
    } catch {
      setSnapshot({ status: 'error' });
    }
  }, [gateway, user.uid, user.isAnonymous, user.displayName]);

  useEffect(() => { void provision(); }, [provision]);
  return { snapshot, retry: provision };
}
