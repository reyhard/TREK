import type { Reservation } from '../../types'
import { decodePolyline } from '../../utils/polyline'

export { decodePolyline } from '../../utils/polyline'

/**
 * Real-path geometry for transit journeys on the map (#1065). MOTIS delivers
 * each leg's shape as a Google-encoded polyline; we store it on
 * metadata.transit.legs[].geometry and decode it here so the map can draw the
 * actual rail/bus alignment instead of a straight line.
 */

export interface TransitMapSegment {
  coords: [number, number][]
  color: string | null
  walk: boolean
}

/**
 * The decoded per-leg segments of a transit reservation, or [] when it has no
 * stored geometry (pre-geometry entries fall back to the straight line).
 */
export function getTransitMapSegments(res: Reservation): TransitMapSegment[] {
  if (res.type !== 'transit') return []
  let meta: any = res.metadata
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta) } catch { return [] }
  }
  const legs = meta?.transit?.legs
  if (!Array.isArray(legs)) return []
  const out: TransitMapSegment[] = []
  for (const leg of legs) {
    if (!leg?.geometry || typeof leg.geometry !== 'string') continue
    const coords = decodePolyline(leg.geometry, typeof leg.geometry_precision === 'number' ? leg.geometry_precision : 6)
    if (coords.length < 2) continue
    out.push({ coords, color: leg.line_color || null, walk: leg.mode === 'WALK' })
  }
  return out
}
