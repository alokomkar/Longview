import type { ApprovedDay } from '../approvedDay/types';

export type DayBreakCarryover = {
  order: number;
  planId: string;
  planTitle: string;
  title: string;
  durationMinutes: number;
  destinationDate: string;
  scheduleVersion: number;
};

export type DayBreakPreview = {
  schemaVersion: 1;
  selectedDate: string;
  expectedDayRevision: number;
  sourceApprovalEventId: string;
  carryovers: DayBreakCarryover[];
};

export type DayBreakRequest = {
  schemaVersion: 1;
  idempotencyKey: string;
  expectedDayRevision: number;
  carryovers: DayBreakCarryover[];
};

export type DayBreakResult = {
  schemaVersion: 1;
  idempotencyKey: string;
  duplicate: boolean;
  breakDay: ApprovedDay;
  carryovers: DayBreakCarryover[];
};

export type DayBreakFailure =
  | 'source-changed'
  | 'future-approved'
  | 'no-eligible-day'
  | 'unavailable';

export class DayBreakConflictError extends Error {
  constructor(public readonly reason: Exclude<DayBreakFailure, 'unavailable'>) {
    super(reason);
  }
}

export interface DayBreakGateway {
  preview(selectedDate: string, signal: AbortSignal): Promise<DayBreakPreview>;
  confirm(selectedDate: string, request: DayBreakRequest, signal: AbortSignal): Promise<DayBreakResult>;
}

const text = (value: unknown, minimum = 1, maximum = 300): value is string =>
  typeof value === 'string' && value.length >= minimum && value.length <= maximum;
const calendarDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

function parseCarryovers(value: unknown): DayBreakCarryover[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return null;
  if (!value.every((item, index) => item && typeof item === 'object' &&
    item.order === index + 1 && text(item.planId, 1, 128) && text(item.planTitle, 3, 80) &&
    text(item.title, 3, 120) && Number.isInteger(item.durationMinutes) && item.durationMinutes >= 1 && item.durationMinutes <= 480 &&
    calendarDate(item.destinationDate) && Number.isInteger(item.scheduleVersion) && item.scheduleVersion >= 1
  )) return null;
  return value as DayBreakCarryover[];
}

export function parseDayBreakPreview(value: unknown): DayBreakPreview | null {
  if (!value || typeof value !== 'object') return null;
  const preview = value as Partial<DayBreakPreview>;
  const carryovers = parseCarryovers(preview.carryovers);
  if (preview.schemaVersion !== 1 || !calendarDate(preview.selectedDate) ||
    !Number.isInteger(preview.expectedDayRevision) || (preview.expectedDayRevision ?? 0) < 1 ||
    !text(preview.sourceApprovalEventId, 8, 128) || !carryovers) return null;
  return { ...preview, carryovers } as DayBreakPreview;
}

export function parseDayBreakResult(value: unknown, parseDay: (value: unknown) => ApprovedDay | null): DayBreakResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Partial<DayBreakResult>;
  const carryovers = parseCarryovers(result.carryovers);
  const breakDay = parseDay(result.breakDay);
  if (result.schemaVersion !== 1 || !text(result.idempotencyKey, 8, 128) ||
    typeof result.duplicate !== 'boolean' || !carryovers || !breakDay || breakDay.status !== 'break' ||
    breakDay.carryoverCount !== carryovers.length) return null;
  return { ...result, breakDay, carryovers } as DayBreakResult;
}
