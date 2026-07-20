import type { Reservation } from '../types'

/**
 * Safely parse reservation metadata, handling both string-encoded JSON and
 * object formats. Returns an empty object for missing, malformed, or
 * non-parsable metadata. This replaces raw JSON.parse calls across the
 * transit and reservation components so malformed legacy metadata never
 * causes a render crash.
 */
export function safeParseMetadata(reservation: Pick<Reservation, 'metadata'>): Record<string, any> {
  const raw = reservation.metadata
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, any>
  if (typeof raw !== 'string') return {}
  const trimmed = raw.trim()
  if (!trimmed) return {}
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, any>
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Safely extract the transit metadata sub-object from a reservation.
 * Returns null when metadata.transit is absent, null, or does not have
 * a valid legs array — the canonical guard used by all display components.
 */
export function safeTransitMeta(reservation: Pick<Reservation, 'metadata'>): {
  legs?: Array<{
    mode?: string
    line?: string | null
    line_color?: string | null
    line_text_color?: string | null
    headsign?: string | null
    duration?: number
    stops?: number
    from?: { name?: string; time?: string | null; track?: string | null }
    to?: { name?: string; time?: string | null; track?: string | null }
  }>
  duration?: number
  transfers?: number
  walk_seconds?: number
} | null {
  const meta = safeParseMetadata(reservation)
  const transit = meta.transit
  if (!transit || typeof transit !== 'object') return null
  const t = transit as Record<string, unknown>
  if (!Array.isArray(t.legs)) return null
  return t as NonNullable<ReturnType<typeof safeTransitMeta>>
}
