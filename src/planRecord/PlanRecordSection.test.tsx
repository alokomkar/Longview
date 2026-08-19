import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import type { ClaraRecommendation } from '../clara/types';
import { PlanRecordSection } from './PlanRecordSection';
import { PlanRecordConflictError, planRecordFingerprint, type PlanRecord, type PlanRecordDraft, type PlanRecordGateway } from './types';

const user: AuthUser = { uid: 'owner', displayName: null, isAnonymous: true };
const recommendation: ClaraRecommendation = {
  schemaVersion: 1, requestId: 'request-123', sourcePlanId: 'plan-1', headline: 'Release, then learn',
  recommendation: 'Interview five users after the first release.',
  rationale: 'The Plan needs evidence from real usage.', confidence: 'medium', requiresClarification: false,
  sourceFacts: ['The Plan is ready for its first users.'], proposedChange: null
};

function record(draft: PlanRecordDraft, recordId: string): PlanRecord {
  return {
    ...draft, recordId, planId: 'plan-1', ownerUid: 'owner', workspaceId: 'default',
    requestFingerprint: planRecordFingerprint(draft), schemaVersion: 1, recordedAt: '2026-08-19T08:00:00.000Z'
  };
}

function statefulGateway(failure?: Error) {
  let values: PlanRecord[] = [];
  const gateway: PlanRecordGateway = {
    load: vi.fn(async () => ({ records: values, history: [] })),
    create: vi.fn(async (_user, _planId, id, draft) => {
      if (failure) throw failure;
      const existing = values.find(value => value.recordId === id);
      if (existing) return { record: existing, duplicate: true };
      const saved = record(draft, id);
      values = [saved, ...values];
      return { record: saved, duplicate: false };
    })
  };
  return gateway;
}

describe('PlanRecordSection', () => {
  beforeEach(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }));

  it('requires exact review before saving a decision and shows the authoritative reload', async () => {
    const gateway = statefulGateway();
    render(<PlanRecordSection user={user} planId="plan-1" gateway={gateway} guidance={null} onCancelGuidance={vi.fn()} onGuidanceSaved={vi.fn()} />);
    await screen.findByText('No completed steps or approved schedule changes have been recorded yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Add decision' }));
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'Ship the narrow release first.' } });
    fireEvent.change(screen.getByLabelText('Why this choice?'), { target: { value: 'It creates a trustworthy feedback loop.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review decision' }));
    expect(screen.getByRole('heading', { name: 'Ship the narrow release first.' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(await screen.findByText('Decision saved.')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Decisions' }));
    expect(await screen.findByText('It creates a trustworthy feedback loop.')).toBeVisible();
    expect(gateway.create).toHaveBeenCalledOnce();
    expect(gateway.load).toHaveBeenCalledTimes(2);
  });

  it('keeps the decision draft through cancellation and performs no write', async () => {
    const gateway = statefulGateway();
    render(<PlanRecordSection user={user} planId="plan-1" gateway={gateway} guidance={null} onCancelGuidance={vi.fn()} onGuidanceSaved={vi.fn()} />);
    await screen.findByText(/No completed steps/);
    fireEvent.click(screen.getByRole('button', { name: 'Add decision' }));
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'Keep this exact draft.' } });
    fireEvent.change(screen.getByLabelText('Why this choice?'), { target: { value: 'The user may want to revise it before saving.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review decision' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel review' }));
    expect(screen.getByLabelText('Decision')).toHaveValue('Keep this exact draft.');
    expect(gateway.create).not.toHaveBeenCalled();
  });

  it('reviews and retains the exact Clara recommendation without changing the Plan', async () => {
    const gateway = statefulGateway();
    const saved = vi.fn();
    render(<PlanRecordSection user={user} planId="plan-1" gateway={gateway} guidance={recommendation} onCancelGuidance={vi.fn()} onGuidanceSaved={saved} />);
    expect(await screen.findByRole('heading', { name: 'Keep this recommendation with the Plan?' })).toBeVisible();
    expect(screen.getByText('medium')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save to this Plan' }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(gateway.create).toHaveBeenCalledWith(user, 'plan-1', expect.any(String), expect.objectContaining({
      kind: 'clara-guidance', sourceRecommendationId: 'request-123'
    }));
  });

  it.each([
    [new PlanRecordConflictError(), 'This save no longer matches its review.'],
    [new Error('unavailable'), 'The record could not be confirmed.']
  ])('fails safely and keeps the reviewed decision retryable', async (failure, message) => {
    const gateway = statefulGateway(failure);
    render(<PlanRecordSection user={user} planId="plan-1" gateway={gateway} guidance={recommendation} onCancelGuidance={vi.fn()} onGuidanceSaved={vi.fn()} />);
    await screen.findByRole('button', { name: 'Save to this Plan' });
    fireEvent.click(screen.getByRole('button', { name: 'Save to this Plan' }));
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save to this Plan' })).toBeEnabled();
  });

  it('classifies a disconnected save and preserves the unsaved guidance', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    render(<PlanRecordSection user={user} planId="plan-1" gateway={statefulGateway(new Error('offline'))} guidance={recommendation} onCancelGuidance={vi.fn()} onGuidanceSaved={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save to this Plan' }));
    expect(await screen.findByText('You’re offline.')).toBeVisible();
    expect(screen.getByText(recommendation.recommendation)).toBeVisible();
  });
});
