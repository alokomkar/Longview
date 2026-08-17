import { describe, expect, it } from 'vitest';
import { previewClaraApprovalGateway } from './previewApprovalGateway';

describe('preview Clara approval gateway', () => {
  it('never simulates a durable write without the managed API', async () => {
    await expect(previewClaraApprovalGateway.apply({
      kind: 'plan-working-days', planId: 'plan-1', expectedScheduleVersion: 1,
      workingDaysBefore: ['mon'], workingDaysAfter: ['mon', 'wed'], weeklyHours: 4,
      rationale: 'A midweek checkpoint reduces the gap between sessions.',
      downstreamEffect: 'Today can select this Plan on Wednesday without changing weekly time.'
    }, 'approval-123')).rejects.toThrow('managed Clara API');
  });
});
