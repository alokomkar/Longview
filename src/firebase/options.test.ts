import { describe, expect, it } from 'vitest';
import { resolveFirebaseAuthDomain } from './options';

describe('resolveFirebaseAuthDomain', () => {
  it.each([
    ['longview.sortedqueue.com', 'longview.sortedqueue.com'],
    ['  longview.sortedqueue.com  ', 'longview.sortedqueue.com'],
    ['', 'longview-505611.firebaseapp.com'],
    ['   ', 'longview-505611.firebaseapp.com'],
    [undefined, 'longview-505611.firebaseapp.com']
  ])('resolves %s safely', (configuredDomain, expected) => {
    expect(resolveFirebaseAuthDomain(configuredDomain, 'longview-505611')).toBe(expected);
  });
});
