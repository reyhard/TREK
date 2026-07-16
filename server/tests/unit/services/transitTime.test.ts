import {
  assertTransitCoordinate,
  formatTransitDate,
  formatTransitTime,
  localDateTimeToUtc,
  resolveTransitTimezone,
} from '../../../src/services/transitTime';

import { describe, expect, it } from 'vitest';

describe('transitTime', () => {
  it('resolves an IANA timezone from coordinates', () => {
    expect(resolveTransitTimezone(35.6762, 139.6503)).toBe('Asia/Tokyo');
  });

  it('rejects out-of-range coordinates', () => {
    expect(() => assertTransitCoordinate(91, 13, 'origin')).toThrow('origin coordinates are invalid');
    expect(() => assertTransitCoordinate(52, 181, 'destination')).toThrow('destination coordinates are invalid');
  });

  it('converts a normal local departure to UTC', () => {
    expect(localDateTimeToUtc('2026-10-02', '09:00', 'Asia/Tokyo')).toBe('2026-10-02T00:00:00.000Z');
  });

  it('rejects a nonexistent DST wall time', () => {
    expect(() => localDateTimeToUtc('2026-03-29', '02:30', 'Europe/Berlin')).toThrow(
      'Local time does not exist in Europe/Berlin',
    );
  });

  it('chooses the earliest instant for an ambiguous DST wall time', () => {
    expect(localDateTimeToUtc('2026-10-25', '02:30', 'Europe/Berlin')).toBe('2026-10-25T00:30:00.000Z');
  });

  it('formats an instant in a requested timezone', () => {
    const iso = '2026-10-02T00:05:00.000Z';
    expect(formatTransitDate(iso, 'Asia/Tokyo')).toBe('2026-10-02');
    expect(formatTransitTime(iso, 'Asia/Tokyo')).toBe('09:05');
  });
});
