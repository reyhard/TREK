import { canAccessTrip } from '../../db/database';
import { getDay } from '../../services/dayService';
import { checkTransitUsage } from '../../services/transitRateLimit';
import {
  createTransitReservation,
  mapTransitModeGroups,
  normalizeTransitItinerary,
  rankTransitItineraries,
  resolveTransitEndpoint,
  summarizeTransitItinerary,
  transitItinerarySchema,
  updateTransitReservation,
  type TransitModeGroup,
} from '../../services/transitReservationService';
import * as transit from '../../services/transitService';
import { localDateTimeToUtc, resolveTransitTimezone } from '../../services/transitTime';
import { isDemoUser } from '../../services/authService';
import { canRead, canWrite } from '../scopes';
import {
  demoDenied,
  hasTripPermission,
  noAccess,
  ok,
  permissionDenied,
  safeBroadcast,
  TOOL_ANNOTATIONS_NON_IDEMPOTENT,
  TOOL_ANNOTATIONS_READONLY,
  TOOL_ANNOTATIONS_WRITE,
} from './_shared';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';

import { z } from 'zod';

const ALL_MODE_GROUPS: TransitModeGroup[] = ['rail', 'subway', 'tram', 'bus', 'ferry', 'cable_car'];

const namedEndpointSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  })
  .strict();

const endpointReferenceSchema = z.union([
  z.object({ placeId: z.number().int().positive() }).strict(),
  namedEndpointSchema,
]);

const timeModeSchema = z.enum(['depart_at', 'arrive_by']).default('depart_at');
const modeGroupSchema = z.enum(['rail', 'subway', 'tram', 'bus', 'ferry', 'cable_car']);
const preferenceSchema = z.enum(['best', 'fewer_transfers', 'less_walking']).default('best');

const mcpError = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });

const EXPECTED_TRANSIT_ERRORS = new Set([
  'No supported transport modes were selected',
  'Selected itinerary arrival must be after departure',
  'Selected itinerary must include at least one transit leg',
  'Selected itinerary geometry is too large',
  'Place does not belong to this trip',
  'Place has no usable coordinates',
  'Could not resolve a timezone for the transit endpoint',
  'date must use YYYY-MM-DD format',
  'time must use HH:mm format',
  'Transit timestamp must be an ISO date-time',
  'Day does not belong to this trip',
  'The selected day has no date',
  'Automated transit route not found',
  'Target reservation is not an automated transit route',
]);

const EXPECTED_TRANSIT_ERROR_PREFIXES = [
  'Selected itinerary is invalid:',
  'Origin coordinates are invalid',
  'Destination coordinates are invalid',
  'Origin name is required',
  'Destination name is required',
  'Origin name must be 300 characters or fewer',
  'Destination name must be 300 characters or fewer',
  'Invalid IANA timezone:',
  'Could not determine UTC offset for ',
  'Local time does not exist in ',
];

function expectedTransitErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (error.message === 'Day does not belong to this trip') return 'Day does not belong to this trip.';
  if (error.message === 'The selected day has no date') return 'The selected day has no date.';
  if (EXPECTED_TRANSIT_ERRORS.has(error.message)) return error.message;
  return EXPECTED_TRANSIT_ERROR_PREFIXES.some((prefix) => error.message.startsWith(prefix)) ? error.message : null;
}

function providerErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  return typeof (error as Error & { status?: unknown }).status === 'number' ? error.message : null;
}

