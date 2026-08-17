import { useEffect, useMemo, useState } from 'react';
import type { AuthUser } from '../auth/types';
import type { TodayStep } from './deriveTodayStep';
import type { TodayGateway } from './types';

type CompletionsSnapshot =
  | { status: 'idle' | 'loading' | 'error'; completedStepIds: ReadonlySet<string>; signature: string }
  | { status: 'ready'; completedStepIds: ReadonlySet<string>; signature: string };

const emptyIds = new Set<string>();

export function useTodayCompletions(
  user: AuthUser,
  steps: TodayStep[],
  gateway: TodayGateway,
  enabled: boolean
) {
  const [snapshot, setSnapshot] = useState<CompletionsSnapshot>({ status: 'idle', completedStepIds: emptyIds, signature: '' });
  const [attempt, setAttempt] = useState(0);
  const signature = steps.map(step => step.completionId).join('|');

  useEffect(() => {
    if (!enabled) return;
    if (!steps.length) {
      setSnapshot({ status: 'ready', completedStepIds: emptyIds, signature });
      return;
    }
    let active = true;
    setSnapshot({ status: 'loading', completedStepIds: emptyIds, signature });
    Promise.all(steps.map(step => gateway.get(user, step))).then(
      completions => {
        if (!active) return;
        setSnapshot({
          status: 'ready',
          completedStepIds: new Set(completions.filter(Boolean).map(completion => completion!.id)),
          signature
        });
      },
      () => { if (active) setSnapshot({ status: 'error', completedStepIds: emptyIds, signature }); }
    );
    return () => { active = false; };
  }, [attempt, enabled, gateway, signature, user.uid]);

  return useMemo(() => ({
    snapshot: !enabled
      ? { status: 'idle' as const, completedStepIds: emptyIds, signature }
      : snapshot.signature === signature
        ? snapshot
        : { status: 'loading' as const, completedStepIds: emptyIds, signature },
    retry: () => setAttempt(value => value + 1)
  }), [enabled, signature, snapshot]);
}
