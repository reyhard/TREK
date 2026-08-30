/**
 * Daily movement totals (Task 07, F13/F14 port). Aggregates walking/driving/
 * cycling contributions from route connectors, imported tracks, transit walking
 * legs and (desktop) hotel bookends — each source contributes exactly once and
 * no distance/time is double-counted. The connector mode is the CURRENT
 * upstream per-leg resolution (the caller passes the already-resolved mode);
 * track and transit-walk sources own their modes.
 */
import type { Assignment, Place, Reservation, RouteSegment } from '../types';
import { getTrackMovement } from './trackGeometry';
import { calculatePolylineDistanceMeters } from './geoDistance';
import { decodePolyline } from '../components/Map/transitGeometry';
import type { ResolvedMovementPart } from './resolveDayMovementPlan';

export type MovementMode = 'walking' | 'driving' | 'cycling';
export type MovementSource = 'route' | 'hotel-bookend' | 'transit-walk' | 'track';

export interface MovementContribution {
  key: string;
  mode: MovementMode;
  source: MovementSource;
  sourceId: number | string;
  durationSeconds: number | null;
  distanceMeters: number | null;
}

export interface MovementTotal {
  mode: MovementMode;
  durationSeconds: number;
  distanceMeters: number;
  durationComplete: boolean;
  distanceComplete: boolean;
  contributionCount: number;
}

export interface HotelMovementLegs {
  top?: RouteSegment;
  bottom?: RouteSegment;
}

export function normalizeMovementMode(value: unknown): MovementMode {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (mode === 'driving' || mode === 'car') return 'driving';
  if (mode === 'cycling' || mode === 'bicycle' || mode === 'bike') return 'cycling';
  return 'walking';
}

function metricOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeContribution(contribution: MovementContribution): MovementContribution {
  return {
    ...contribution,
    durationSeconds: metricOrNull(contribution.durationSeconds),
    distanceMeters: metricOrNull(contribution.distanceMeters),
  };
}

export function createRouteContributions(
  dayId: number,
  mode: MovementMode,
  routeLegs: Record<number, RouteSegment>,
): MovementContribution[] {
  return Object.entries(routeLegs).map(([legId, leg]) => ({
    key: `route:${dayId}:${legId}`,
    mode: normalizeMovementMode(leg.mode ?? mode),
    source: 'route',
    sourceId: legId,
    durationSeconds: metricOrNull(leg.duration),
    distanceMeters: metricOrNull(leg.distance),
  }));
}

export function createHotelBookendContributions(
  dayId: number,
  mode: MovementMode,
  hotelLegs?: HotelMovementLegs,
): MovementContribution[] {
  if (!hotelLegs) return [];
  const out: MovementContribution[] = [];
  for (const placement of ['top', 'bottom'] as const) {
    const leg = hotelLegs[placement];
    if (!leg) continue;
    out.push({
      key: `hotel-bookend:${dayId}:${placement}`,
      mode: normalizeMovementMode(leg.mode ?? mode),
      source: 'hotel-bookend',
      sourceId: placement,
      durationSeconds: metricOrNull(leg.duration),
      distanceMeters: metricOrNull(leg.distance),
    });
  }
  return out;
}

export function aggregateMovementContributions(
  mode: MovementMode,
  contributions: MovementContribution[],
): MovementTotal {
  const unique = new Map<string, MovementContribution>();
  for (const raw of contributions) {
    if (raw.mode !== mode) continue;
    const contribution = normalizeContribution(raw);
    const existing = unique.get(contribution.key);
    if (!existing) {
      unique.set(contribution.key, contribution);
      continue;
    }
    unique.set(contribution.key, {
      ...existing,
      durationSeconds: existing.durationSeconds ?? contribution.durationSeconds,
      distanceMeters: existing.distanceMeters ?? contribution.distanceMeters,
    });
  }

  const selected = [...unique.values()];
  return {
    mode,
    durationSeconds: selected.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0),
    distanceMeters: selected.reduce((sum, item) => sum + (item.distanceMeters ?? 0), 0),
    durationComplete: selected.every(item => item.durationSeconds != null),
    distanceComplete: selected.every(item => item.distanceMeters != null),
    contributionCount: selected.length,
  };
}

