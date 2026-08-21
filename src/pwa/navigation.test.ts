import { describe, expect, it } from 'vitest';
import { pwaNavigationFallbackDenylist } from './navigation';

describe('PWA navigation fallback exclusions', () => {
  const isDenied = (path: string) => pwaNavigationFallbackDenylist.some(pattern => pattern.test(path));

  it.each(['/__/auth/handler', '/__/auth/iframe', '/__/firebase/init.json'])(
    'keeps Firebase reserved route %s outside the app fallback',
    path => expect(isDenied(path)).toBe(true)
  );

  it.each(['/', '/plans', '/settings'])('keeps application route %s eligible', path => {
    expect(isDenied(path)).toBe(false);
  });
});
