/**
 * Track-aware day movement plan (Task 07, F13 port). Given a day's ordered
 * places + transports, produce an ordered list of movement parts where an
 * imported track is represented by ONE `track` part (its geometry is drawn from
 * the imported route, never re-routed) and the normal router only ever computes
 * the CONNECTORS outside each track span. This is the pure decision core that
 * prevents drawing/counting a duplicate A→B routed segment over an imported
 * track.
 */
import type { Assignment, Place, Reservation, Day, Accommodation } from '../types';
import { getTrackMovement, type TrackMovementMetrics } from './trackGeometry';
import {
  getTransportForDay,
  getMergedItems,
  getTransportRouteEndpoints,
  getSpanPhase,
  TRANSPORT_TYPES,
} from './dayMerge';
import { getDayBookendHotels, shouldDrawEveningLeg, shouldDrawMorningLeg } from './dayOrder';

export type ConnectorProfile = 'driving' | 'walking' | 'cycling';

export interface MovementAnchor {
  lat: number;
  lng: number;
  source: 'place' | 'track-start' | 'track-end' | 'transport-from' | 'transport-to' | 'accommodation';
  leg_transport_mode?: string | null;
  incoming_leg_transport_mode?: string | null;
  assignmentId?: number;
  reservationId?: number;
  placeId?: number;
}

export type ConnectorPlacement =
  | { kind: 'after-assignment'; assignmentId: number }
  | { kind: 'after-reservation'; reservationId: number }
  | { kind: 'hotel-top'; dayId: number; name: string }
  | { kind: 'hotel-bottom'; dayId: number; name: string };

export interface PlannedRoutedPart {
  kind: 'routed';
  key: string;
  from: MovementAnchor;
  to: MovementAnchor;
  placement: ConnectorPlacement;
}

export interface TrackMovementPart extends TrackMovementMetrics {
  kind: 'track';
  key: string;
  assignmentId: number;
  placeId: number;
  from: MovementAnchor;
  to: MovementAnchor;
}

export interface TransitMovementPart {
  kind: 'transit';
  key: string;
  reservationId: number;
}

export type PlannedMovementPart = PlannedRoutedPart | TrackMovementPart | TransitMovementPart;

export interface DayMovementPlan {
  dayId: number;
  parts: PlannedMovementPart[];
  hasRoutedConnectors: boolean;
  hasTracks: boolean;
  hasTransit: boolean;
}

export interface BuildDayMovementPlanOptions {
  day: Day;
  days: Day[];
  assignments: Assignment[];
  places: Place[];
  reservations: Reservation[];
  accommodations: Accommodation[];
  optimizeFromAccommodation?: boolean;
}

