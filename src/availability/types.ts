import type { AuthUser } from '../auth/types';

export const workingDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WorkingDay = typeof workingDays[number];
export type PreferredTime = 'morning' | 'afternoon' | 'evening';

export type AvailabilityDraft = {
  workingDays: WorkingDay[];
  weeklyHours: number;
  preferredTime: PreferredTime;
};

export type Availability = AvailabilityDraft & {
  schemaVersion: 1;
  version: number;
};

export type AvailabilityErrors = Partial<Record<keyof AvailabilityDraft, string>>;

export interface AvailabilityGateway {
  load(user: AuthUser): Promise<Availability | null>;
  save(user: AuthUser, draft: AvailabilityDraft, expectedVersion: number): Promise<Availability>;
}

export class AvailabilityConflictError extends Error {
  constructor() {
    super('Availability changed in another session.');
    this.name = 'AvailabilityConflictError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function validateAvailabilityDraft(draft: AvailabilityDraft): AvailabilityErrors {
  const errors: AvailabilityErrors = {};
  const uniqueDays = new Set(draft.workingDays);
  if (draft.workingDays.length < 1 || uniqueDays.size !== draft.workingDays.length ||
      draft.workingDays.some(day => !workingDays.includes(day))) {
    errors.workingDays = 'Choose at least one working day.';
  }
  if (!Number.isInteger(draft.weeklyHours) || draft.weeklyHours < 1 || draft.weeklyHours > 40) {
    errors.weeklyHours = 'Choose 1–40 hours each week.';
  }
  if (!['morning', 'afternoon', 'evening'].includes(draft.preferredTime)) {
    errors.preferredTime = 'Choose a preferred time.';
  }
  return errors;
}

export function parseStoredAvailability(value: unknown): Availability | null {
  if (!isRecord(value)) return null;
  const candidate = value as Partial<Availability>;
  if (candidate.schemaVersion !== 1 || !Number.isInteger(candidate.version) || (candidate.version ?? 0) < 1 ||
      !Array.isArray(candidate.workingDays) || !Number.isInteger(candidate.weeklyHours) ||
      typeof candidate.preferredTime !== 'string') return null;
  const draft = {
    workingDays: candidate.workingDays,
    weeklyHours: candidate.weeklyHours,
    preferredTime: candidate.preferredTime
  } as AvailabilityDraft;
  return Object.keys(validateAvailabilityDraft(draft)).length === 0
    ? { ...draft, schemaVersion: 1, version: candidate.version as number }
    : null;
}
