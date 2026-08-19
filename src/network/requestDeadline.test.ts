import { describe, expect, it, vi } from 'vitest';
import { RequestTimedOutError, withRequestDeadline } from './requestDeadline';

describe('withRequestDeadline', () => {
  it('returns a timely result and clears the deadline', async () => {
    const controller = new AbortController();
    await expect(withRequestDeadline(controller, 50, async () => 'ready')).resolves.toBe('ready');
    expect(controller.signal.aborted).toBe(false);
  });

  it('aborts a stalled request and rejects with a typed timeout', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = withRequestDeadline(controller, 10, async () => new Promise<never>(() => undefined));
    const rejection = expect(pending).rejects.toBeInstanceOf(RequestTimedOutError);
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    expect(controller.signal.aborted).toBe(true);
    vi.useRealTimers();
  });

  it('rejects invalid deadline configuration before starting work', async () => {
    const request = vi.fn(async () => 'unused');
    await expect(withRequestDeadline(new AbortController(), 0, request)).rejects.toBeInstanceOf(RangeError);
    expect(request).not.toHaveBeenCalled();
  });
});
