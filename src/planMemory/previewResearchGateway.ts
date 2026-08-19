import type { ResearchGateway } from './types';

export const previewResearchGateway: ResearchGateway = {
  async request(_user, request, signal) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const retrievedAt = new Date().toISOString();
    return {
      schemaVersion: 1,
      requestId: request.requestId,
      sourcePlanId: request.plan.id,
      cards: [{
        schemaVersion: 1,
        researchId: `${request.requestId}-card-1`.slice(0, 128),
        requestId: request.requestId,
        sourcePlanId: request.plan.id,
        headline: 'The Plan already contains a testable evidence boundary',
        finding: `The saved outcome “${request.plan.outcome}” can anchor one observable user test before the Plan expands.`,
        source: {
          kind: 'workspace',
          title: `Saved Plan · ${request.plan.title}`,
          locator: `workspace/plans/${request.plan.id}`,
          domain: null,
          publishedAt: null,
          retrievedAt
        }
      }]
    };
  }
};
