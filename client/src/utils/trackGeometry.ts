/**
 * Imported-track geometry + movement (Task 07, F13 port). A place carries an
 * imported GPX track in `route_geometry` ([lat, lng, elev?][]); this module
 * parses it once into track stats and derives the movement contribution the
 * day's movement totals count.
 */
import { calculatePolylineDistanceMeters, isValidGeoCoordinate } from './geoDistance';

export type TrackMode = 'walking' | 'cycling' | 'driving';
export type TrackDurationSource = 'poi-times' | 'estimated';

export interface TrackPlaceLike {
  id: number;
  route_geometry?: string | null;
  place_time?: string | null;
  end_time?: string | null;
  transport_mode?: string | null;
}

interface TrackPath {
  coordinates: [number, number][];
  start: [number, number];
  end: [number, number];
  distance: number;
}

export interface ParsedTrackGeometry {
  coordinates: [number, number][];
  distanceMeters: number;
  elevationGain: number;
  elevationLoss: number;
  minElevation: number | null;
  maxElevation: number | null;
}

export interface TrackMovementMetrics extends TrackPath {
  geometry: [number, number][];
  mode: TrackMode;
  duration: number;
  durationSource: TrackDurationSource;
}

export interface TrackStats {
  points: number[][];
  distanceMeters: number;
  hasElevation: boolean;
  elevations: number[];
  minElevationMeters: number | null;
  maxElevationMeters: number | null;
  elevationGainMeters: number;
  elevationLossMeters: number;
}

const SPEED_METERS_PER_SECOND: Record<TrackMode, number> = {
  walking: 5000 / 3600,
  cycling: 15000 / 3600,
  driving: 50000 / 3600,
};

function parseClockMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function normalizeTrackMode(mode: string | null | undefined): TrackMode {
  switch ((mode ?? '').trim().toLowerCase()) {
    case 'cycling':
    case 'bicycle':
    case 'bike':
      return 'cycling';
    case 'driving':
    case 'car':
      return 'driving';
    default:
      return 'walking';
  }
}

function parseTrackPoints(raw: string | null | undefined): number[][] | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length < 2) return null;

  const points: number[][] = [];
  for (const rawPoint of value) {
    if (!Array.isArray(rawPoint) || !isValidGeoCoordinate(rawPoint)) continue;
    const [lat, lng] = rawPoint;
    const elevation = rawPoint.length >= 3 && Number.isFinite(rawPoint[2]) ? Number(rawPoint[2]) : null;
    points.push(elevation == null ? [lat, lng] : [lat, lng, elevation]);
  }
  return points.length >= 2 ? points : null;
}

/** Parse imported geometry while ignoring malformed coordinate rows. */
export function parseTrackGeometry(routeGeometry: string | null | undefined): ParsedTrackGeometry | null {
  const points = parseTrackPoints(routeGeometry);
  if (!points) return null;
  const coordinates = points.map(([lat, lng]) => [lat, lng] as [number, number]);
  const distanceMeters = calculatePolylineDistanceMeters(points);
  if (distanceMeters == null) return null;

  const hasElevation = points.every(point => point.length >= 3 && Number.isFinite(point[2]));
  const elevations = hasElevation ? points.map(point => point[2] as number) : [];
  let elevationGain = 0;
  let elevationLoss = 0;
  for (let index = 1; index < elevations.length; index += 1) {
    const delta = elevations[index]! - elevations[index - 1]!;
    if (delta > 0) elevationGain += delta;
    else elevationLoss += Math.abs(delta);
  }

  return {
    coordinates,
    distanceMeters,
    elevationGain,
    elevationLoss,
    minElevation: elevations.length ? Math.min(...elevations) : null,
    maxElevation: elevations.length ? Math.max(...elevations) : null,
  };
}

/** Parse `route_geometry` into track stats (distance + elevation profile). */
export function calculateTrackStats(routeGeometry: string | null | undefined): TrackStats | null {
  const points = parseTrackPoints(routeGeometry);
  const parsed = parseTrackGeometry(routeGeometry);
  if (!points || !parsed) return null;
  const hasElevation = points.every(point => point.length >= 3 && Number.isFinite(point[2]));
  const elevations = hasElevation ? points.map(point => point[2] as number) : [];

  return {
    points,
    distanceMeters: parsed.distanceMeters,
    hasElevation,
    elevations,
    minElevationMeters: parsed.minElevation,
    maxElevationMeters: parsed.maxElevation,
    elevationGainMeters: parsed.elevationGain,
    elevationLossMeters: parsed.elevationLoss,
  };
}

/** Track movement contribution for a place carrying an imported track. */
export function getTrackMovement(place: TrackPlaceLike | null | undefined): TrackMovementMetrics | null {
  if (!place) return null;
  const points = parseTrackPoints(place.route_geometry);
  if (!points) return null;
  const distance = calculatePolylineDistanceMeters(points);
  if (distance == null) return null;

  const startMinutes = parseClockMinutes(place.place_time);
  const endMinutes = parseClockMinutes(place.end_time);
  const scheduledDuration = startMinutes != null && endMinutes != null && endMinutes > startMinutes
    ? (endMinutes - startMinutes) * 60
    : null;
  const mode = normalizeTrackMode(place.transport_mode);
  const coordinates = points.map(([lat, lng]) => [lat, lng] as [number, number]);

  return {
    coordinates,
    geometry: coordinates,
    start: coordinates[0]!,
    end: coordinates[coordinates.length - 1]!,
    distance,
    mode,
    duration: scheduledDuration ?? distance / SPEED_METERS_PER_SECOND[mode],
    durationSource: scheduledDuration == null ? 'estimated' : 'poi-times',
  };
}
