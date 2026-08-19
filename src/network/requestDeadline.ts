export class RequestTimedOutError extends Error {
  constructor() {
    super('Request timed out');
    this.name = 'RequestTimedOutError';
  }
}

export async function withRequestDeadline<T>(
  controller: AbortController,
  timeoutMs: number,
  request: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be positive');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new RequestTimedOutError());
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([request(controller.signal), deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export const requestTimedOut = (error: unknown): error is RequestTimedOutError =>
  error instanceof RequestTimedOutError;
