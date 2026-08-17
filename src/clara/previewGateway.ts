import type { ClaraGateway } from './types';

export const previewClaraGateway: ClaraGateway = {
  async recommend(context, signal) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    return {
      schemaVersion: 1,
      requestId: context.requestId,
      sourcePlanId: context.plan.id,
      headline: 'Protect the smallest proof of progress',
      recommendation: `Finish “${context.step.title}” before adding new work to this Plan.`,
      rationale: `This creates evidence for “${context.plan.outcome}” while staying inside the current weekly allocation.`,
      confidence: 'medium',
      requiresClarification: false,
      sourceFacts: [
        `Plan: ${context.plan.title}`,
        `Target: ${context.plan.targetDate}`,
        `Available: ${context.plan.weeklyHours} hours/week`,
        `Today step: ${context.step.durationMinutes} minutes`
      ],
      proposedChange: null
    };
  }
};