interface Cursor {
  anchor: MovementAnchor;
  placement: ConnectorPlacement;
  hasPlace: boolean;
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const samePoint = (a: Pick<MovementAnchor, 'lat' | 'lng'>, b: Pick<MovementAnchor, 'lat' | 'lng'>) =>
  a.lat === b.lat && a.lng === b.lng;
const anchorKey = (anchor: MovementAnchor) => `${anchor.lat},${anchor.lng}`;
const placementKey = (placement: ConnectorPlacement) => {
  switch (placement.kind) {
    case 'after-assignment': return `assignment-${placement.assignmentId}`;
    case 'after-reservation': return `reservation-${placement.reservationId}`;
    case 'hotel-top': return `hotel-top-${placement.dayId}`;
    case 'hotel-bottom': return `hotel-bottom-${placement.dayId}`;
  }
};
const routedKey = (placement: ConnectorPlacement, from: MovementAnchor, to: MovementAnchor) =>
  `routed:${placementKey(placement)}:${anchorKey(from)}>${anchorKey(to)}`;
const trackKey = (assignmentId: number, from: MovementAnchor, to: MovementAnchor) =>
  `track:assignment-${assignmentId}:${anchorKey(from)}>${anchorKey(to)}`;
const transitKey = (reservationId: number) => `transit:reservation-${reservationId}`;

/**
 * Build the ordered movement plan for a day. The rule that prevents double
 * counting: a place carrying an imported track splits the timeline into
 * [connector → track-start][track][track-end → connector]; the track part is
 * the imported geometry (contributes once) and the normal router never draws a
 * routed segment spanning the track.
 */
export function buildDayMovementPlan(options: BuildDayMovementPlanOptions): DayMovementPlan {
  const { day, days, assignments, places, reservations, accommodations } = options;
  const parts: PlannedMovementPart[] = [];
  let cursor: Cursor | null = null;
  const addConnector = (from: Cursor, to: MovementAnchor, placement = from.placement) => {
    if (samePoint(from.anchor, to)) return;
    parts.push({ kind: 'routed', key: routedKey(placement, from.anchor, to), from: from.anchor, to, placement });
  };
  const fullPlace = (assignment: Assignment): Place | Assignment['place'] =>
    places.find(place => place.id === assignment.place.id) ?? assignment.place;
  const locatedAssignments = assignments
    .filter(assignment => assignment.day_id === day.id)
    .slice()
    .sort((a, b) => a.order_index - b.order_index);
  const positionedReservations = reservations
    .filter(reservation => TRANSPORT_TYPES.has(reservation.type))
    .map(reservation => {
      const currentPosition = reservation.day_positions?.[day.id] ?? reservation.day_positions?.[String(day.id)];
      return currentPosition == null && reservation.day_plan_position != null
        ? {
            ...reservation,
            day_positions: { ...reservation.day_positions, [day.id]: reservation.day_plan_position },
          }
        : reservation;
    });
  const transports = getTransportForDay({
    reservations: positionedReservations,
    dayId: day.id,
    dayAssignmentIds: locatedAssignments.map(assignment => assignment.id),
    days,
  });
  const timeline = getMergedItems({
    dayAssignments: locatedAssignments,
    dayNotes: [],
    dayTransports: transports,
    dayId: day.id,
  }).filter(item => item.type !== 'note');

  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  const edgeInfo = (item: typeof first, evening = false) => {
    if (!item || item.type !== 'place') return item ? { isPlace: false, time: null } : undefined;
    const place = fullPlace(item.data);
    return { isPlace: true, time: evening ? (place.end_time ?? place.place_time) : place.place_time };
  };
  const useHotels = options.optimizeFromAccommodation !== false;
  const bookends = useHotels ? getDayBookendHotels(day, days, accommodations) : {};
  const hotelAnchor = (hotel: Accommodation | undefined): MovementAnchor | null =>
    hotel && finite(hotel.place_lat) && finite(hotel.place_lng)
      ? { lat: hotel.place_lat, lng: hotel.place_lng, source: 'accommodation', placeId: hotel.place_id ?? undefined }
      : null;
  const morning = hotelAnchor(bookends.morning);
  const evening = hotelAnchor(bookends.evening);
  const drawMorning = !!morning && shouldDrawMorningLeg(bookends, day, edgeInfo(first));
  const drawEvening = !!evening && shouldDrawEveningLeg(bookends, day, edgeInfo(last, true));
  if (drawMorning && morning) {
    cursor = {
      anchor: morning,
      placement: { kind: 'hotel-top', dayId: day.id, name: bookends.morning?.place_name ?? '' },
      hasPlace: true,
    };
  }

  for (const item of timeline) {
    if (item.type === 'place') {
      const assignment = item.data as Assignment;
      const place = fullPlace(assignment);
      const movement = getTrackMovement(place);
      if (movement) {
        const { start, end, ...metrics } = movement;
        const from: MovementAnchor = {
          lat: start[0], lng: start[1], source: 'track-start',
          assignmentId: assignment.id, placeId: place.id,
        };
        const to: MovementAnchor = {
          lat: end[0], lng: end[1], source: 'track-end',
          assignmentId: assignment.id, placeId: place.id,
        };
        if (cursor) addConnector(cursor, from);
        parts.push({
          ...metrics,
          geometry: movement.geometry,
          start, end,
          kind: 'track', key: trackKey(assignment.id, from, to), assignmentId: assignment.id,
          placeId: place.id, from, to,
        });
        cursor = { anchor: to, placement: { kind: 'after-assignment', assignmentId: assignment.id }, hasPlace: true };
      } else if (finite(place.lat) && finite(place.lng)) {
        const anchor: MovementAnchor = {
          lat: place.lat, lng: place.lng, source: 'place', assignmentId: assignment.id, placeId: place.id,
          leg_transport_mode: (assignment as Assignment & { leg_transport_mode?: string | null }).leg_transport_mode ?? null,
          incoming_leg_transport_mode: (assignment as Assignment & { incoming_leg_transport_mode?: string | null }).incoming_leg_transport_mode ?? null,
        };
        if (cursor) addConnector(cursor, anchor);
        cursor = { anchor, placement: { kind: 'after-assignment', assignmentId: assignment.id }, hasPlace: true };
      }
      continue;
    }

    const reservation = item.data as Reservation;
    const endpoints = getTransportRouteEndpoints(reservation, day.id);
    const from: MovementAnchor | null = endpoints.from ? {
      ...endpoints.from, source: 'transport-from', reservationId: reservation.id,
    } : null;
    const to: MovementAnchor | null = endpoints.to ? {
      ...endpoints.to, source: 'transport-to', reservationId: reservation.id,
    } : null;
    if (from || to) {
      if (from && cursor?.hasPlace) addConnector(cursor, from);
      if (reservation.type === 'transit') {
        parts.push({ kind: 'transit', key: transitKey(reservation.id), reservationId: reservation.id });
      }
      cursor = to
        ? { anchor: to, placement: { kind: 'after-reservation', reservationId: reservation.id }, hasPlace: false }
        : null;
    } else {
      if (reservation.type === 'transit') {
        parts.push({ kind: 'transit', key: transitKey(reservation.id), reservationId: reservation.id });
      }
      if (cursor && getSpanPhase(reservation, day.id) !== 'middle') {
        cursor = { ...cursor, placement: { kind: 'after-reservation', reservationId: reservation.id } };
      }
    }
  }

  if (drawEvening && evening) {
    if (cursor) {
      addConnector(cursor, evening, {
        kind: 'hotel-bottom', dayId: day.id, name: bookends.evening?.place_name ?? '',
      });
    } else if (drawMorning && morning && !samePoint(morning, evening)) {
      parts.push({
        kind: 'routed', from: morning, to: evening,
        placement: { kind: 'hotel-bottom', dayId: day.id, name: bookends.evening?.place_name ?? '' },
        key: routedKey(
          { kind: 'hotel-bottom', dayId: day.id, name: bookends.evening?.place_name ?? '' },
          morning,
          evening,
        ),
      });
    }
  }

  return {
    dayId: day.id,
    parts,
    hasRoutedConnectors: parts.some(part => part.kind === 'routed'),
    hasTracks: parts.some(part => part.kind === 'track'),
    hasTransit: parts.some(part => part.kind === 'transit'),
  };
}

export function hasDayRouteTools(plan: DayMovementPlan): boolean {
  return plan.hasRoutedConnectors || plan.hasTracks || plan.hasTransit;
}

/** The routed connectors of a day — the ONLY parts the normal router computes. */
export function routedConnectors(plan: DayMovementPlan): PlannedRoutedPart[] {
  return plan.parts.filter((part): part is PlannedRoutedPart => part.kind === 'routed');
}

/** Return the routeable boundaries, including both ends of imported tracks. */
export function movementPlanWaypoints(plan: DayMovementPlan): { lat: number; lng: number }[] {
  const waypoints: MovementAnchor[] = [];
  const append = (anchor: MovementAnchor) => {
    const previous = waypoints[waypoints.length - 1];
    if (!previous || !samePoint(previous, anchor)) waypoints.push(anchor);
  };
  for (const part of plan.parts) {
    if (part.kind === 'routed' || part.kind === 'track') {
      append(part.from);
      append(part.to);
    }
  }
  return waypoints.map(({ lat, lng }) => ({ lat, lng }));
}
