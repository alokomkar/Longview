import type { PortfolioEntry } from '../plan/portfolio';
import { deriveTodayStep } from '../today/deriveTodayStep';

export type ScheduleRunContext = {
  schemaVersion: 1;
  requestId: string;
  selectedDate: string;
  capacityMinutes: number;
  retryOf: string | null;
  plans: Array<{
    id: string;
    title: string;
    targetDate: string;
    weeklyHours: number;
    workingDays: NonNullable<PortfolioEntry['plan']['workingDays']>;
    mode: PortfolioEntry['mode'];
  }>;
  steps: Array<{
    planId: string;
    planTitle: string;
    title: string;
    description: string;
    durationMinutes: number;
  }>;
};

export type ScheduleBlock = {
  planId: string;
  planTitle: string;
  title: string;
  durationMinutes: number;
};

export type ScheduleRun = {
  schemaVersion: 1;
  runId: string;
  requestId: string;
  selectedDate: string;
  status: 'queued' | 'running' | 'succeeded' | 'cancelled' | 'failed' | 'timed-out';
  checkpoint: 1 | 2 | 3 | 4;
  checkpointLabel: string;
  retryOf: string | null;
  proposal: null | {
    selectedDate: string;
    capacityMinutes: number;
    totalMinutes: number;
    rationale: string;
    blocks: ScheduleBlock[];
  };
  failure: string | null;
};

export interface ScheduleRunGateway {
  start(context: ScheduleRunContext, signal: AbortSignal): Promise<ScheduleRun>;
  get(runId: string, signal: AbortSignal): Promise<ScheduleRun>;
  cancel(runId: string): Promise<ScheduleRun>;
}

export function buildScheduleRunContext(
  entries: PortfolioEntry[], selectedDate: string, capacityMinutes: number,
  requestId: string, retryOf: string | null = null,
  completedStepIds: ReadonlySet<string> = new Set()
): ScheduleRunContext | null {
  const eligible = entries
    .map(entry => ({ entry, step: deriveTodayStep([entry.plan], selectedDate) }))
    .filter((value): value is { entry: PortfolioEntry; step: NonNullable<typeof value.step> } =>
      Boolean(value.step) && !completedStepIds.has(value.step!.completionId)
    );
  if (!eligible.length || capacityMinutes < 30 || capacityMinutes > 480) return null;
  return {
    schemaVersion: 1,
    requestId,
    selectedDate,
    capacityMinutes,
    retryOf,
    plans: eligible.map(({ entry }) => ({
      id: entry.plan.id,
      title: entry.plan.title,
      targetDate: entry.plan.targetDate,
      weeklyHours: entry.plan.weeklyHours,
      workingDays: entry.plan.workingDays!,
      mode: entry.mode
    })),
    steps: eligible.map(({ step }) => ({
      planId: step.planId,
      planTitle: step.planTitle,
      title: step.title,
      description: step.description,
      durationMinutes: step.durationMinutes
    }))
  };
}

const text = (value: unknown, minimum = 1, maximum = 300): value is string =>
  typeof value === 'string' && value.length >= minimum && value.length <= maximum;
const date = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function parseScheduleRun(value: unknown): ScheduleRun | null {
  if (!value || typeof value !== 'object') return null;
  const run = value as Partial<ScheduleRun>;
  const statuses = ['queued', 'running', 'succeeded', 'cancelled', 'failed', 'timed-out'];
  if (
    run.schemaVersion !== 1 || !text(run.runId, 1, 128) || !text(run.requestId, 1, 128) ||
    !date(run.selectedDate) || !statuses.includes(run.status ?? '') ||
    ![1, 2, 3, 4].includes(run.checkpoint ?? 0) || !text(run.checkpointLabel, 3, 80) ||
    (run.retryOf !== null && run.retryOf !== undefined && !text(run.retryOf, 1, 128)) ||
    (run.failure !== null && run.failure !== undefined && !text(run.failure, 1, 160))
  ) return null;
  if (run.status === 'succeeded') {
    const proposal = run.proposal;
    if (!proposal || !date(proposal.selectedDate) || proposal.selectedDate !== run.selectedDate ||
      !Number.isInteger(proposal.capacityMinutes) || proposal.capacityMinutes! < 30 || proposal.capacityMinutes! > 480 ||
      !Number.isInteger(proposal.totalMinutes) || proposal.totalMinutes! < 1 || proposal.totalMinutes! > proposal.capacityMinutes! ||
      !text(proposal.rationale, 10, 300) || !Array.isArray(proposal.blocks) || proposal.blocks.length < 1 || proposal.blocks.length > 10 ||
      !proposal.blocks.every(block => text(block.planId, 1, 128) && text(block.planTitle, 3, 80) &&
        text(block.title, 3, 120) && Number.isInteger(block.durationMinutes) && block.durationMinutes >= 1 && block.durationMinutes <= 480) ||
      proposal.blocks.reduce((sum, block) => sum + block.durationMinutes, 0) !== proposal.totalMinutes
    ) return null;
  } else if (run.proposal !== null) return null;
  return run as ScheduleRun;
}
