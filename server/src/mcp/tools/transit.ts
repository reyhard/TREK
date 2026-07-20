import { canAccessTrip } from '../../db/database';
import { RateLimitService } from '../../nest/auth/rate-limit.service';
import { isDemoUser } from '../../services/authService';
import {
  createReservation,
  getReservation,
  notifyBookingChange,
  updateReservation,
} from '../../services/reservationService';
import {
  buildTransitJourneyPatch,
  cleanTransitItineraryNames,
  transitCoordinatesMatch,
  transitCoordinatesSchema,
  transitItinerarySchema,
  transitPlaceSchema,
  type TransitJourneyPatch,
} from '../../services/transitItineraryService';
import { geocode, plan, SCHEDULED_TRANSIT_MODES } from '../../services/transitService';
import { canRead, canWrite } from '../scopes';
import {
  demoDenied,
  hasTripPermission,
  noAccess,
  ok,
  permissionDenied,
  safeBroadcast,
  TOOL_ANNOTATIONS_OPEN_WORLD_READONLY,
  TOOL_ANNOTATIONS_WRITE,
} from './_shared';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';

import { z } from 'zod';

const TRANSIT_RATE_WINDOW = 15 * 60 * 1000;
const transitRateLimiter = new RateLimitService();

const transitModes = z.enum(['TRANSIT', ...SCHEDULED_TRANSIT_MODES]);

function errorResult(err: unknown, fallback: string) {
  return {
    content: [{ type: 'text' as const, text: err instanceof Error ? err.message : fallback }],
    isError: true,
  };
}

function rateLimit(userId: number, bucket: string, max: number) {
  if (transitRateLimiter.check(bucket, String(userId), max, TRANSIT_RATE_WINDOW, Date.now())) return null;
  return {
    content: [{ type: 'text' as const, text: 'Too many transit requests. Please try again later.' }],
    isError: true,
  };
}

