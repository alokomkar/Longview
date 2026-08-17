import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type { Plan, PlanGateway } from './types';

type PlansSnapshot =
  | { status: 'idle' | 'loading'; plans: Plan[] }
  | { status: 'ready'; plans: Plan[] }
  | { status: 'error'; plans: Plan[] };

export function usePlans(user: AuthUser, gateway: PlanGateway, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<PlansSnapshot>({ status: 'idle', plans: [] });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setSnapshot(current => ({ status: 'loading', plans: current.plans }));
    gateway.list(user).then(
      plans => { if (active) setSnapshot({ status: 'ready', plans }); },
      () => { if (active) setSnapshot(current => ({ status: 'error', plans: current.plans })); }
    );
    return () => { active = false; };
  }, [attempt, enabled, gateway, user]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const replace = useCallback((plan: Plan) => {
    setSnapshot(current => ({
      ...current,
      plans: current.plans.map(existing => existing.id === plan.id ? plan : existing)
    }));
  }, []);
  return { snapshot, retry, replace };
}
