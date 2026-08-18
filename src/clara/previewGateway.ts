import type { ClaraGateway } from './types';
import { formatLongDate } from '../date/formatLongDate';

export const previewClaraGateway: ClaraGateway = {
  async recommend(context, signal) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const isStep = context.scope === 'today-step';
    return {
      schemaVersion: 1,
      requestId: context.requestId,
      sourcePlanId: context.plan.id,
      headline: 'Protect the smallest proof of progress',
      recommendation: isStep
        ? `Finish “${context.step.title}” before adding new work to this Plan.`
        : `Define one observable proof for “${context.plan.title}” before expanding its scope.`,
      rationale: `This creates evidence for “${context.plan.outcome}” while staying inside the current weekly allocation.`,
      confidence: 'medium',
      requiresClarification: false,
      sourceFacts: [
        `Plan: ${context.plan.title}`,
        `Target: ${formatLongDate(context.plan.targetDate)}`,
        `Available: ${context.plan.weeklyHours} hours/week`,
        ...(isStep ? [`Today step: ${context.step.durationMinutes} minutes`] : [])
      ],
      proposedChange: null
    };
  }
};
