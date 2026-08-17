import type { ScheduleBlock, ScheduleRun } from '../scheduleRun/types';

export type ApprovedDayBlock = ScheduleBlock & { order: number };

export type ApprovedDay = {
  schemaVersion: 1;
  selectedDate: string;
  revision: number;
  sourceRunId: string;
  capacityMinutes: number;
  totalMinutes: number;
  blocks: ApprovedDayBlock[];
  status: 'approved' | 'break';
  approvalEventId: string;
  breakEventId?: string | null;
  carryoverCount?: number | null;
};

export type DayApprovalRequest = {
  schemaVersion: 1;
  idempotencyKey: string;
  expectedDayRevision: number;
  replaceCurrent: boolean;
};

export type DayApprovalResult = {
  schemaVersion: 1;
  idempotencyKey: string;
  duplicate: boolean;
  approvedDay: ApprovedDay;
};

export interface ApprovedDayGateway {
  get(selectedDate: string, signal: AbortSignal): Promise<ApprovedDay | null>;
  approve(runId: string, request: DayApprovalRequest, signal: AbortSignal): Promise<DayApprovalResult>;
}

export class ApprovedDayConflictError extends Error {}

const text = (value: unknown, minimum = 1, maximum = 300): value is string =>
  typeof value === 'string' && value.length >= minimum && value.length <= maximum;
const date = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function parseApprovedDay(value: unknown): ApprovedDay | null {
  if (!value || typeof value !== 'object') return null;
  const day = value as Partial<ApprovedDay>;
  if (
    day.schemaVersion !== 1 || !date(day.selectedDate) || !Number.isInteger(day.revision) || (day.revision ?? 0) < 1 ||
    !text(day.sourceRunId, 1, 128) || !Number.isInteger(day.capacityMinutes) || (day.capacityMinutes ?? 0) < 30 || (day.capacityMinutes ?? 0) > 480 ||
    !Number.isInteger(day.totalMinutes) || (day.totalMinutes ?? 0) < 1 || (day.totalMinutes ?? 0) > (day.capacityMinutes ?? 0) ||
    !['approved', 'break'].includes(day.status ?? '') || !text(day.approvalEventId, 8, 128) ||
    (day.status === 'approved' && (day.breakEventId != null || day.carryoverCount != null)) ||
    (day.status === 'break' && (!text(day.breakEventId, 8, 128) || !Number.isInteger(day.carryoverCount) || (day.carryoverCount ?? 0) < 1 || (day.carryoverCount ?? 0) > 10)) ||
    !Array.isArray(day.blocks) ||
    day.blocks.length < 1 || day.blocks.length > 10 || !day.blocks.every((block, index) =>
      block.order === index + 1 && text(block.planId, 1, 128) && text(block.planTitle, 3, 80) &&
      text(block.title, 3, 120) && Number.isInteger(block.durationMinutes) && block.durationMinutes >= 1 && block.durationMinutes <= 480
    ) || day.blocks.reduce((sum, block) => sum + block.durationMinutes, 0) !== day.totalMinutes
  ) return null;
  return day as ApprovedDay;
}

export function parseDayApprovalResult(value: unknown): DayApprovalResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Partial<DayApprovalResult>;
  const approvedDay = parseApprovedDay(result.approvedDay);
  if (
    result.schemaVersion !== 1 || !text(result.idempotencyKey, 8, 128) ||
    typeof result.duplicate !== 'boolean' || !approvedDay
  ) return null;
  return { ...result, approvedDay } as DayApprovalResult;
}

export function canApproveRun(run: ScheduleRun): boolean {
  return run.status === 'succeeded' && run.checkpoint === 4 && run.proposal !== null;
}
