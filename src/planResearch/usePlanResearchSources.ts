import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type { PlanResearchSource, PlanResearchSourceDraft, PlanResearchSourceGateway } from './types';

type Snapshot =
  | { status: 'loading' | 'error'; values: PlanResearchSource[] | null }
  | { status: 'ready'; values: PlanResearchSource[] };

export function usePlanResearchSources(user: AuthUser, planId: string, gateway: PlanResearchSourceGateway) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: 'loading', values: null });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const activePlan = useRef(planId);

  useEffect(() => {
    activePlan.current = planId;
    let active = true;
    setSnapshot(current => ({ status: 'loading', values: current.values }));
    gateway.list(user, planId).then(
      values => { if (active && activePlan.current === planId) setSnapshot({ status: 'ready', values }); },
      () => { if (active && activePlan.current === planId) setSnapshot(current => ({ status: 'error', values: current.values })); }
    );
    return () => { active = false; };
  }, [attempt, gateway, planId, user]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const save = useCallback(async (requestId: string, draft: PlanResearchSourceDraft) => {
    if (saving) throw new Error('A source is already being saved.');
    setSaving(true);
    try {
      const result = await gateway.save(user, planId, requestId, draft);
      const values = await gateway.list(user, planId);
      if (activePlan.current === planId) setSnapshot({ status: 'ready', values });
      return result;
    } finally {
      setSaving(false);
    }
  }, [gateway, planId, saving, user]);

  return { snapshot, saving, retry, save };
}
