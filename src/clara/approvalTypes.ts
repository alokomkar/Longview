import type { WorkingDay } from '../plan/types';
import type { ClaraPlanScheduleChange } from './types';

export type ClaraApprovalResult = {
  schemaVersion: 1;
  idempotencyKey: string;
  planId: string;
  scheduleVersion: number;
  workingDays: WorkingDay[];
  weeklyHours: number;
  auditEventId: string;
  duplicate: boolean;
};

export interface ClaraApprovalGateway {
  apply(proposal: ClaraPlanScheduleChange, idempotencyKey: string): Promise<ClaraApprovalResult>;
}

export class ClaraApprovalConflictError extends Error {}

export function parseApprovalResult(value: unknown): ClaraApprovalResult | null {
  if (typeof value !== 'object' || value === null) return null;
  const result = value as Partial<ClaraApprovalResult>;
  if (
    result.schemaVersion !== 1 || typeof result.idempotencyKey !== 'string' ||
    result.idempotencyKey.length < 8 || typeof result.planId !== 'string' || result.planId.length < 1 ||
    !Number.isInteger(result.scheduleVersion) || (result.scheduleVersion ?? 0) < 2 ||
    !Array.isArray(result.workingDays) || result.workingDays.length < 1 || result.workingDays.length > 7 ||
    new Set(result.workingDays).size !== result.workingDays.length ||
    result.workingDays.some(day => !['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(String(day))) ||
    !Number.isInteger(result.weeklyHours) || (result.weeklyHours ?? 0) < 1 || (result.weeklyHours ?? 0) > 40 ||
    typeof result.auditEventId !== 'string' || result.auditEventId.length < 1 ||
    typeof result.duplicate !== 'boolean'
  ) return null;
  return result as ClaraApprovalResult;
}
