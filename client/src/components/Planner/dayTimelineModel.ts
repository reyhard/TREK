import { parseDayTime } from '@trek/shared'

import type { Assignment } from '../../types'

export const TIMELINE_SNAP_MINUTES = 15
export const TIMELINE_DEFAULT_START = 6 * 60
export const TIMELINE_END = 24 * 60
export const TIMELINE_PIXELS_PER_MINUTE = 1
export const TIMELINE_MIN_BLOCK_HEIGHT = 30

export interface TimelineEntry extends Assignment {
  start: number
  end: number
  duration: number
  top: number
  height: number
  lane: number
  laneCount: number
  overlapping: boolean
}

export interface TimelineResult {
  scheduled: TimelineEntry[]
  unscheduled: Assignment[]
  overlapCount: number
  gridStartMinute: number
}

interface Interval {
  assignment: Assignment
  start: number
  end: number
}

export function snapTimelineMinute(rawMinute: number, increment = TIMELINE_SNAP_MINUTES): number {
  if (!Number.isFinite(rawMinute) || !Number.isFinite(increment) || increment <= 0) return rawMinute
  return Math.round(rawMinute / increment) * increment
}

export function timelineMinuteFromPointer(
  clientY: number,
  bounds: Pick<DOMRect, 'top'>,
  startMinute: number,
  pxPerMinute: number,
): number {
  if (!Number.isFinite(pxPerMinute) || pxPerMinute <= 0) return startMinute
  return snapTimelineMinute(startMinute + (clientY - bounds.top) / pxPerMinute)
}

export function buildTimelineEntries(assignments: Assignment[]): TimelineResult {
  const { intervals, unscheduled } = splitIntervals(assignments)
  const gridStartMinute = resolveGridStart(intervals)
  const scheduled = placeIntervals(intervals, gridStartMinute)

  return {
    scheduled,
    unscheduled,
    overlapCount: scheduled.filter((entry) => entry.overlapping).length,
    gridStartMinute,
  }
}

function splitIntervals(assignments: Assignment[]): { intervals: Interval[]; unscheduled: Assignment[] } {
  const intervals: Interval[] = []
  const unscheduled: Assignment[] = []

  for (const assignment of assignments) {
    const start = parseDayTime(assignment.assignment_time)
    const end = parseDayTime(assignment.assignment_end_time, { allowEndOfDay: true })

    if (start === null || end === null || end <= start) {
      unscheduled.push(assignment)
    } else {
      intervals.push({ assignment, start, end })
    }
  }

  intervals.sort((left, right) =>
    left.start - right.start || left.end - right.end || left.assignment.id - right.assignment.id,
  )

  return { intervals, unscheduled }
}

function resolveGridStart(intervals: Interval[]): number {
  const earliestStart = intervals[0]?.start
  if (earliestStart === undefined || earliestStart >= TIMELINE_DEFAULT_START) return TIMELINE_DEFAULT_START
  return Math.floor(earliestStart / TIMELINE_SNAP_MINUTES) * TIMELINE_SNAP_MINUTES
}

function placeIntervals(intervals: Interval[], gridStartMinute: number): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  const laneEnds: number[] = []
  let groupEntries: TimelineEntry[] = []
  let groupEnd = -Infinity

  const finishGroup = () => {
    const laneCount = groupEntries.reduce((count, entry) => Math.max(count, entry.lane + 1), 0)
    const overlapping = laneCount > 1
    for (const entry of groupEntries) {
      entry.laneCount = laneCount
      entry.overlapping = overlapping
    }
  }

  for (const interval of intervals) {
    if (interval.start >= groupEnd) {
      finishGroup()
      groupEntries = []
      groupEnd = interval.end
    } else {
      groupEnd = Math.max(groupEnd, interval.end)
    }

    const lane = laneEnds.findIndex((end) => end <= interval.start)
    const assignedLane = lane === -1 ? laneEnds.length : lane
    laneEnds[assignedLane] = interval.end

    const duration = interval.end - interval.start
    const entry: TimelineEntry = {
      ...interval.assignment,
      start: interval.start,
      end: interval.end,
      duration,
      top: (interval.start - gridStartMinute) * TIMELINE_PIXELS_PER_MINUTE,
      height: Math.max(duration * TIMELINE_PIXELS_PER_MINUTE, TIMELINE_MIN_BLOCK_HEIGHT),
      lane: assignedLane,
      laneCount: 1,
      overlapping: false,
    }
    entries.push(entry)
    groupEntries.push(entry)
  }

  finishGroup()
  return entries
}
