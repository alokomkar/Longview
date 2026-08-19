import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type {
  AchievementBundle,
  AchievementGateway,
  FinishAchievementRequest,
  RevokeReuseRequest
} from './types';

type Snapshot =
  | { status: 'idle' | 'loading' | 'error'; bundle: AchievementBundle | null }
  | { status: 'ready'; bundle: AchievementBundle };

export function useAchievement(user: AuthUser, planId: string, gateway: AchievementGateway, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: 'idle', bundle: null });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setSnapshot(current => ({ status: 'loading', bundle: current.bundle }));
    gateway.load(user, planId).then(
      bundle => { if (active) setSnapshot({ status: 'ready', bundle }); },
      () => { if (active) setSnapshot(current => ({ status: 'error', bundle: current.bundle })); }
    );
    return () => { active = false; };
  }, [attempt, enabled, gateway, planId, user]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);

  return useMemo(() => ({
    snapshot,
    saving,
    revoking,
    retry,
    async finish(request: FinishAchievementRequest) {
      setSaving(true);
      try {
        const result = await gateway.finish(user, planId, request);
        setSnapshot({ status: 'ready', bundle: result.bundle });
        return result;
      } finally {
        setSaving(false);
      }
    },
    async revoke(request: RevokeReuseRequest) {
      setRevoking(true);
      try {
        const result = await gateway.revokeReuse(user, planId, request);
        setSnapshot(current => current.bundle ? {
          status: 'ready',
          bundle: { ...current.bundle, consent: result.consent, consentVersion: result.consent.version }
        } : current);
        return result;
      } finally {
        setRevoking(false);
      }
    }
  }), [gateway, planId, retry, revoking, saving, snapshot, user]);
}
