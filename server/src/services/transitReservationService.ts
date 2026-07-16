import { z } from 'zod';
import type { TransitItinerary, TransitLeg } from './transitService';

export type TransitPreference = 'best' | 'fewer_transfers' | 'less_walking';
export type TransitModeGroup = 'rail' | 'subway' | 'tram' | 'bus' | 'ferry' | 'cable_car';

export interface NamedTransitEndpoint {
  name: string;
  lat: number;
  lng: number;
}

export type TransitEndpointReference = { placeId: number } | NamedTransitEndpoint;

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

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/).nullable();

const stopSchema = z.object({
  name: z.string().trim().min(1).max(300),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  time: z.string().datetime().nullable(),
  scheduledTime: z.string().datetime().nullable(),
  track: z.string().max(100).nullable(),
}).strict();

const legSchema = z.object({
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
}).strict();

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

  return {
    ...item,
    duration: Math.round((endMs - startMs) / 1000),
    walkSeconds: item.legs
      .filter((leg) => leg.mode === 'WALK')
      .reduce((sum, leg) => sum + leg.duration, 0),
    transfers: Math.max(0, transitLegs.length - 1),
    legs: item.legs.map((leg) => ({ ...leg } as TransitLeg)),
  };
}

export function rankTransitItineraries(
  items: TransitItinerary[],
  preference: TransitPreference,
): TransitItinerary[] {
  const ranked = items.map((item, index) => ({ item, index }));
  if (preference === 'fewer_transfers') {
    ranked.sort((a, b) => (
      a.item.transfers - b.item.transfers
      || a.item.duration - b.item.duration
      || a.index - b.index
    ));
  } else if (preference === 'less_walking') {
    ranked.sort((a, b) => (
      a.item.walkSeconds - b.item.walkSeconds
      || a.item.duration - b.item.duration
      || a.index - b.index
    ));
  }
  return ranked.map(({ item }) => item);
}

export function summarizeTransitItinerary(item: TransitItinerary): string {
  return item.legs.map((leg) => {
    if (leg.mode === 'WALK') return `Walk ${Math.max(1, Math.round(leg.duration / 60))} min`;
    const mode = leg.mode === 'BUS' || leg.mode === 'COACH'
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
  }).join(' → ');
}
