import { describe, expect, it } from 'vitest';
import { formatLongDate } from './formatLongDate';

describe('formatLongDate', () => {
  it.each([
    ['2026-08-17', '17th August 2026'],
    ['2026-01-01', '1st January 2026'],
    ['2026-01-02', '2nd January 2026'],
    ['2026-01-03', '3rd January 2026'],
    ['2026-01-04', '4th January 2026'],
    ['2026-01-11', '11th January 2026'],
    ['2026-01-12', '12th January 2026'],
    ['2026-01-13', '13th January 2026'],
    ['2026-01-21', '21st January 2026'],
    ['2026-01-22', '22nd January 2026'],
    ['2026-01-23', '23rd January 2026'],
    ['2026-01-31', '31st January 2026'],
    ['2028-02-29', '29th February 2028']
  ])('formats %s without locale or timezone drift', (value, expected) => {
    expect(formatLongDate(value)).toBe(expected);
  });

  it.each(['', 'not-a-date', '2026-02-29', '2026-02-30', '2026-13-01'])('preserves invalid values safely', value => {
    expect(formatLongDate(value)).toBe(value);
  });
});
