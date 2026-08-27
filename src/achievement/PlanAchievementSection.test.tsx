import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import type { Plan } from '../plan/types';
import { PlanAchievementSection } from './PlanAchievementSection';
import {
  AchievementConflictError,
  achievementFingerprint,
  reuseConsentFingerprint,
  type AchievementBundle,
  type AchievementGateway
} from './types';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const plan: Plan = {
  id: 'plan-123', clientRequestId: 'plan-123', ownerUid: 'owner', workspaceId: 'default', title: 'Release Longview',
  outcome: 'Release a tested planning workflow.', why: 'Real users need a usable outcome.', targetDate: '2026-09-30',
  weeklyHours: 6, workingDays: ['wed'], status: 'active', schemaVersion: 2, scheduleVersion: 1
};

function statefulGateway(failure?: Error) {
  let bundle: AchievementBundle = { completedStepIds: ['completion-123'], requiredStepIds: ['first-proof-v1'], eligible: true, achievement: null, reflection: null, consent: null, consentVersion: 0 };
  const gateway: AchievementGateway = {
    load: vi.fn(async () => bundle),
    finish: vi.fn(async (_user, _planId, request) => {
      if (failure) throw failure;
      const draft = request.draft;
      const reflectionId = Object.values(draft.reflection).some(Boolean) ? request.reflectionId : null;
      const recordedAt = '2026-08-19T08:00:00.000Z';
      bundle = {
        ...bundle, eligible: true, consentVersion: 1,
        achievement: { schemaVersion: 1, achievementId: request.achievementId, planId: plan.id, ownerUid: user.uid, workspaceId: 'default', outcome: draft.outcome, evidence: draft.evidence, completedStepIds: request.completedStepIds, expectedPlanRevision: 1, reflectionId, requestFingerprint: achievementFingerprint(request), recordedAt },
        reflection: reflectionId ? { schemaVersion: 1, reflectionId, achievementId: request.achievementId, planId: plan.id, ownerUid: user.uid, workspaceId: 'default', ...draft.reflection, recordedAt } : null,
        consent: { schemaVersion: 1, consentId: request.consentId, achievementId: request.achievementId, reflectionId, planId: plan.id, ownerUid: user.uid, workspaceId: 'default', purpose: 'future_plan_guidance', approvedReflectionFields: draft.approvedReflectionFields, version: 1, previousConsentId: null, requestFingerprint: reuseConsentFingerprint(request.achievementId, reflectionId, draft.approvedReflectionFields, 1, null), recordedAt }
      };
      const completedPlan: Plan = { ...plan, status: 'completed', schemaVersion: 3, achievementId: request.achievementId, completedAt: recordedAt, completionVersion: 1 };
      return { bundle, plan: completedPlan, duplicate: false };
    }),
    revokeReuse: vi.fn(async (_user, _planId, request) => {
      const current = bundle.consent!;
      bundle = { ...bundle, consentVersion: request.expectedConsentVersion + 1, consent: { ...current, consentId: request.consentId, approvedReflectionFields: [], version: request.expectedConsentVersion + 1, previousConsentId: current.consentId } };
      return { consent: bundle.consent!, duplicate: false };
    })
  };
  return gateway;
}

async function reachConsent() {
  fireEvent.click(await screen.findByRole('button', { name: 'Finish Plan' }));
  fireEvent.change(screen.getByLabelText('Measurable outcome'), { target: { value: 'Released one tested planning workflow.' } });
  fireEvent.change(screen.getByLabelText('Evidence label'), { target: { value: 'Production acceptance' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to reflection' }));
  fireEvent.change(screen.getByLabelText('What worked'), { target: { value: 'Small releases worked.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Choose what Clara may reuse' }));
}

describe('PlanAchievementSection', () => {
  beforeEach(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }));

  it('blocks finishing until the required completion exists', async () => {
    const gateway = statefulGateway();
    gateway.load = vi.fn(async (): Promise<AchievementBundle> => ({ completedStepIds: [], requiredStepIds: ['first-proof-v1'], eligible: false, achievement: null, reflection: null, consent: null, consentVersion: 0 }));
    render(<PlanAchievementSection user={user} plan={plan} gateway={gateway} onPlanCompleted={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'This Plan is not ready to finish.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Finish Plan' })).not.toBeInTheDocument();
  });

  it('saves evidence with default-deny consent, then restores an immutable achievement', async () => {
    const gateway = statefulGateway();
    const completed = vi.fn();
    render(<PlanAchievementSection user={user} plan={plan} gateway={gateway} onPlanCompleted={completed} />);
    await reachConsent();
    expect(screen.getByText('Reuse is off.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Review finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish and save' }));
    expect(await screen.findByText('Your completed journey.')).toBeVisible();
    expect(gateway.finish).toHaveBeenCalledWith(user, plan.id, expect.objectContaining({ draft: expect.objectContaining({ approvedReflectionFields: [] }) }));
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });

  it('finishes without creating a reflection when reflection is skipped', async () => {
    const gateway = statefulGateway();
    render(<PlanAchievementSection user={user} plan={plan} gateway={gateway} onPlanCompleted={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Finish Plan' }));
    fireEvent.change(screen.getByLabelText('Measurable outcome'), { target: { value: 'Released one tested planning workflow.' } });
    fireEvent.change(screen.getByLabelText('Evidence label'), { target: { value: 'Production acceptance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to reflection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip reflection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish and save' }));
    await waitFor(() => expect(gateway.finish).toHaveBeenCalledWith(user, plan.id, expect.objectContaining({ draft: expect.objectContaining({ reflection: { whatWorked: '', whatChanged: '', doDifferently: '' } }) })));
  });

  it('requires exact field selection and supports explicit future-reuse revocation', async () => {
    const gateway = statefulGateway();
    render(<PlanAchievementSection user={user} plan={plan} gateway={gateway} onPlanCompleted={vi.fn()} />);
    await reachConsent();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow Clara to reuse What worked' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review finish' }));
    expect(screen.getByText('Small releases worked.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Finish and save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop future reuse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm stop future reuse' }));
    expect(await screen.findByRole('heading', { name: 'Reuse is off.' })).toBeVisible();
    expect(gateway.revokeReuse).toHaveBeenCalledOnce();
  });

  it('pauses at the current screen without writing and restores the draft', async () => {
    const gateway = statefulGateway();
    render(<PlanAchievementSection user={user} plan={plan} gateway={gateway} onPlanCompleted={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Finish Plan' }));
    fireEvent.change(screen.getByLabelText('Measurable outcome'), { target: { value: 'Keep this measurable outcome draft.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel finishing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue finishing' }));
    expect(screen.getByLabelText('Measurable outcome')).toHaveValue('Keep this measurable outcome draft.');
    expect(gateway.finish).not.toHaveBeenCalled();
  });

  it.each([
    [new AchievementConflictError(), true, 'This Plan changed in another tab.', 1],
    [new Error('offline'), false, 'You’re offline.', 0]
  ])('keeps reviewed data safe when completion fails', async (failure, online, message, expectedCalls) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
    const gateway = statefulGateway(failure);
    render(<PlanAchievementSection user={user} plan={plan} gateway={gateway} onPlanCompleted={vi.fn()} />);
    await reachConsent();
    fireEvent.click(screen.getByRole('button', { name: 'Review finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish and save' }));
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByText('Released one tested planning workflow.')).toBeVisible();
    await waitFor(() => expect(gateway.finish).toHaveBeenCalledTimes(expectedCalls));
  });
});
