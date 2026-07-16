import type { MergedItem } from '../../utils/dayMerge'
import type { TransitSearchPrefill } from './transitSearchTypes'

export function normalizeTransitTime(value?: string | null): string | null {
  if (!value) return null
  const match = value.match(/(?:^|T)(\d{2}):(\d{2})(?::\d{2})?/)
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return `${match[1]}:${match[2]}`
}

export function getConnectorTransitPrefill(
  dayId: number,
  current: MergedItem,
  next: MergedItem | undefined,
): TransitSearchPrefill | null {
  if (current.type !== 'place' || next?.type !== 'place') return null

  const from = current.data?.place
  const to = next.data?.place
  if (!from || !to) return null
  if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) {
    return null
  }

  const currentKey = Number(current.sortKey)
  const nextKey = Number(next.sortKey)
  const position =
    Number.isFinite(currentKey) &&
    Number.isFinite(nextKey) &&
    nextKey > currentKey
      ? currentKey + (nextKey - currentKey) / 2
      : currentKey + 0.5

  return {
    from: { name: from.name, lat: from.lat, lng: from.lng },
    to: { name: to.name, lat: to.lat, lng: to.lng },
    time: normalizeTransitTime(from.end_time) ?? normalizeTransitTime(from.place_time),
    placement: { dayId, position },
  }
}

export function isTransitMergedItem(item: MergedItem | undefined): boolean {
  return item?.type === 'transport' && item.data?.type === 'transit'
}
