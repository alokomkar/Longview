import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import { AvailabilityConflictError, type AvailabilityGateway } from './types';
import { useAvailability } from './useAvailability';

const user: AuthUser = { uid: 'owner', isAnonymous: false, displayName: 'Owner' };
const draft = { workingDays: ['mon', 'wed'] as const, weeklyHours: 10, preferredTime: 'morning' as const };

describe('useAvailability', () => {
  it('loads, saves, and advances the accepted version', async () => {
    const gateway: AvailabilityGateway = {
      load: vi.fn(async () => null),
      save: vi.fn(async (_user, value, expectedVersion) => ({ ...value, schemaVersion: 1, version: expectedVersion + 1 }))
    };
    const { result } = renderHook(() => useAvailability(user, gateway));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    await act(async () => { expect(await result.current.save({ ...draft, workingDays: [...draft.workingDays] })).toBe(true); });
    expect(result.current.snapshot).toMatchObject({ status: 'ready', availability: { version: 1 } });
    expect(gateway.save).toHaveBeenCalledWith(user, expect.anything(), 0);
  });

  it.each([
    [new AvailabilityConflictError(), 'conflict'],
    [new Error('offline'), 'unavailable']
  ])('keeps the accepted value when save fails %#', async (failure, expected) => {
    const accepted = { ...draft, workingDays: [...draft.workingDays], schemaVersion: 1 as const, version: 2 };
    const gateway: AvailabilityGateway = {
      load: vi.fn(async () => accepted),
      save: vi.fn(async () => { throw failure; })
    };
    const { result } = renderHook(() => useAvailability(user, gateway));
    await waitFor(() => expect(result.current.snapshot.status).toBe('ready'));
    await act(async () => { expect(await result.current.save({ ...draft, workingDays: [...draft.workingDays] })).toBe(false); });
    expect(result.current.saveFailure).toBe(expected);
    expect(result.current.snapshot).toMatchObject({ status: 'ready', availability: { version: 2 } });
  });
});