export function registerTransitTools(server: McpServer, userId: number, scopes: string[] | null): void {
  const canPlaces = canRead(scopes, 'places');
  const canReservations = canWrite(scopes, 'reservations');

  if (canPlaces) server.registerTool(
    'search_transit_stops',
    {
      description: 'Search public-transit stops and stations by name. Optionally bias results near coordinates.',
      inputSchema: {
        query: z.string().trim().min(2).max(200),
        language: z.string().trim().min(2).max(5).optional(),
        near: z
          .object({
            lat: z.number().finite().min(-90).max(90),
            lng: z.number().finite().min(-180).max(180),
          })
          .strict()
          .optional(),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async ({ query, language, near }) => {
      try {
        if (!checkTransitUsage('geocode', `mcp:user:${userId}`)) {
          return mcpError('Transit provider rate limit exceeded. Try again later.');
        }
        try {
          return ok(await transit.geocode(query, language, near ? `${near.lat},${near.lng}` : undefined));
        } catch (error) {
          const provider = providerErrorMessage(error);
          if (provider) return mcpError(provider);
          throw error;
        }
      } catch (error) {
        const expected = expectedTransitErrorMessage(error);
        if (expected) return mcpError(expected);
        console.error('[MCP] transit stop search failed:', error);
        return mcpError('Failed to search transit stops.');
      }
    },
  );

  if (canPlaces) server.registerTool(
    'plan_transit_route',
    {
      description:
        'Plan and rank public-transit route candidates for a dated trip day. Returns every candidate for selection and does not save a route.',
      inputSchema: {
        tripId: z.number().int().positive(),
        dayId: z.number().int().positive(),
        from: endpointReferenceSchema,
        to: endpointReferenceSchema,
        time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        timeMode: timeModeSchema,
        modes: z.array(modeGroupSchema).min(1).max(6).optional(),
        preference: preferenceSchema,
        maxTransfers: z.number().int().min(0).max(10).optional(),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async ({ tripId, dayId, from, to, time, timeMode, modes, preference, maxTransfers }) => {
      try {
        if (!canAccessTrip(tripId, userId)) return noAccess();

        const day = getDay(dayId, tripId);
        if (!day) return mcpError('Day does not belong to this trip.');
        if (!day.date) return mcpError('The selected day has no date.');

        const resolvedFrom = resolveTransitEndpoint(tripId, from, 'Origin');
        const resolvedTo = resolveTransitEndpoint(tripId, to, 'Destination');
        const anchorZone =
          timeMode === 'arrive_by'
            ? resolveTransitTimezone(resolvedTo.lat, resolvedTo.lng)
            : resolveTransitTimezone(resolvedFrom.lat, resolvedFrom.lng);
        const timeIso = localDateTimeToUtc(day.date, time, anchorZone);
        const transitModes = mapTransitModeGroups(modes);

        if (!checkTransitUsage('plan', `mcp:user:${userId}`)) {
          return mcpError('Transit provider rate limit exceeded. Try again later.');
        }

        let result;
        try {
          result = await transit.plan({
            from: `${resolvedFrom.lat},${resolvedFrom.lng}`,
            to: `${resolvedTo.lat},${resolvedTo.lng}`,
            time: timeIso,
            arriveBy: timeMode === 'arrive_by',
            modes: transitModes,
            maxTransfers,
          });
        } catch (error) {
          const provider = providerErrorMessage(error);
          if (provider) return mcpError(provider);
          throw error;
        }
        const cleaned = result.itineraries.map((item) => {
          const normalized = normalizeTransitItinerary(item);
          return {
            ...normalized,
            legs: normalized.legs.map((leg) => ({
              ...leg,
              from: { ...leg.from, name: leg.from.name === 'START' ? resolvedFrom.name : leg.from.name },
              to: { ...leg.to, name: leg.to.name === 'END' ? resolvedTo.name : leg.to.name },
            })),
          };
        });
        const ranked = rankTransitItineraries(cleaned, preference);
        const query = {
          tripId,
          dayId,
          date: day.date,
          time,
          timeMode,
          preference,
          modes: modes ?? ALL_MODE_GROUPS,
          ...(maxTransfers === undefined ? {} : { maxTransfers }),
        };

        return ok({
          query,
          from: resolvedFrom,
          to: resolvedTo,
          itineraries: ranked.map((item, routeIndex) => ({
            routeIndex,
            summary: summarizeTransitItinerary(item),
            ...item,
          })),
        });
      } catch (error) {
        const expected = expectedTransitErrorMessage(error);
        if (expected) return mcpError(expected);
        console.error('[MCP] transit route planning failed:', error);
        return mcpError('Failed to plan transit route.');
      }
    },
  );

  if (!canReservations) return;

  server.registerTool(
    'create_transit_route',
    {
      description:
        'Save a complete public-transit itinerary previously selected from plan_transit_route. Do not fabricate itinerary data; use manual create_transport(type: "train") when provider planning is unavailable.',
      inputSchema: {
        tripId: z.number().int().positive(),
        dayId: z.number().int().positive(),
        from: namedEndpointSchema,
        to: namedEndpointSchema,
        itinerary: transitItinerarySchema,
        title: z.string().trim().min(1).max(200).optional(),
        notes: z.string().max(1000).optional(),
      },
      annotations: TOOL_ANNOTATIONS_NON_IDEMPOTENT,
    },
    async ({ tripId, dayId, from, to, itinerary, title, notes }) => {
      if (isDemoUser(userId)) return demoDenied();
      if (!canAccessTrip(tripId, userId)) return noAccess();
      if (!hasTripPermission('reservation_edit', tripId, userId)) return permissionDenied();

      try {
        const result = createTransitReservation({ tripId, dayId, from, to, itinerary, title, notes });
        safeBroadcast(tripId, 'reservation:created', { reservation: result.reservation });
        return ok(result);
      } catch (error) {
        const expected = expectedTransitErrorMessage(error);
        if (expected) return mcpError(expected);
        console.error('[MCP] transit route creation failed:', error);
        return mcpError('Failed to create automated transit route.');
      }
    },
  );

  server.registerTool(
    'update_transit_route',
    {
      description:
        'Replace route-derived data for an automated public-transit reservation using a complete itinerary from plan_transit_route. Omit title or notes to preserve them.',
      inputSchema: {
        tripId: z.number().int().positive(),
        reservationId: z.number().int().positive(),
        dayId: z.number().int().positive(),
        from: namedEndpointSchema,
        to: namedEndpointSchema,
        itinerary: transitItinerarySchema,
        title: z.string().trim().min(1).max(200).optional(),
        notes: z.string().max(1000).optional(),
      },
      annotations: TOOL_ANNOTATIONS_WRITE,
    },
    async ({ tripId, reservationId, dayId, from, to, itinerary, title, notes }) => {
      if (isDemoUser(userId)) return demoDenied();
      if (!canAccessTrip(tripId, userId)) return noAccess();
      if (!hasTripPermission('reservation_edit', tripId, userId)) return permissionDenied();

      try {
        const result = updateTransitReservation({
          tripId,
          reservationId,
          dayId,
          from,
          to,
          itinerary,
          title,
          notes,
        });
        safeBroadcast(tripId, 'reservation:updated', { reservation: result.reservation });
        return ok(result);
      } catch (error) {
        const expected = expectedTransitErrorMessage(error);
        if (expected) return mcpError(expected);
        console.error('[MCP] transit route update failed:', error);
        return mcpError('Failed to update automated transit route.');
      }
    },
  );
}
