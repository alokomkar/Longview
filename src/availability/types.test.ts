import { describe, expect, it } from 'vitest';
import { parseStoredAvailability, validateAvailabilityDraft } from './types';

describe('availability validation', () => {
  it('accepts a bounded unique schedule', () => {
    expect(validateAvailabilityDraft({
      workingDays: ['mon', 'wed', 'fri'], weeklyHours: 10, preferredTime: 'morning'
    })).toEqual({});
  });

  it.each([
    [{ workingDays: [], weeklyHours: 10, preferredTime: 'morning' }, 'workingDays'],
    [{ workingDays: ['mon', 'mon'], weeklyHours: 10, preferredTime: 'morning' }, 'workingDays'],
    [{ workingDays: ['mon'], weeklyHours: 0, preferredTime: 'morning' }, 'weeklyHours'],
    [{ workingDays: ['mon'], weeklyHours: 41, preferredTime: 'morning' }, 'weeklyHours'],
    [{ workingDays: ['mon'], weeklyHours: 10, preferredTime: 'night' }, 'preferredTime']
  ])('rejects invalid boundary %#', (draft, field) => {
    expect(validateAvailabilityDraft(draft as never)).toHaveProperty(field);
  });

  it('fails closed on malformed stored data', () => {
    expect(parseStoredAvailability({
      workingDays: ['mon'], weeklyHours: 10, preferredTime: 'morning', schemaVersion: 1, version: 1
    })).toMatchObject({ version: 1 });
    expect(parseStoredAvailability({
      workingDays: [], weeklyHours: 10, preferredTime: 'morning', schemaVersion: 1, version: 1
    })).toBeNull();
    expect(parseStoredAvailability({
      workingDays: ['mon'], weeklyHours: 10, preferredTime: 'morning', schemaVersion: 2, version: 1
    })).toBeNull();
  });
});
