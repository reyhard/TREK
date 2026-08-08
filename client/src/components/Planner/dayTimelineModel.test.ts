import { describe, expect, it } from 'vitest';

import {
  buildAssignment,
  buildDay,
  buildDayNote,
  buildReservation,
} from '../../../tests/helpers/factories';
import type { Assignment, Day, Reservation } from '../../types';
import {
  buildTimelineContextEntries,
  buildTimelineEntries,
  layoutTimelineVisualItems,
  resolveTimelineGridStart,
  snapTimelineMinute,
  TIMELINE_MIN_BLOCK_HEIGHT,
  timelineMinuteFromPointer,
} from './dayTimelineModel';

function assignment(id: number, start: string | null, end: string | null): Assignment {
  return buildAssignment({ id, assignment_time: start, assignment_end_time: end });
}

const contextDay = buildDay({ id: 10, day_number: 1, date: '2026-08-08' });
const nextContextDay = buildDay({ id: 11, day_number: 2, date: '2026-08-09' });
const lastContextDay = buildDay({ id: 12, day_number: 3, date: '2026-08-10' });
const contextDays: Day[] = [contextDay, nextContextDay, lastContextDay];

function transport(id: number, overrides: Partial<Reservation> = {}): Reservation {
  return buildReservation({
    id,
    day_id: contextDay.id,
    type: 'train',
    title: `Transport ${id}`,
    ...overrides,
  });
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

  describe('timeline context projection', () => {
    it('accepts strict clocks and complete ISO clocks without converting their written local time', () => {
      const reservations = [
        transport(101, { reservation_time: '05:10' }),
        transport(102, { reservation_time: '2026-08-08T09:30' }),
        transport(103, { reservation_time: '2026-08-08T11:45:20.125Z' }),
        transport(104, { reservation_time: '2026-08-08T23:50:59-14:00' }),
      ];

      const result = buildTimelineContextEntries({
        day: contextDay,
        days: contextDays,
        reservations,
        notes: [],
      });

      expect(result.scheduled.map(({ key, start, end }) => ({ key, start, end }))).toEqual([
        { key: 'transport:101:leg:single:day:10:phase:single', start: 310, end: 325 },
        { key: 'transport:102:leg:single:day:10:phase:single', start: 570, end: 585 },
        { key: 'transport:103:leg:single:day:10:phase:single', start: 705, end: 720 },
        { key: 'transport:104:leg:single:day:10:phase:single', start: 1425, end: 1440 },
      ]);
      expect(result.untimed).toEqual([]);
    });

    it('rejects descriptive and malformed clocks while allowing 24:00 only for an arrival', () => {
      const reservations = [
        transport(111, { reservation_time: '9:00' }),
        transport(112, { reservation_time: '09:00 departure' }),
        transport(113, { reservation_time: '2026-13-08T09:00' }),
        transport(114, { reservation_time: '2026-08-08 09:00' }),
        transport(115, { reservation_time: '24:00' }),
        transport(116, { reservation_time: null, reservation_end_time: '24:00' }),
      ];

      const result = buildTimelineContextEntries({
        day: contextDay,
        days: contextDays,
        reservations,
        notes: [],
      });

      expect(result.scheduled).toHaveLength(1);
      expect(result.scheduled[0]).toMatchObject({
        key: 'transport:116:leg:single:day:10:phase:single',
        start: 1425,
        end: 1440,
        duration: 15,
        height: TIMELINE_MIN_BLOCK_HEIGHT,
      });
      expect(result.untimed.map(({ key }) => key)).toEqual([
        'transport:111:leg:single:day:10:phase:single',
        'transport:112:leg:single:day:10:phase:single',
        'transport:113:leg:single:day:10:phase:single',
        'transport:114:leg:single:day:10:phase:single',
        'transport:115:leg:single:day:10:phase:single',
      ]);
    });

    it('projects single-day intervals and markers and preserves the original reservation for callbacks', () => {
      const interval = transport(121, { reservation_time: '09:00', reservation_end_time: '10:20' });
      const startOnly = transport(122, { reservation_time: '11:00', reservation_end_time: null });
      const arrivalOnly = transport(123, { reservation_time: 'bad', reservation_end_time: '12:30' });

      const result = buildTimelineContextEntries({
        day: contextDay,
        days: contextDays,
        reservations: [interval, startOnly, arrivalOnly],
        notes: [],
      });

      expect(result.scheduled.map(({ key, start, end, duration, height }) => ({ key, start, end, duration, height })))
        .toEqual([
          {
            key: 'transport:121:leg:single:day:10:phase:single',
            start: 540,
            end: 620,
            duration: 80,
            height: 80,
          },
          {
            key: 'transport:122:leg:single:day:10:phase:single',
            start: 660,
            end: 675,
            duration: 15,
            height: 30,
          },
          {
            key: 'transport:123:leg:single:day:10:phase:single',
            start: 750,
            end: 765,
            duration: 15,
            height: 30,
          },
        ]);
      const scheduledInterval = result.scheduled[0];
      expect(scheduledInterval.kind).toBe('transport');
      if (scheduledInterval.kind !== 'transport') throw new Error('Expected a transport context entry');
      expect(scheduledInterval).toMatchObject({
        kind: 'transport',
        title: 'Transport 121',
        reservation: interval,
        sourceReservation: interval,
      });
      expect(scheduledInterval.sourceReservation).toBe(interval);
    });

    it('uses only the clock belonging to each multi-day phase and leaves middle phases untimed', () => {
      const spanning = transport(131, {
        day_id: contextDay.id,
        end_day_id: lastContextDay.id,
        reservation_time: '07:15',
        reservation_end_time: '18:40',
      });

      const departure = buildTimelineContextEntries({
        day: contextDay,
        days: contextDays,
        reservations: [spanning],
        notes: [],
      });
      const middle = buildTimelineContextEntries({
        day: nextContextDay,
        days: contextDays,
        reservations: [spanning],
        notes: [],
      });
      const arrival = buildTimelineContextEntries({
        day: lastContextDay,
        days: contextDays,
        reservations: [spanning],
        notes: [],
      });

      expect(departure.scheduled[0]).toMatchObject({ start: 435, end: 450 });
      expect(middle.scheduled).toEqual([]);
      expect(middle.untimed[0]).toMatchObject({
        key: 'transport:131:leg:single:day:11:phase:middle',
      });
      expect(arrival.scheduled[0]).toMatchObject({ start: 1120, end: 1135 });

      const invalidPhaseClocks = [
        transport(132, {
          day_id: contextDay.id,
          end_day_id: nextContextDay.id,
          reservation_time: 'invalid',
          reservation_end_time: '18:00',
        }),
        transport(133, {
          day_id: contextDay.id,
          end_day_id: nextContextDay.id,
          reservation_time: '08:00',
          reservation_end_time: 'invalid',
        }),
      ];

      expect(buildTimelineContextEntries({
        day: contextDay,
        days: contextDays,
        reservations: [invalidPhaseClocks[0]],
        notes: [],
      }).scheduled).toEqual([]);
      expect(buildTimelineContextEntries({
        day: nextContextDay,
        days: contextDays,
        reservations: [invalidPhaseClocks[1]],
        notes: [],
      }).scheduled).toEqual([]);
    });

    it('expands multi-leg transport keys and keeps the unprojected source reservation', () => {
      const source = transport(141, {
        type: 'flight',
        metadata: JSON.stringify({
          legs: [
            { dep_day_id: 10, arr_day_id: 10, dep_time: '08:00', arr_time: '09:00' },
            { dep_day_id: 10, arr_day_id: 10, dep_time: '10:00', arr_time: '11:30' },
          ],
        }),
      });

      const result = buildTimelineContextEntries({
        day: contextDay,
        days: contextDays,
        reservations: [source],
        notes: [],
      });

      expect(result.scheduled.map(({ key }) => key)).toEqual([
        'transport:141:leg:0:day:10:phase:single',
        'transport:141:leg:1:day:10:phase:single',
      ]);
      const [firstLeg, secondLeg] = result.scheduled;
      expect(firstLeg.kind).toBe('transport');
      if (firstLeg.kind !== 'transport') throw new Error('Expected the first leg to be transport context');
      expect(secondLeg.kind).toBe('transport');
      if (secondLeg.kind !== 'transport') throw new Error('Expected the second leg to be transport context');
      expect(firstLeg.reservation).not.toBe(source);
      expect(firstLeg.reservation.__leg).toMatchObject({ index: 0, total: 2 });
      expect(firstLeg.sourceReservation).toBe(source);
      expect(secondLeg.sourceReservation).toBe(source);
    });

    it('includes transport types even when assignment-linked and excludes hotels and other bookings', () => {
      const reservations = [
        transport(151, { type: 'bus', assignment_id: 900, reservation_time: '08:00' }),
        transport(152, { type: 'hotel', reservation_time: '09:00' }),
        transport(153, { type: 'restaurant', reservation_time: '10:00' }),
      ];

      const result = buildTimelineContextEntries({
        day: contextDay,
        days: contextDays,
        reservations,
        notes: [],
      });

      const reservationIds = result.scheduled.map((entry) => {
        expect(entry.kind).toBe('transport');
        if (entry.kind !== 'transport') throw new Error('Expected only transport context entries');
        return entry.reservation.id;
      });
      expect(reservationIds).toEqual([151]);
      expect(result.untimed).toEqual([]);
    });

    it('projects valid note clocks as markers and preserves malformed or absent-time notes as untimed', () => {
      const timed = buildDayNote({ id: 161, day_id: contextDay.id, text: 'Board ferry', time: '05:45' });
      const malformed = buildDayNote({ id: 162, day_id: contextDay.id, text: 'Breakfast', time: 'around 8' });
      const untimed = buildDayNote({ id: 163, day_id: contextDay.id, text: 'Buy tickets', time: null });

      const result = buildTimelineContextEntries({
        day: contextDay,
        days: contextDays,
        reservations: [],
        notes: [timed, malformed, untimed],
      });

      expect(result.scheduled).toEqual([
        {
          kind: 'note',
          key: 'note:161',
          title: 'Board ferry',
          note: timed,
          start: 345,
          end: 360,
          duration: 15,
          height: 30,
        },
      ]);
      expect(result.untimed).toEqual([
        { kind: 'note', key: 'note:162', title: 'Breakfast', note: malformed },
        { kind: 'note', key: 'note:163', title: 'Buy tickets', note: untimed },
      ]);
    });
  });

  describe('combined timeline visual layout', () => {
    it('expands the grid start for context before 06:00', () => {
      expect(resolveTimelineGridStart([540, 315, 600])).toBe(315);
      expect(resolveTimelineGridStart([360, 900])).toBe(360);
      expect(resolveTimelineGridStart([])).toBe(360);
    });

    it('places colliding activity and context blocks in separate visual lanes', () => {
      expect(layoutTimelineVisualItems([
        { key: 'activity:1', start: 540, end: 600, height: 60 },
        { key: 'note:2', start: 570, end: 585, height: 30 },
      ], 360)).toEqual([
        { key: 'activity:1', top: 180, height: 60, visualLane: 0, visualLaneCount: 2 },
        { key: 'note:2', top: 210, height: 30, visualLane: 1, visualLaneCount: 2 },
      ]);
    });

    it('reuses a lane when minimum-height marker boundaries touch visually', () => {
      expect(layoutTimelineVisualItems([
        { key: 'note:first', start: 540, end: 555, height: 30 },
        { key: 'note:second', start: 570, end: 585, height: 30 },
      ], 360)).toEqual([
        { key: 'note:first', top: 180, height: 30, visualLane: 0, visualLaneCount: 1 },
        { key: 'note:second', top: 210, height: 30, visualLane: 0, visualLaneCount: 1 },
      ]);
    });

    it('sorts deterministically by start, end, and key without mutating its input', () => {
      const items = [
        { key: 'z', start: 600, end: 630, height: 30 },
        { key: 'b', start: 540, end: 600, height: 60 },
        { key: 'a', start: 540, end: 600, height: 60 },
        { key: 'short', start: 540, end: 570, height: 30 },
      ];
      const original = items.map((item) => ({ ...item }));

      expect(layoutTimelineVisualItems(items, 360).map(({ key, visualLane }) => ({ key, visualLane }))).toEqual([
        { key: 'short', visualLane: 0 },
        { key: 'a', visualLane: 1 },
        { key: 'b', visualLane: 2 },
        { key: 'z', visualLane: 0 },
      ]);
      expect(items).toEqual(original);
    });

    it('does not change activity overlap semantics when context shares visual space', () => {
      const activities = buildTimelineEntries([
        assignment(171, '09:00', '09:05'),
        assignment(172, '09:05', '09:20'),
      ]);
      const semanticBefore = activities.scheduled.map(({ id, lane, laneCount, overlapping }) => ({
        id,
        lane,
        laneCount,
        overlapping,
      }));

      const layout = layoutTimelineVisualItems([
        ...activities.scheduled.map(({ id, start, end, height }) => ({
          key: `activity:${id}`,
          start,
          end,
          height,
        })),
        { key: 'transport:173', start: 540, end: 555, height: 30 },
      ], activities.gridStartMinute);

      expect(layout.map(({ key, visualLane, visualLaneCount }) => ({ key, visualLane, visualLaneCount }))).toEqual([
        { key: 'activity:171', visualLane: 0, visualLaneCount: 3 },
        { key: 'transport:173', visualLane: 1, visualLaneCount: 3 },
        { key: 'activity:172', visualLane: 2, visualLaneCount: 3 },
      ]);
      expect(activities.scheduled.map(({ id, lane, laneCount, overlapping }) => ({
        id,
        lane,
        laneCount,
        overlapping,
      }))).toEqual(semanticBefore);
      expect(activities.overlapCount).toBe(0);
    });
  });
});
