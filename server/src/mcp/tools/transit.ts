import { canAccessTrip } from '../../db/database';
import { getDay } from '../../services/dayService';
import { checkTransitUsage } from '../../services/transitRateLimit';
import {
  mapTransitModeGroups,
  normalizeTransitItinerary,
  rankTransitItineraries,
  resolveTransitEndpoint,
  summarizeTransitItinerary,
  type TransitModeGroup,
} from '../../services/transitReservationService';
import * as transit from '../../services/transitService';
import { localDateTimeToUtc, resolveTransitTimezone } from '../../services/transitTime';
import { canRead } from '../scopes';
import { noAccess, ok, TOOL_ANNOTATIONS_READONLY } from './_shared';
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
  if (typeof (error as Error & { status?: unknown }).status === 'number') return error.message;
  if (EXPECTED_TRANSIT_ERRORS.has(error.message)) return error.message;
  return EXPECTED_TRANSIT_ERROR_PREFIXES.some((prefix) => error.message.startsWith(prefix)) ? error.message : null;
}

export function registerTransitTools(server: McpServer, userId: number, scopes: string[] | null): void {
  if (!canRead(scopes, 'places')) return;

  server.registerTool(
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
        return ok(await transit.geocode(query, language, near ? `${near.lat},${near.lng}` : undefined));
      } catch (error) {
        const expected = expectedTransitErrorMessage(error);
        if (expected) return mcpError(expected);
        console.error('[MCP] transit stop search failed:', error);
        return mcpError('Failed to search transit stops.');
      }
    },
  );

  server.registerTool(
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
      if (!canAccessTrip(tripId, userId)) return noAccess();

      try {
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

        const result = await transit.plan({
          from: `${resolvedFrom.lat},${resolvedFrom.lng}`,
          to: `${resolvedTo.lat},${resolvedTo.lng}`,
          time: timeIso,
          arriveBy: timeMode === 'arrive_by',
          modes: transitModes,
          maxTransfers,
        });
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
}
