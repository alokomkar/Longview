import { describe, expect, it } from 'vitest';
import type { Plan } from '../plan/types';
import { buildPlanMatchRequest, parsePlanMatchResponse } from './matching';

const plan: Plan = { id: 'plan-1', clientRequestId: 'plan-1', ownerUid: 'owner', workspaceId: 'default', title: 'Launch Longview',
  outcome: 'Release a tested product to real users.', why: 'Learn what creates durable value.', targetDate: '2026-09-30', weeklyHours: 5,
  workingDays: ['mon'], status: 'active', schemaVersion: 2, scheduleVersion: 1 };
const draft = { url: 'https://example.com', title: 'Activation evidence', excerpt: 'Users need one visible useful result.', note: 'Use this for launch.', topic: 'First value' };

describe('Plan matching contract', () => {
  it('sends bounded source and active Plan summaries', () => {
    const request = buildPlanMatchRequest('match-123', draft, [plan, { ...plan, id: 'done', status: 'completed' }]);
    expect(request.plans).toHaveLength(1);
    expect(request.source).not.toHaveProperty('url');
  });

  it('accepts a correlated read-only ranking and rejects unknown or duplicate Plans', () => {
    const request = buildPlanMatchRequest('match-123', draft, [plan]);
    const valid = { schemaVersion: 1, requestId: 'match-123', requiresClarification: false, summary: 'One Plan is materially stronger.',
      candidates: [{ planId: 'plan-1', score: 88, confidence: 'high', rationale: 'The source and Plan share first-value launch context.' }] };
    expect(parsePlanMatchResponse(valid, request)).toEqual(valid);
    expect(parsePlanMatchResponse({ ...valid, candidates: [{ ...valid.candidates[0], planId: 'other' }] }, request)).toBeNull();
    expect(parsePlanMatchResponse({ ...valid, candidates: [valid.candidates[0], valid.candidates[0]] }, request)).toBeNull();
  });
});
