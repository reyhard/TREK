import type { Reservation } from '../../types'
import { decodePolyline } from '../../utils/polyline'

export { decodePolyline } from '../../utils/polyline'

/** Real-path geometry for transit journeys on the map. */
export interface TransitMapSegment {
  coords: [number, number][]
  color: string | null
  walk: boolean
}

/**
 * The decoded per-leg segments of a transit reservation, or [] when it has no
 * stored geometry. Older entries fall back to their endpoint straight line.
 */
export function getTransitMapSegments(res: Reservation): TransitMapSegment[] {
  if (res.type !== 'transit') return []
  let metadata: unknown = (res as Reservation & { metadata?: unknown }).metadata
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata)
    } catch {
      return []
    }
  }
  if (typeof metadata !== 'object' || metadata === null) return []
  const legs = (metadata as { transit?: { legs?: unknown } }).transit?.legs
  if (!Array.isArray(legs)) return []

  const out: TransitMapSegment[] = []
  for (const leg of legs) {
    if (typeof leg !== 'object' || leg === null) continue
    const entry = leg as {
      geometry?: unknown
      geometry_precision?: unknown
      line_color?: unknown
      mode?: unknown
    }
    if (typeof entry.geometry !== 'string' || entry.geometry.length === 0) continue
    const precision = typeof entry.geometry_precision === 'number' ? entry.geometry_precision : 6
    const coords = decodePolyline(entry.geometry, precision)
    if (coords.length < 2) continue
    out.push({
      coords,
      color: typeof entry.line_color === 'string' ? entry.line_color : null,
      walk: entry.mode === 'WALK',
    })
  }
  return out
}
