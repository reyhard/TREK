import { calculateRouteWithLegs } from '../components/Map/RouteCalculator'
import type { RouteSegment } from '../types'
import type {
  ConnectorProfile,
  DayMovementPlan,
  PlannedRoutedPart,
  TrackMovementPart,
  TransitMovementPart,
} from './dayMovementPlan'

export interface ResolvedRoutedPart extends PlannedRoutedPart {
  profile: ConnectorProfile
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
}

const samePoint = (left: PlannedRoutedPart['to'], right: PlannedRoutedPart['from']) =>
  left.lat === right.lat && left.lng === right.lng

const endpointGeometry = (part: PlannedRoutedPart): [number, number][] => [
  [part.from.lat, part.from.lng],
  [part.to.lat, part.to.lng],
]

const isAbortError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'

async function resolveRoutedGroup(
  group: PlannedRoutedPart[],
  profile: ConnectorProfile,
  signal?: AbortSignal,
): Promise<{ parts: ResolvedRoutedPart[]; polyline: [number, number][] }> {
  const waypoints = [
    { lat: group[0].from.lat, lng: group[0].from.lng },
    ...group.map(part => ({ lat: part.to.lat, lng: part.to.lng })),
  ]

  try {
    const result = await calculateRouteWithLegs(waypoints, { signal, profile })
    return {
      polyline: result.coordinates,
      parts: group.map((part, index) => {
        const routeSegment = result.legs[index] ?? null
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
    if (isAbortError(error)) throw error
    return {
      polyline: waypoints.map(point => [point.lat, point.lng]),
      parts: group.map(part => ({
        ...part,
        profile,
        geometry: endpointGeometry(part),
        routeSegment: null,
        distance: null,
        duration: null,
      })),
    }
  }
}

export async function resolveDayMovementPlan(
  plan: DayMovementPlan,
  profile: ConnectorProfile,
  signal?: AbortSignal,
): Promise<ResolvedDayMovementPlan> {
  const parts: ResolvedMovementPart[] = []
  const routedPolylines: [number, number][][] = []

  for (let index = 0; index < plan.parts.length;) {
    const part = plan.parts[index]
    if (part.kind !== 'routed') {
      parts.push(part)
      index += 1
      continue
    }

    const group = [part]
    index += 1
    while (index < plan.parts.length) {
      const next = plan.parts[index]
      if (next.kind !== 'routed' || !samePoint(group[group.length - 1].to, next.from)) break
      group.push(next)
      index += 1
    }

    const resolved = await resolveRoutedGroup(group, profile, signal)
    parts.push(...resolved.parts)
    routedPolylines.push(resolved.polyline)
  }

  return { dayId: plan.dayId, parts, routedPolylines }
}
