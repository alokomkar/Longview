import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type { Plan, PlanGateway } from './types';

type PlanDetailsSnapshot =
  | { status: 'idle' | 'loading' | 'missing' | 'error'; plan: null }
  | { status: 'ready'; plan: Plan };

export function usePlanDetails(user: AuthUser, gateway: PlanGateway, planId: string | null, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<PlanDetailsSnapshot>({ status: 'idle', plan: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !planId) {
      setSnapshot({ status: 'idle', plan: null });
      return;
    }
    let active = true;
    setSnapshot({ status: 'loading', plan: null });
    gateway.get(user, planId).then(
      plan => { if (active) setSnapshot(plan ? { status: 'ready', plan } : { status: 'missing', plan: null }); },
      () => { if (active) setSnapshot({ status: 'error', plan: null }); }
    );
    return () => { active = false; };
  }, [attempt, enabled, gateway, planId, user]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const replace = useCallback((plan: Plan) => setSnapshot({ status: 'ready', plan }), []);
  return { snapshot, retry, replace };
}
