import { describe, expect, it } from 'vitest';

import { buildAssignment } from '../../../tests/helpers/factories';
import type { Assignment } from '../../types';
import {
  buildTimelineEntries,
  snapTimelineMinute,
  TIMELINE_MIN_BLOCK_HEIGHT,
  timelineMinuteFromPointer,
} from './dayTimelineModel';

function assignment(id: number, start: string | null, end: string | null): Assignment {
  return buildAssignment({ id, assignment_time: start, assignment_end_time: end });
}

describe('day timeline model', () => {
  it('snaps to the nearest 15-minute grid boundary', () => {
    expect(snapTimelineMinute(548)).toBe(555);
    expect(snapTimelineMinute(547)).toBe(540);
  });

  it('maps a pointer position into a timeline minute', () => {
    expect(timelineMinuteFromPointer(160, { top: 100 }, 360, 1)).toBe(420);
  });

  it('keeps pointer-derived starts within the selectable timeline range', () => {
    const bounds = { top: 100 };

    expect(timelineMinuteFromPointer(100, bounds, 360, 1)).toBe(360);
    expect(timelineMinuteFromPointer(80, bounds, 360, 1)).toBe(360);
    expect(timelineMinuteFromPointer(1180, bounds, 360, 1)).toBe(1425);
    expect(timelineMinuteFromPointer(1200, bounds, 360, 1)).toBe(1425);
    expect(timelineMinuteFromPointer(70, bounds, 330, 1)).toBe(330);
  });

  it('separates unscheduled assignments and marks direct overlaps', () => {
    const result = buildTimelineEntries([
      assignment(1, '09:00', '10:00'),
      assignment(2, '09:30', '10:30'),
      assignment(3, '10:30', '11:00'),
      assignment(4, null, null),
    ]);

    expect(result.unscheduled.map((entry) => entry.id)).toEqual([4]);
    expect(result.scheduled[0]).toMatchObject({ overlapping: true, lane: 0, laneCount: 2 });
    expect(result.scheduled[1]).toMatchObject({ overlapping: true, lane: 1, laneCount: 2 });
    expect(result.scheduled[2].overlapping).toBe(false);
    expect(result.overlapCount).toBe(2);
  });

  it('uses embedded legacy place times when assignment overrides are null', () => {
    const legacy = buildAssignment({
      id: 7,
      assignment_time: null,
      assignment_end_time: null,
      place: buildAssignment().place,
    });
    legacy.place.place_time = '09:00';
    legacy.place.end_time = '10:30';

    const result = buildTimelineEntries([legacy]);

    expect(result.unscheduled).toEqual([]);
    expect(result.scheduled[0]).toMatchObject({ id: 7, start: 540, end: 630, duration: 90 });
  });

  it('uses the minimum visual height for short visits', () => {
    const [entry] = buildTimelineEntries([assignment(1, '09:00', '09:05')]).scheduled;

    expect(entry).toMatchObject({ duration: 5, top: 180, height: TIMELINE_MIN_BLOCK_HEIGHT });
  });

  it('assigns the lowest available lane deterministically', () => {
    const result = buildTimelineEntries([
      assignment(3, '09:00', '10:00'),
      assignment(1, '09:00', '10:00'),
      assignment(2, '10:00', '11:00'),
    ]);

    expect(result.scheduled.map(({ id, lane, laneCount }) => ({ id, lane, laneCount }))).toEqual([
      { id: 1, lane: 0, laneCount: 2 },
      { id: 3, lane: 1, laneCount: 2 },
      { id: 2, lane: 0, laneCount: 1 },
    ]);
  });

  it('does not treat touching intervals as overlaps', () => {
    const result = buildTimelineEntries([assignment(1, '09:00', '10:00'), assignment(2, '10:00', '11:00')]);

    expect(result.scheduled.map(({ lane, laneCount, overlapping }) => ({ lane, laneCount, overlapping }))).toEqual([
      { lane: 0, laneCount: 1, overlapping: false },
      { lane: 0, laneCount: 1, overlapping: false },
    ]);
    expect(result.overlapCount).toBe(0);
  });

  it('separates touching short blocks into visual lanes without reporting a semantic overlap', () => {
    const result = buildTimelineEntries([assignment(1, '09:00', '09:05'), assignment(2, '09:05', '09:20')]);

    expect(
      result.scheduled.map(({ visualLane, visualLaneCount, overlapping }) => ({
        visualLane,
        visualLaneCount,
        overlapping,
      }))
    ).toEqual([
      { visualLane: 0, visualLaneCount: 2, overlapping: false },
      { visualLane: 1, visualLaneCount: 2, overlapping: false },
    ]);
    expect(result.overlapCount).toBe(0);
  });

  it('gives every connected overlap member the group-wide lane count', () => {
    const result = buildTimelineEntries([
      assignment(1, '09:00', '10:00'),
      assignment(2, '09:30', '10:30'),
      assignment(3, '10:15', '11:00'),
    ]);

    expect(result.scheduled.map(({ laneCount, overlapping }) => ({ laneCount, overlapping }))).toEqual([
      { laneCount: 2, overlapping: true },
      { laneCount: 2, overlapping: true },
      { laneCount: 2, overlapping: true },
    ]);
  });

  it('treats incomplete, malformed, and non-positive intervals as unscheduled', () => {
    const result = buildTimelineEntries([
      assignment(1, '09:00', null),
      assignment(2, 'invalid', '10:00'),
      assignment(3, '10:00', '10:00'),
      assignment(4, '11:00', '10:00'),
    ]);

    expect(result.scheduled).toEqual([]);
    expect(result.unscheduled.map(({ id }) => id)).toEqual([1, 2, 3, 4]);
  });

  it('expands the grid start to include an early entry', () => {
    const result = buildTimelineEntries([assignment(1, '05:30', '06:00')]);

    expect(result.gridStartMinute).toBe(330);
    expect(result.scheduled[0]).toMatchObject({ top: 0, height: 30 });
  });
});