interface TransitMetadataLeg {
  mode?: unknown;
  duration?: unknown;
  distance?: unknown;
  geometry?: unknown;
  geometry_precision?: unknown;
}

interface TransitMetadata {
  legs?: unknown;
  walk_seconds?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMetadata(reservation: Reservation): Record<string, unknown> | null {
  const raw: unknown = reservation.metadata;
  if (raw == null) return null;
  if (isRecord(raw)) return raw;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function transitGeometryDistance(leg: TransitMetadataLeg): number | null {
  if (typeof leg.geometry !== 'string' || leg.geometry.length === 0) return null;
  const precision = typeof leg.geometry_precision === 'number' && Number.isInteger(leg.geometry_precision)
    ? leg.geometry_precision
    : 6;
  return calculatePolylineDistanceMeters(decodePolyline(leg.geometry, precision));
}

export function createTransitWalkContributions(
  dayId: number,
  reservations: Reservation[],
  includedReservationIds?: ReadonlySet<number>,
): MovementContribution[] {
  const out: MovementContribution[] = [];
  for (const reservation of reservations) {
    if (reservation.type !== 'transit' || reservation.day_id !== dayId) continue;
    if (includedReservationIds && !includedReservationIds.has(reservation.id)) continue;
    const rawTransit = parseMetadata(reservation)?.transit;
    if (!isRecord(rawTransit)) continue;
    const transit = rawTransit as TransitMetadata;
    const legs = Array.isArray(transit.legs)
      ? transit.legs.filter(isRecord) as TransitMetadataLeg[]
      : [];
    const walkLegs = legs
      .map((leg, index) => ({ leg, index }))
      .filter(({ leg }) => typeof leg?.mode === 'string' && leg.mode.trim().toUpperCase() === 'WALK');

    if (walkLegs.length > 0) {
      for (const { leg, index } of walkLegs) {
        const persistedDistance = metricOrNull(leg.distance);
        out.push({
          key: `transit-walk:${reservation.id}:${index}`,
          mode: 'walking',
          source: 'transit-walk',
          sourceId: `${reservation.id}:${index}`,
          durationSeconds: metricOrNull(leg.duration),
          distanceMeters: persistedDistance ?? transitGeometryDistance(leg),
        });
      }
      continue;
    }

    const fallbackDuration = metricOrNull(transit.walk_seconds);
    if (fallbackDuration != null && fallbackDuration > 0) {
      out.push({
        key: `transit-walk:${reservation.id}:fallback`,
        mode: 'walking',
        source: 'transit-walk',
        sourceId: reservation.id,
        durationSeconds: fallbackDuration,
        distanceMeters: null,
      });
    }
  }
  return out;
}

export function createTrackContributions(
  dayId: number,
  assignments: Assignment[],
  places: Place[],
): MovementContribution[] {
  const fullPlaces = new Map(places.map(place => [place.id, place]));
  const out: MovementContribution[] = [];
  for (const assignment of assignments) {
    if (assignment.day_id !== dayId) continue;
    const placeId = assignment.place_id ?? assignment.place?.id;
    if (placeId == null) continue;
    const place = fullPlaces.get(placeId) ?? assignment.place;
    const movement = getTrackMovement(place);
    if (!movement) continue;
    out.push({
      key: `track:${dayId}:${assignment.id}`,
      mode: movement.mode,
      source: 'track',
      sourceId: assignment.id,
      durationSeconds: movement.duration,
      distanceMeters: movement.distance,
    });
  }
  return out;
}

export interface CalculateDayMovementInput {
  dayId: number;
  activeProfile: MovementMode;
  routeLegs: Record<number, RouteSegment>;
  hotelLegs?: HotelMovementLegs;
  assignments: Assignment[];
  places: Place[];
  reservations: Reservation[];
  movementParts?: ResolvedMovementPart[];
  routeMetricsComplete: boolean;
  routeMetricsExpected: boolean;
}

const MOVEMENT_MODES: MovementMode[] = ['walking', 'driving', 'cycling'];

function dayMovementContributions(input: CalculateDayMovementInput): MovementContribution[] {
  const mode: MovementMode = input.activeProfile;
  const contributions: MovementContribution[] = input.movementParts
    ? [
        ...input.movementParts.flatMap((part): MovementContribution[] => {
          if (part.kind === 'track') {
            return [{
              key: part.key,
              mode: part.mode,
              source: 'track' as const,
              sourceId: part.assignmentId,
              durationSeconds: part.duration,
              distanceMeters: part.distance,
            }];
          }
          if (part.kind === 'routed') {
            return [{
              key: part.key,
              mode: normalizeMovementMode(part.profile),
              source: part.placement.kind === 'hotel-top' || part.placement.kind === 'hotel-bottom'
                ? 'hotel-bookend' as const
                : 'route' as const,
              sourceId: part.key,
              durationSeconds: part.duration,
              distanceMeters: part.distance,
            }];
          }
          return [];
        }),
        ...createTransitWalkContributions(
          input.dayId,
          input.reservations,
          new Set(input.movementParts
            .filter((part): part is Extract<ResolvedMovementPart, { kind: 'transit' }> => part.kind === 'transit')
            .map(part => part.reservationId)),
        ),
      ]
    : [
        ...createRouteContributions(input.dayId, mode, input.routeLegs),
        ...createHotelBookendContributions(input.dayId, mode, input.hotelLegs),
        ...createTransitWalkContributions(input.dayId, input.reservations),
        ...createTrackContributions(input.dayId, input.assignments, input.places),
      ];
  const hasCanonicalRoutedPart = input.movementParts?.some(part => part.kind === 'routed') ?? false;
  if (input.routeMetricsExpected && !input.routeMetricsComplete && (!input.movementParts || !hasCanonicalRoutedPart)) {
    contributions.push({
      key: `route:${input.dayId}:missing`,
      mode,
      source: 'route',
      sourceId: 'missing',
      durationSeconds: null,
      distanceMeters: null,
    });
  }
  return contributions;
}

export function calculateDayMovementStats(input: CalculateDayMovementInput): MovementTotal {
  const mode: MovementMode = input.activeProfile;
  const contributions = dayMovementContributions(input);
  return aggregateMovementContributions(mode, contributions);
}

/** Calculate all mode totals from one day's resolved route and non-route sources. */
export function calculateDayMovementTotals(
  input: CalculateDayMovementInput,
): Record<MovementMode, MovementTotal> {
  return combineMovementTotals(
    MOVEMENT_MODES.map(mode => aggregateMovementContributions(mode, dayMovementContributions(input))),
  );
}

function emptyTotal(mode: MovementMode): MovementTotal {
  return {
    mode,
    durationSeconds: 0,
    distanceMeters: 0,
    durationComplete: true,
    distanceComplete: true,
    contributionCount: 0,
  };
}

export function combineMovementTotals(
  totals: MovementTotal[],
): Record<MovementMode, MovementTotal> {
  const combined: Record<MovementMode, MovementTotal> = {
    walking: emptyTotal('walking'),
    driving: emptyTotal('driving'),
    cycling: emptyTotal('cycling'),
  };
  for (const total of totals) {
    const target = combined[total.mode];
    target.durationSeconds += total.durationSeconds;
    target.distanceMeters += total.distanceMeters;
    target.durationComplete = target.durationComplete && total.durationComplete;
    target.distanceComplete = target.distanceComplete && total.distanceComplete;
    target.contributionCount += total.contributionCount;
  }
  return combined;
}
