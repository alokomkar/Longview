import { describe, expect, it } from 'vitest';
import type { Plan } from '../plan/types';
import type { TodayStep } from '../today/deriveTodayStep';
import { buildClaraContext, buildClaraPlanContext, parseClaraRecommendation } from './types';

const plan: Plan = {
  id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default',
  title: 'Launch Longview', outcome: 'Release a tested PWA to real users.',
  why: 'Validate the product direction.', targetDate: '2026-08-20', weeklyHours: 4,
  workingDays: ['mon', 'fri'], scheduleVersion: 2, status: 'active', schemaVersion: 2
};
const step: TodayStep = {
  completionId: '2026-08-17_plan-1_first-proof-v1', date: '2026-08-17', planId: 'plan-1',
  planTitle: 'Launch Longview', title: 'Define the first proof of progress',
  description: 'Write one observable result.', durationMinutes: 60, targetDate: '2026-08-20'
};

describe('Clara recommendation contract', () => {
  const context = buildClaraContext(plan, step, 'request-1');
  const valid = {
    schemaVersion: 1, requestId: 'request-1', sourcePlanId: 'plan-1',
    headline: 'Protect the smallest proof', recommendation: 'Finish the selected step before adding work.',
    rationale: 'It produces evidence for the nearest active target.', confidence: 'medium',
    requiresClarification: false, sourceFacts: ['Plan: Launch Longview'], proposedChange: null
  };

  it('sends only the selected Plan and Today step', () => {
    expect(context).toEqual({
      schemaVersion: 1, requestId: 'request-1', scope: 'today-step',
      plan: { id: 'plan-1', title: 'Launch Longview', outcome: plan.outcome, targetDate: '2026-08-20', weeklyHours: 4, workingDays: ['mon', 'fri'], scheduleVersion: 2 },
      step: { title: step.title, description: step.description, durationMinutes: 60, date: '2026-08-17' }
    });
    expect(context).not.toHaveProperty('ownerUid');
  });

  it('sends Plan-only context without inventing a step', () => {
    const planContext = buildClaraPlanContext(plan, 'request-plan');
    expect(planContext.scope).toBe('plan');
    expect(planContext).not.toHaveProperty('step');
    expect(planContext.plan.id).toBe('plan-1');
  });

  it('accepts a matching read-only response', () => {
    expect(parseClaraRecommendation(valid, context)).toEqual(valid);
  });

  it('accepts one exact Plan schedule change', () => {
    const proposedChange = {
      kind: 'plan-working-days', planId: 'plan-1', expectedScheduleVersion: 2,
      workingDaysBefore: ['mon', 'fri'], workingDaysAfter: ['mon', 'wed', 'fri'], weeklyHours: 4,
      rationale: 'A midweek checkpoint reduces the gap between sessions.',
      downstreamEffect: 'Today can select this Plan on Wednesday without changing weekly time.'
    };
    expect(parseClaraRecommendation({ ...valid, proposedChange }, context)).toEqual({ ...valid, proposedChange });
  });

  it.each([
    ['wrong request', { ...valid, requestId: 'other' }],
    ['wrong Plan', { ...valid, sourcePlanId: 'plan-2' }],
    ['unbounded change', { ...valid, proposedChange: { title: 'mutate' } }],
    ['unknown confidence', { ...valid, confidence: 'certain' }],
    ['missing sources', { ...valid, sourceFacts: [] }],
    ['oversized output', { ...valid, recommendation: 'x'.repeat(501) }]
  ])('rejects %s', (_name, value) => {
    expect(parseClaraRecommendation(value, context)).toBeNull();
  });
});
