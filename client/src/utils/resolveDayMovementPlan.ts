import { calculateRouteWithLegs, type RouteProfileKey } from '../components/Map/RouteCalculator'
import { resolveLegMode } from '../components/Planner/legMode'
import type { RouteSegment, RouteVia } from '../types'
import type {
  DayMovementPlan,
  PlannedRoutedPart,
  TrackMovementPart,
  TransitMovementPart,
} from './dayMovementPlan'

export interface ResolvedRoutedPart extends PlannedRoutedPart {
  profile: RouteProfileKey
  geometry: [number, number][]
  distance: number | null
  duration: number | null
  routeSegment: RouteSegment | null
}

export type ResolvedMovementPart = ResolvedRoutedPart | TrackMovementPart | TransitMovementPart

export interface ResolvedDayMovementPlan {
  dayId: number
  parts: ResolvedMovementPart[]
  routedPolylines: [number, number][][]
  routedVias: RouteVia[]
}

const samePoint = (left: PlannedRoutedPart['to'], right: PlannedRoutedPart['from']) =>
  left.lat === right.lat && left.lng === right.lng

const endpointGeometry = (part: PlannedRoutedPart): [number, number][] => [
  [part.from.lat, part.from.lng],
  [part.to.lat, part.to.lng],
]

const isAbortError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'

const isValidPolyline = (coordinates: unknown): coordinates is [number, number][] =>
  Array.isArray(coordinates) &&
  coordinates.length >= 2 &&
  coordinates.every(point =>
    Array.isArray(point) &&
    point.length === 2 &&
    point.every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate)),
  )

const isHotelPlacement = (part: PlannedRoutedPart) =>
  part.placement.kind === 'hotel-top' || part.placement.kind === 'hotel-bottom'

const straightLineFallback = (
  group: PlannedRoutedPart[],
  profile: RouteProfileKey,
  legs: RouteSegment[] = [],
): { parts: ResolvedRoutedPart[]; polyline: [number, number][] } => ({
  polyline: [
    [group[0].from.lat, group[0].from.lng],
    ...group.map(part => [part.to.lat, part.to.lng] as [number, number]),
  ],
  parts: group.map((part, index) => {
    const routeSegment = legs[index] ? { ...legs[index], mode: profile } : null
    return {
      ...part,
      profile,
      geometry: endpointGeometry(part),
      routeSegment,
      distance: routeSegment?.distance ?? null,
      duration: routeSegment?.duration ?? null,
    }
  }),
})

async function resolveRoutedGroup(
  group: PlannedRoutedPart[],
  profile: RouteProfileKey,
  options: { signal?: AbortSignal; tripId?: number | string | null; dayId?: number | null },
): Promise<{ parts: ResolvedRoutedPart[]; polyline: [number, number][]; vias: RouteVia[] }> {
  const waypoints = [
    { lat: group[0].from.lat, lng: group[0].from.lng },
    ...group.map(part => ({ lat: part.to.lat, lng: part.to.lng })),
  ]

  try {
    const result = await calculateRouteWithLegs(waypoints, {
      signal: options.signal,
      profile,
      tripId: options.tripId,
      dayId: options.dayId,
    })
    if (!isValidPolyline(result.coordinates)) {
      const fallback = straightLineFallback(group, profile, result.legs)
      return { ...fallback, vias: [] }
    }
    return {
      polyline: result.coordinates,
      vias: result.vias ?? [],
      parts: group.map((part, index) => {
        const routeSegment = result.legs[index]
          ? { ...result.legs[index], mode: profile }
          : null
        return {
          ...part,
          profile,
          geometry: endpointGeometry(part),
          routeSegment,
          distance: routeSegment?.distance ?? null,
          duration: routeSegment?.duration ?? null,
        }
      }),
    }
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) throw error
    const fallback = straightLineFallback(group, profile)
    return { ...fallback, vias: [] }
  }
}

/** Resolve adjacent connectors in the same canonical mode as one route request. */
export async function resolveDayMovementPlan(
  plan: DayMovementPlan,
  dayDefaultMode: RouteProfileKey,
  options: { signal?: AbortSignal; tripId?: number | string | null; dayId?: number | null } = {},
): Promise<ResolvedDayMovementPlan> {
  const parts: ResolvedMovementPart[] = []
  const routedPolylines: [number, number][][] = []
  const routedVias: RouteVia[] = []

  for (let index = 0; index < plan.parts.length;) {
    const part = plan.parts[index]
    if (part.kind !== 'routed') {
      parts.push(part)
      index += 1
      continue
    }

    const profile = resolveLegMode(
      { ...part.from, isPlace: part.from.source === 'place' },
      { ...part.to, isPlace: part.to.source === 'place' },
      dayDefaultMode,
    ) as RouteProfileKey
    const group = [part]
    index += 1
    while (index < plan.parts.length) {
      const next = plan.parts[index]
      if (next.kind !== 'routed' || !samePoint(group[group.length - 1].to, next.from)) break
      const nextProfile = resolveLegMode(
        { ...next.from, isPlace: next.from.source === 'place' },
        { ...next.to, isPlace: next.to.source === 'place' },
        dayDefaultMode,
      ) as RouteProfileKey
      if (nextProfile !== profile || isHotelPlacement(group[group.length - 1]) || isHotelPlacement(next)) break
      group.push(next)
      index += 1
    }

    const resolved = await resolveRoutedGroup(group, profile, options)
    parts.push(...resolved.parts)
    routedPolylines.push(resolved.polyline)
    routedVias.push(...resolved.vias)
  }

  return { dayId: plan.dayId, parts, routedPolylines, routedVias }
}
