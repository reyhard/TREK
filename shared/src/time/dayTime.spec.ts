import { addDayDuration, formatDayTime, parseDayTime } from './dayTime';

import { describe, expect, it } from 'vitest';

describe('parseDayTime', () => {
  it('converts a same-day time to minutes after midnight', () => {
    expect(parseDayTime('09:15')).toBe(555);
  });

  it('only accepts midnight at the end of day when enabled', () => {
    expect(parseDayTime('24:00')).toBeNull();
    expect(parseDayTime('24:00', { allowEndOfDay: true })).toBe(1440);
  });
});

describe('formatDayTime', () => {
  it('formats end of day only when enabled', () => {
    expect(formatDayTime(1440, { allowEndOfDay: true })).toBe('24:00');
  });
});

describe('addDayDuration', () => {
  it('adds a duration without crossing into the next day', () => {
    expect(addDayDuration('09:15', 90)).toBe('10:45');
  });

  it('rejects a duration that crosses into the next day', () => {
    expect(addDayDuration('23:30', 60)).toBeNull();
  });
});
