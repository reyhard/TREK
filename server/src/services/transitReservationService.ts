import { db } from '../db/database';
import { getDay } from './dayService';
import type { EndpointInput } from './reservationService';
import type { TransitItinerary, TransitLeg } from './transitService';
import { assertTransitCoordinate, formatTransitDate, formatTransitTime, resolveTransitTimezone } from './transitTime';

import { z } from 'zod';

export type TransitPreference = 'best' | 'fewer_transfers' | 'less_walking';
export type TransitModeGroup = 'rail' | 'subway' | 'tram' | 'bus' | 'ferry' | 'cable_car';

export interface NamedTransitEndpoint {
  name: string;
  lat: number;
  lng: number;
}

export type TransitEndpointReference = { placeId: number } | NamedTransitEndpoint;

export interface TransitRouteFields {
  type: 'transit';
  status: 'confirmed';
  day_id: number;
  end_day_id: number;
  reservation_time: string;
  reservation_end_time: string;
  metadata: { transit: Record<string, unknown> };
  endpoints: EndpointInput[];
  needs_review: false;
}

const SUPPORTED_MODES = [
  'WALK',
  'BUS',
  'COACH',
  'TRAM',
  'SUBWAY',
  'RAIL',
  'FERRY',
  'FUNICULAR',
  'AERIAL_LIFT',
  'HIGHSPEED_RAIL',
  'LONG_DISTANCE',
  'NIGHT_RAIL',
  'REGIONAL_RAIL',
  'SUBURBAN',
] as const;

const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/)
  .nullable();

const stopSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    time: z.string().datetime().nullable(),
    scheduledTime: z.string().datetime().nullable(),
    track: z.string().max(100).nullable(),
  })
  .strict();

const legSchema = z
  .object({
    mode: z.enum(SUPPORTED_MODES),
    from: stopSchema,
    to: stopSchema,
    duration: z.number().finite().min(0).max(604_800),
    distance: z.number().finite().min(0).max(100_000_000).nullable(),
    headsign: z.string().max(300).nullable(),
    line: z.string().max(100).nullable(),
    lineColor: colorSchema,
    lineTextColor: colorSchema,
    agency: z.string().max(300).nullable(),
    intermediateStops: z.number().int().min(0).max(10_000),
    geometry: z.string().max(100_000).nullable(),
    geometryPrecision: z.number().int().min(0).max(10),
  })
  .strict();

export const transitItinerarySchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  duration: z.number().finite().min(0).max(604_800),
  transfers: z.number().int().min(0).max(31),
  walkSeconds: z.number().finite().min(0).max(604_800),
  legs: z.array(legSchema).min(1).max(32),
}) as z.ZodType<TransitItinerary>;

const MODE_GROUPS: Record<TransitModeGroup, readonly string[]> = {
  rail: ['HIGHSPEED_RAIL', 'LONG_DISTANCE', 'NIGHT_RAIL', 'REGIONAL_RAIL', 'SUBURBAN'],
  subway: ['SUBWAY'],
  tram: ['TRAM'],
  bus: ['BUS', 'COACH'],
  ferry: ['FERRY'],
  cable_car: ['FUNICULAR', 'AERIAL_LIFT'],
};

export function mapTransitModeGroups(groups?: TransitModeGroup[]): string | undefined {
  if (groups === undefined) return undefined;
  if (groups.length === 0) throw new Error('No supported transport modes were selected');
  return groups.flatMap((group) => MODE_GROUPS[group]).join(',');
}

