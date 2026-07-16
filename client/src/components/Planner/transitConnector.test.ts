import { describe, expect, it } from 'vitest'
import type { MergedItem } from '../../utils/dayMerge'
import {
  getConnectorTransitPrefill,
  getNextConnectorTarget,
  isTransitMergedItem,
  normalizeTransitTime,
} from './transitConnector'

const placeItem = (
  id: number,
  name: string,
  sortKey: number,
  patch: Record<string, unknown> = {},
): MergedItem => ({
  type: 'place',
  sortKey,
  data: {
    id,
    place: { id: id + 100, name, lat: 1 + id, lng: 2 + id, ...patch },
  },
})

describe('transitConnector', () => {
  it.each([
    ['17:45', '17:45'],
    ['17:45:30', '17:45'],
    ['2026-07-16T17:45:00', '17:45'],
    ['7:05', null],
    ['25:00', null],
    [null, null],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeTransitTime(input)).toBe(expected)
  })

  it('builds adjacent-place prefill using origin end time and midpoint position', () => {
    const current = placeItem(1, 'Origin', 0, {
      place_time: '09:00',
      end_time: '09:40',
    })
    const next = placeItem(2, 'Destination', 1, { place_time: '10:15' })

    expect(getConnectorTransitPrefill(10, current, next)).toEqual({
      from: { name: 'Origin', lat: 2, lng: 3 },
      to: { name: 'Destination', lat: 3, lng: 4 },
      time: '09:40',
      placement: { dayId: 10, position: 0.5 },
    })
  })

  it('falls back to the origin start time', () => {
    const current = placeItem(1, 'Origin', 3, {
      place_time: '11:20',
      end_time: null,
    })
    const next = placeItem(2, 'Destination', 4)

    expect(getConnectorTransitPrefill(10, current, next)?.time).toBe('11:20')
  })

  it('returns null time when the origin has no usable time', () => {
    const current = placeItem(1, 'Origin', 3, {
      place_time: null,
      end_time: null,
    })
    const next = placeItem(2, 'Destination', 4)

    expect(getConnectorTransitPrefill(10, current, next)?.time).toBeNull()
  })

  it('rejects a missing endpoint coordinate', () => {
    const current = placeItem(1, 'Origin', 0, { lat: null })
    const next = placeItem(2, 'Destination', 1)

    expect(getConnectorTransitPrefill(10, current, next)).toBeNull()
  })

  it('requires the immediately following item to be a place', () => {
    const current = placeItem(1, 'Origin', 0)
    const transit: MergedItem = {
      type: 'transport',
      sortKey: 0.5,
      data: { id: 50, type: 'transit' },
    }

    expect(getConnectorTransitPrefill(10, current, transit)).toBeNull()
  })

  it('ignores notes when resolving the next connector target', () => {
    const current = placeItem(1, 'Origin', 0)
    const note: MergedItem = {
      type: 'note',
      sortKey: 0.5,
      data: { id: 40, text: 'Take a break' },
    }
    const destination = placeItem(2, 'Destination', 1)

    expect(getNextConnectorTarget([current, note, destination], 0)).toBe(destination)
  })

  it('stops at a transport even when notes precede it', () => {
    const current = placeItem(1, 'Origin', 0)
    const note: MergedItem = { type: 'note', sortKey: 0.25, data: { id: 40 } }
    const transit: MergedItem = {
      type: 'transport',
      sortKey: 0.5,
      data: { id: 50, type: 'transit' },
    }

    expect(getNextConnectorTarget([current, note, transit], 0)).toBe(transit)
  })

  it('uses a safe half-step when sort keys are not increasing', () => {
    const current = placeItem(1, 'Origin', 2)
    const next = placeItem(2, 'Destination', 2)

    expect(getConnectorTransitPrefill(10, current, next)?.placement?.position).toBe(2.5)
  })

  it('recognizes only first-class transit rows', () => {
    expect(isTransitMergedItem({
      type: 'transport',
      sortKey: 0,
      data: { type: 'transit' },
    })).toBe(true)
    expect(isTransitMergedItem({
      type: 'transport',
      sortKey: 0,
      data: { type: 'train' },
    })).toBe(false)
    expect(isTransitMergedItem(placeItem(1, 'Origin', 0))).toBe(false)
    expect(isTransitMergedItem(undefined)).toBe(false)
  })
})
