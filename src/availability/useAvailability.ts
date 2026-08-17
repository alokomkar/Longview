import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '../auth/types';
import {
  AvailabilityConflictError,
  type Availability,
  type AvailabilityDraft,
  type AvailabilityGateway
} from './types';

type Snapshot =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; availability: Availability | null };

export type AvailabilitySaveFailure = 'conflict' | 'unavailable';

export function useAvailability(user: AuthUser, gateway: AvailabilityGateway) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: 'loading' });
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<AvailabilitySaveFailure | null>(null);

  const load = useCallback(async () => {
    setSnapshot({ status: 'loading' });
    setSaveFailure(null);
    try {
      setSnapshot({ status: 'ready', availability: await gateway.load(user) });
    } catch {
      setSnapshot({ status: 'error' });
    }
  }, [gateway, user.uid]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (draft: AvailabilityDraft) => {
    if (saving || snapshot.status !== 'ready') return false;
    setSaving(true);
    setSaveFailure(null);
    try {
      const availability = await gateway.save(user, draft, snapshot.availability?.version ?? 0);
      setSnapshot({ status: 'ready', availability });
      return true;
    } catch (error) {
      setSaveFailure(error instanceof AvailabilityConflictError ? 'conflict' : 'unavailable');
      return false;
    } finally {
      setSaving(false);
    }
  }, [gateway, saving, snapshot, user]);

  return { snapshot, saving, saveFailure, retry: load, save };
}
