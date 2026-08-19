import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type { PlanRecordBundle, PlanRecordDraft, PlanRecordGateway, PlanRecordResult } from './types';

type Snapshot =
  | { status: 'idle' | 'loading' | 'error'; bundle: PlanRecordBundle | null }
  | { status: 'ready'; bundle: PlanRecordBundle };

export function usePlanRecords(user: AuthUser, planId: string | null, gateway: PlanRecordGateway, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: 'idle', bundle: null });
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const activePlan = useRef(planId);

  useEffect(() => {
    activePlan.current = planId;
    if (!enabled || !planId) {
      setSnapshot(current => ({ status: 'idle', bundle: current.bundle }));
      return;
    }
    let active = true;
    setSnapshot(current => ({ status: 'loading', bundle: current.bundle }));
    gateway.load(user, planId).then(
      bundle => { if (active && activePlan.current === planId) setSnapshot({ status: 'ready', bundle }); },
      () => { if (active && activePlan.current === planId) setSnapshot(current => ({ status: 'error', bundle: current.bundle })); }
    );
    return () => { active = false; };
  }, [attempt, enabled, gateway, planId, user]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const create = useCallback(async (recordId: string, draft: PlanRecordDraft): Promise<PlanRecordResult> => {
    if (!planId || saving) throw new Error('Plan record save is unavailable.');
    setSaving(true);
    try {
      const result = await gateway.create(user, planId, recordId, draft);
      const bundle = await gateway.load(user, planId);
      if (activePlan.current === planId) setSnapshot({ status: 'ready', bundle });
      return result;
    } finally {
      setSaving(false);
    }
  }, [gateway, planId, saving, user]);

  return { snapshot, saving, retry, create };
}