export function normalizeTransitItinerary(input: unknown): TransitItinerary {
  const parsed = transitItinerarySchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Selected itinerary is invalid: ${parsed.error.issues[0]?.message ?? 'validation failed'}`);
  }

  const item = parsed.data;
  const startMs = new Date(item.startTime).getTime();
  const endMs = new Date(item.endTime).getTime();
  if (endMs <= startMs) throw new Error('Selected itinerary arrival must be after departure');

  const transitLegs = item.legs.filter((leg) => leg.mode !== 'WALK');
  if (transitLegs.length === 0) {
    throw new Error('Selected itinerary must include at least one transit leg');
  }

  const geometrySize = item.legs.reduce((sum, leg) => sum + (leg.geometry?.length ?? 0), 0);
  if (geometrySize > 250_000) throw new Error('Selected itinerary geometry is too large');

  const normalized = {
    ...item,
    duration: Math.round((endMs - startMs) / 1000),
    walkSeconds: item.legs.filter((leg) => leg.mode === 'WALK').reduce((sum, leg) => sum + leg.duration, 0),
    transfers: Math.max(0, transitLegs.length - 1),
    legs: item.legs.map((leg) => ({ ...leg }) as TransitLeg),
  };

  const normalizedResult = transitItinerarySchema.safeParse(normalized);
  if (!normalizedResult.success) {
    throw new Error(
      `Selected itinerary is invalid: ${normalizedResult.error.issues[0]?.message ?? 'validation failed'}`,
    );
  }
  return normalizedResult.data;
}

export function resolveTransitEndpoint(
  tripId: number,
  ref: TransitEndpointReference,
  label: 'Origin' | 'Destination',
): NamedTransitEndpoint {
  if ('placeId' in ref) {
    const row = db
      .prepare('SELECT id, name, lat, lng FROM places WHERE id = ? AND trip_id = ?')
      .get(ref.placeId, tripId) as
      | {
          id: number;
          name: string;
          lat: number | null;
          lng: number | null;
        }
      | undefined;
    if (!row) throw new Error('Place does not belong to this trip');
    if (row.lat == null || row.lng == null) throw new Error('Place has no usable coordinates');
    assertTransitCoordinate(row.lat, row.lng, label);
    return { name: row.name, lat: row.lat, lng: row.lng };
  }

  const name = ref.name.trim();
  if (!name) throw new Error(`${label} name is required`);
  if (name.length > 300) throw new Error(`${label} name must be 300 characters or fewer`);
  assertTransitCoordinate(ref.lat, ref.lng, label);
  return { name, lat: ref.lat, lng: ref.lng };
}

export function buildTransitRouteFields(input: {
  tripId: number;
  dayId: number;
  from: NamedTransitEndpoint;
  to: NamedTransitEndpoint;
  itinerary: unknown;
}): TransitRouteFields {
  const day = getDay(input.dayId, input.tripId);
  if (!day) throw new Error('Day does not belong to this trip');
  if (!day.date) throw new Error('The selected day has no date');

  const from = resolveTransitEndpoint(input.tripId, input.from, 'Origin');
  const to = resolveTransitEndpoint(input.tripId, input.to, 'Destination');
  const itinerary = normalizeTransitItinerary(input.itinerary);
  const fromZone = resolveTransitTimezone(from.lat, from.lng);
  const toZone = resolveTransitTimezone(to.lat, to.lng);
  const departureDate = formatTransitDate(itinerary.startTime, fromZone);
  const departureTime = formatTransitTime(itinerary.startTime, fromZone);
  const arrivalDate = formatTransitDate(itinerary.endTime, toZone);
  const arrivalTime = formatTransitTime(itinerary.endTime, toZone);
  const arrivalDay =
    arrivalDate !== departureDate
      ? (db.prepare('SELECT id FROM days WHERE trip_id = ? AND date = ?').get(input.tripId, arrivalDate) as
          | { id: number }
          | undefined)
      : undefined;
  const transitLegs = itinerary.legs.filter((leg) => leg.mode !== 'WALK');
  const endpoints: EndpointInput[] = [
    {
      role: 'from',
      sequence: 0,
      name: from.name,
      code: null,
      lat: from.lat,
      lng: from.lng,
      timezone: fromZone,
      local_date: departureDate,
      local_time: departureTime,
    },
  ];

  transitLegs.slice(0, -1).forEach((leg, index) => {
    const stop = leg.to;
    const timeZone = resolveTransitTimezone(stop.lat, stop.lng);
    endpoints.push({
      role: 'stop',
      sequence: index + 1,
      name: stop.name,
      code: null,
      lat: stop.lat,
      lng: stop.lng,
      timezone: timeZone,
      local_date: stop.time ? formatTransitDate(stop.time, timeZone) : null,
      local_time: stop.time ? formatTransitTime(stop.time, timeZone) : null,
    });
  });

  endpoints.push({
    role: 'to',
    sequence: endpoints.length,
    name: to.name,
    code: null,
    lat: to.lat,
    lng: to.lng,
    timezone: toZone,
    local_date: arrivalDate,
    local_time: arrivalTime,
  });

  return {
    type: 'transit',
    status: 'confirmed',
    day_id: input.dayId,
    end_day_id: arrivalDay?.id ?? input.dayId,
    reservation_time: `${departureDate}T${departureTime}`,
    reservation_end_time: `${arrivalDate}T${arrivalTime}`,
    metadata: {
      transit: {
        provider: 'transitous',
        duration: itinerary.duration,
        transfers: itinerary.transfers,
        walk_seconds: itinerary.walkSeconds,
        legs: itinerary.legs.map((leg) => {
          const legZoneFrom = resolveTransitTimezone(leg.from.lat, leg.from.lng);
          const legZoneTo = resolveTransitTimezone(leg.to.lat, leg.to.lng);
          return {
            mode: leg.mode,
            line: leg.line,
            line_color: leg.lineColor,
            line_text_color: leg.lineTextColor,
            headsign: leg.headsign,
            agency: leg.agency,
            duration: leg.duration,
            stops: leg.intermediateStops,
            from: {
              name: leg.from.name,
              time: leg.from.time ? formatTransitTime(leg.from.time, legZoneFrom) : null,
              track: leg.from.track,
            },
            to: {
              name: leg.to.name,
              time: leg.to.time ? formatTransitTime(leg.to.time, legZoneTo) : null,
              track: leg.to.track,
            },
            geometry: leg.geometry,
            geometry_precision: leg.geometryPrecision,
          };
        }),
      },
    },
    endpoints,
    needs_review: false,
  };
}

export function rankTransitItineraries(items: TransitItinerary[], preference: TransitPreference): TransitItinerary[] {
  const ranked = items.map((item, index) => ({ item, index }));
  if (preference === 'fewer_transfers') {
    ranked.sort(
      (a, b) => a.item.transfers - b.item.transfers || a.item.duration - b.item.duration || a.index - b.index,
    );
  } else if (preference === 'less_walking') {
    ranked.sort(
      (a, b) => a.item.walkSeconds - b.item.walkSeconds || a.item.duration - b.item.duration || a.index - b.index,
    );
  }
  return ranked.map(({ item }) => item);
}

export function summarizeTransitItinerary(item: TransitItinerary): string {
  return item.legs
    .map((leg) => {
      if (leg.mode === 'WALK') return `Walk ${Math.max(1, Math.round(leg.duration / 60))} min`;
      const mode =
        leg.mode === 'BUS' || leg.mode === 'COACH'
          ? 'Bus'
          : leg.mode === 'SUBWAY'
            ? 'Subway'
            : leg.mode === 'TRAM'
              ? 'Tram'
              : leg.mode === 'FERRY'
                ? 'Ferry'
                : leg.mode === 'FUNICULAR' || leg.mode === 'AERIAL_LIFT'
                  ? 'Cable car'
                  : 'Train';
      return leg.line ? `${mode} ${leg.line}` : mode;
    })
    .join(' → ');
}
