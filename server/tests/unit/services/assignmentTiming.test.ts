import { AssignmentTimingError, resolveAssignmentTiming } from '../../../src/nest/common/assignmentTiming';

import { describe, expect, it } from 'vitest';

describe('resolveAssignmentTiming', () => {
  it('derives an initial end time from the recommended duration', () => {
    expect(
      resolveAssignmentTiming(
        { effectiveStart: null, effectiveEnd: null, recommendedDuration: 90 },
        { place_time: '09:00' },
      ),
    ).toEqual({ placeTime: '09:00', endTime: '10:30' });
  });

  it('preserves the actual duration when moving an assignment', () => {
    expect(
      resolveAssignmentTiming(
        { effectiveStart: '09:00', effectiveEnd: '10:15', recommendedDuration: 60 },
        { place_time: '13:00' },
      ),
    ).toEqual({ placeTime: '13:00', endTime: '14:15' });
  });

  it('keeps an explicitly requested end time', () => {
    expect(
      resolveAssignmentTiming(
        { effectiveStart: '09:00', effectiveEnd: '10:15', recommendedDuration: 60 },
        { place_time: '13:00', end_time: '13:30' },
      ),
    ).toEqual({ placeTime: '13:00', endTime: '13:30' });
  });

  it('clears both times when the start is explicitly null', () => {
    expect(
      resolveAssignmentTiming(
        { effectiveStart: '09:00', effectiveEnd: '10:15', recommendedDuration: 60 },
        { place_time: null, end_time: null },
      ),
    ).toEqual({ placeTime: null, endTime: null });
  });

  it('clears an end-only assignment when the end is explicitly null', () => {
    expect(
      resolveAssignmentTiming(
        { effectiveStart: null, effectiveEnd: '10:00', recommendedDuration: 60 },
        { end_time: null },
      ),
    ).toEqual({ placeTime: null, endTime: null });
  });

  it('rejects a malformed explicit end time when no start exists', () => {
    expect(() =>
      resolveAssignmentTiming(
        { effectiveStart: null, effectiveEnd: '10:00', recommendedDuration: 60 },
        { end_time: 'invalid' },
      ),
    ).toThrow(AssignmentTimingError);
  });

  it('rejects a derived end time after the end of the day', () => {
    expect(() =>
      resolveAssignmentTiming(
        { effectiveStart: null, effectiveEnd: null, recommendedDuration: 60 },
        { place_time: '23:30' },
      ),
    ).toThrow(AssignmentTimingError);
  });

  it('rejects malformed effective times', () => {
    expect(() =>
      resolveAssignmentTiming(
        { effectiveStart: 'morning', effectiveEnd: '10:15', recommendedDuration: 60 },
        { place_time: '13:00' },
      ),
    ).toThrow(AssignmentTimingError);
  });

  it('rejects an explicit end time before the start', () => {
    expect(() =>
      resolveAssignmentTiming(
        { effectiveStart: null, effectiveEnd: null, recommendedDuration: 60 },
        { place_time: '13:00', end_time: '12:30' },
      ),
    ).toThrow(AssignmentTimingError);
  });
});
