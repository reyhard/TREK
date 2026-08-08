import { addDayDuration, parseDayTime, type AssignmentTimeRequest } from '@trek/shared';

export interface CurrentAssignmentTiming {
  effectiveStart: string | null;
  effectiveEnd: string | null;
  recommendedDuration: number | null;
}

export class AssignmentTimingError extends Error {}

function parseStartTime(value: string): number {
  const parsed = parseDayTime(value);
  if (parsed === null) throw new AssignmentTimingError('Start time must be between 00:00 and 23:59.');
  return parsed;
}

function parseEndTime(value: string): number {
  const parsed = parseDayTime(value, { allowEndOfDay: true });
  if (parsed === null) throw new AssignmentTimingError('End time must be between 00:00 and 24:00.');
  return parsed;
}

function positiveDuration(start: string | null, end: string | null): number | null {
  if (start === null || end === null) return null;
  const duration = parseEndTime(end) - parseStartTime(start);
  if (duration <= 0) throw new AssignmentTimingError('Activity end time must be after its start time.');
  return duration;
}

function validatePositiveInterval(start: string, end: string): void {
  if (parseEndTime(end) <= parseStartTime(start)) {
    throw new AssignmentTimingError('Activity end time must be after its start time.');
  }
}

export function resolveAssignmentTiming(
  current: CurrentAssignmentTiming,
  request: AssignmentTimeRequest,
): { placeTime: string | null; endTime: string | null } {
  if (request.place_time === null) return { placeTime: null, endTime: null };

  const placeTime = request.place_time ?? current.effectiveStart;
  if (!placeTime) return { placeTime: null, endTime: request.end_time ?? current.effectiveEnd };
  parseStartTime(placeTime);

  if (Object.prototype.hasOwnProperty.call(request, 'end_time')) {
    if (request.end_time === null) return { placeTime, endTime: null };
    validatePositiveInterval(placeTime, request.end_time!);
    return { placeTime, endTime: request.end_time! };
  }

  const actual = positiveDuration(current.effectiveStart, current.effectiveEnd);
  const duration = actual ?? current.recommendedDuration ?? 60;
  const endTime = addDayDuration(placeTime, duration);
  if (!endTime) throw new AssignmentTimingError('Activity must end by 24:00.');
  return { placeTime, endTime };
}