export function registerTransitTools(server: McpServer, userId: number, scopes: string[] | null): void {
  if (canRead(scopes, 'geo')) {
    server.registerTool(
      'search_transit_stops',
      {
        description:
          'Search real public-transit stops and stations via Transitous. Use the returned coordinates with search_transit_routes.',
        inputSchema: {
          query: z.string().min(2).max(200),
          language: z.string().min(2).max(5).optional(),
          near: z
            .object(transitCoordinatesSchema.shape)
            .optional()
            .describe('Optional coordinates used to bias nearby results'),
        },
        annotations: TOOL_ANNOTATIONS_OPEN_WORLD_READONLY,
      },
      async ({ query, language, near }) => {
        const limited = rateLimit(userId, 'mcp_transit_geocode', 300);
        if (limited) return limited;
        try {
          return ok(await geocode(query, language, near ? `${near.lat},${near.lng}` : undefined));
        } catch (err) {
          return errorResult(err, 'Transit stop search failed.');
        }
      },
    );

    server.registerTool(
      'search_transit_routes',
      {
        description:
          'Search scheduled public-transit routes via Transitous between two coordinates. Returns itineraries that can be passed unchanged to create_transit_journey. `dropped` counts provider itineraries that failed validation and are therefore absent from the results — a non-zero value means the provider offered routes this tool could not represent.',
        inputSchema: {
          from: transitPlaceSchema,
          to: transitPlaceSchema,
          time: z
            .string()
            .datetime({ offset: true })
            .optional()
            .describe('ISO 8601 departure or arrival time with timezone offset'),
          arriveBy: z.boolean().optional().default(false),
          modes: z.array(transitModes).max(14).optional(),
          maxTransfers: z.number().int().min(0).max(10).optional(),
        },
        annotations: TOOL_ANNOTATIONS_OPEN_WORLD_READONLY,
      },
      async ({ from, to, time, arriveBy, modes, maxTransfers }) => {
        const limited = rateLimit(userId, 'mcp_transit_plan', 60);
        if (limited) return limited;
        try {
          const result = await plan({
            from: `${from.lat},${from.lng}`,
            to: `${to.lat},${to.lng}`,
            time,
            arriveBy,
            modes: modes?.join(','),
            maxTransfers,
          });
          const itineraries = result.itineraries.flatMap((itinerary) => {
            const parsed = transitItinerarySchema.safeParse(cleanTransitItineraryNames(itinerary, from.name, to.name));
            if (!parsed.success) return [];
            const firstStop = parsed.data.legs[0].from;
            const lastStop = parsed.data.legs[parsed.data.legs.length - 1].to;
            return transitCoordinatesMatch(from, firstStop) && transitCoordinatesMatch(to, lastStop)
              ? [parsed.data]
              : [];
          });
          return ok({ itineraries, dropped: result.itineraries.length - itineraries.length });
        } catch (err) {
          return errorResult(err, 'Transit route search failed.');
        }
      },
    );
  }

  if (!canWrite(scopes, 'reservations')) return;

  server.registerTool(
    'create_transit_journey',
    {
      description:
        'Add one itinerary returned by search_transit_routes to a trip day as a first-class automated public-transit journey.',
      inputSchema: {
        tripId: z.number().int().positive(),
        dayId: z.number().int().positive().describe('Trip day on which the journey departs'),
        from: transitPlaceSchema,
        to: transitPlaceSchema,
        itinerary: transitItinerarySchema,
        notes: z.string().max(1000).optional(),
      },
      annotations: TOOL_ANNOTATIONS_WRITE,
    },
    async ({ tripId, dayId, from, to, itinerary, notes }) => {
      if (isDemoUser(userId)) return demoDenied();
      if (!canAccessTrip(tripId, userId)) return noAccess();
      if (!hasTripPermission('reservation_edit', tripId, userId)) return permissionDenied();

      const cleaned = cleanTransitItineraryNames(itinerary, from.name, to.name);
      const firstStop = cleaned.legs[0].from;
      const lastStop = cleaned.legs[cleaned.legs.length - 1].to;
      if (!transitCoordinatesMatch(from, firstStop) || !transitCoordinatesMatch(to, lastStop)) {
        return {
          content: [
            { type: 'text' as const, text: 'The itinerary does not match the requested origin and destination.' },
          ],
          isError: true,
        };
      }

      let patch: TransitJourneyPatch;
      try {
        patch = buildTransitJourneyPatch(tripId, dayId, from, to, cleaned);
      } catch (err) {
        return errorResult(err, 'Unable to resolve the transit journey timezones.');
      }

      const { reservation } = createReservation(tripId, {
        title: `${from.name} → ${to.name}`,
        type: 'transit',
        status: 'confirmed',
        day_id: patch.day_id,
        end_day_id: patch.end_day_id,
        reservation_time: patch.reservation_time,
        reservation_end_time: patch.reservation_end_time,
        notes,
        metadata: patch.metadata,
        endpoints: patch.endpoints,
        needs_review: false,
      });
      safeBroadcast(tripId, 'reservation:created', { reservation });
      notifyBookingChange(tripId, userId, reservation.title, reservation.type || '');
      return ok({ reservation });
    },
  );

  server.registerTool(
    'update_transit_journey',
    {
      description:
        'Replace the route data of an existing automated transit journey while preserving title and notes unless explicitly overridden. Does not call Transitous.',
      inputSchema: {
        tripId: z.number().int().positive(),
        reservationId: z.number().int().positive(),
        dayId: z.number().int().positive().describe('Trip day on which the journey departs'),
        from: transitPlaceSchema,
        to: transitPlaceSchema,
        itinerary: transitItinerarySchema,
      },
      annotations: TOOL_ANNOTATIONS_WRITE,
    },
    async ({ tripId, reservationId, dayId, from, to, itinerary }) => {
      if (isDemoUser(userId)) return demoDenied();
      if (!canAccessTrip(tripId, userId)) return noAccess();
      if (!hasTripPermission('reservation_edit', tripId, userId)) return permissionDenied();

      const current = getReservation(reservationId, tripId);
      if (!current) {
        return { content: [{ type: 'text' as const, text: 'Reservation not found.' }], isError: true };
      }
      if (current.type !== 'transit') {
        return {
          content: [{ type: 'text' as const, text: 'Reservation is not a transit journey.' }],
          isError: true,
        };
      }

      const cleaned = cleanTransitItineraryNames(itinerary, from.name, to.name);
      const firstStop = cleaned.legs[0].from;
      const lastStop = cleaned.legs[cleaned.legs.length - 1].to;
      if (!transitCoordinatesMatch(from, firstStop) || !transitCoordinatesMatch(to, lastStop)) {
        return {
          content: [
            { type: 'text' as const, text: 'The itinerary does not match the requested origin and destination.' },
          ],
          isError: true,
        };
      }

      let patch: TransitJourneyPatch;
      try {
        patch = buildTransitJourneyPatch(tripId, dayId, from, to, cleaned, current.metadata);
      } catch (err) {
        return errorResult(err, 'Unable to resolve the transit journey timezones.');
      }

      try {
        const { reservation } = updateReservation(
          reservationId,
          tripId,
          {
            day_id: patch.day_id,
            end_day_id: patch.end_day_id,
            reservation_time: patch.reservation_time,
            reservation_end_time: patch.reservation_end_time,
            metadata: patch.metadata,
            endpoints: patch.endpoints,
          },
          current,
        );
        safeBroadcast(tripId, 'reservation:updated', { reservation });
        notifyBookingChange(tripId, userId, reservation.title, reservation.type || '');
        return ok({ reservation });
      } catch {
        return { content: [{ type: 'text' as const, text: 'Failed to update transit journey.' }], isError: true };
      }
    },
  );
}
