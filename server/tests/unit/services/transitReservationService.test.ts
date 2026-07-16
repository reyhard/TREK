import { describe, expect, it } from 'vitest';
import {
  mapTransitModeGroups,
  normalizeTransitItinerary,
  rankTransitItineraries,
  summarizeTransitItinerary,
} from '../../../src/services/transitReservationService';
import type { TransitItinerary } from '../../../src/services/transitService';

function route(overrides: Partial<TransitItinerary> = {}): TransitItinerary {
  return {
    startTime: '2026-10-02T08:00:00.000Z',
    endTime: '2026-10-02T08:30:00.000Z',
    duration: 999,
    transfers: 9,
    walkSeconds: 999,
    legs: [
      {
        mode: 'WALK',
        from: { name: 'START', lat: 52.5, lng: 13.4, time: '2026-10-02T08:00:00.000Z', scheduledTime: null, track: null },
        to: { name: 'Stop A', lat: 52.51, lng: 13.41, time: '2026-10-02T08:05:00.000Z', scheduledTime: null, track: null },
        duration: 300,
        distance: 250,
        headsign: null,
        line: null,
        lineColor: null,
        lineTextColor: null,
        agency: null,
        intermediateStops: 0,
        geometry: 'abc',
        geometryPrecision: 6,
      },
      {
        mode: 'BUS',
        from: { name: 'Stop A', lat: 52.51, lng: 13.41, time: '2026-10-02T08:07:00.000Z', scheduledTime: null, track: '2' },
        to: { name: 'END', lat: 52.52, lng: 13.42, time: '2026-10-02T08:30:00.000Z', scheduledTime: null, track: null },
        duration: 1380,
        distance: 6000,
        headsign: 'City Centre',
        line: '100',
        lineColor: '#FF0000',
        lineTextColor: '#FFFFFF',
        agency: 'BVG',
        intermediateStops: 4,
        geometry: 'def',
        geometryPrecision: 6,
      },
    ],
    ...overrides,
  };
}

describe('transit itinerary normalization', () => {
  it('recomputes wall-clock duration, walking time, and transfer count', () => {
    const normalized = normalizeTransitItinerary(route());
    expect(normalized.duration).toBe(1800);
    expect(normalized.walkSeconds).toBe(300);
    expect(normalized.transfers).toBe(0);
  });

  it('rejects a route with no transit leg', () => {
    expect(() => normalizeTransitItinerary(route({ legs: [route().legs[0]] })))
      .toThrow('Selected itinerary must include at least one transit leg');
  });

  it('rejects unsupported modes and invalid colors', () => {
    const badMode = route();
    badMode.legs[1] = { ...badMode.legs[1], mode: 'CAR' };
    expect(() => normalizeTransitItinerary(badMode)).toThrow('Selected itinerary is invalid');
    const badColor = route();
    badColor.legs[1] = { ...badColor.legs[1], lineColor: 'red' };
    expect(() => normalizeTransitItinerary(badColor)).toThrow('Selected itinerary is invalid');
  });

  it('ignores informational routeIndex and summary fields from planning results', () => {
    const normalized = normalizeTransitItinerary({ ...route(), routeIndex: 2, summary: 'Walk → Bus' });
    expect((normalized as any).routeIndex).toBeUndefined();
    expect((normalized as any).summary).toBeUndefined();
  });

  it('rejects more than 32 legs and excessive geometry', () => {
    expect(() => normalizeTransitItinerary(route({ legs: Array.from({ length: 33 }, () => route().legs[1]) })))
      .toThrow('Selected itinerary is invalid');
    const tooLarge = route();
    tooLarge.legs = [
      { ...tooLarge.legs[0], geometry: 'a'.repeat(90_000) },
      { ...tooLarge.legs[1], geometry: 'b'.repeat(90_000) },
      { ...tooLarge.legs[1], from: tooLarge.legs[1].to, geometry: 'c'.repeat(90_000) },
    ];
    expect(() => normalizeTransitItinerary(tooLarge)).toThrow('Selected itinerary geometry is too large');
  });
});

describe('transit ranking and presentation', () => {
  const fast = route({ duration: 1200, transfers: 2, walkSeconds: 600 });
  const few = route({ duration: 1800, transfers: 0, walkSeconds: 900 });
  const shortWalk = route({ duration: 1500, transfers: 1, walkSeconds: 120 });

  it('preserves provider order for best', () => {
    expect(rankTransitItineraries([fast, few, shortWalk], 'best')).toEqual([fast, few, shortWalk]);
  });

  it('ranks by transfers then duration', () => {
    expect(rankTransitItineraries([fast, shortWalk, few], 'fewer_transfers')).toEqual([few, shortWalk, fast]);
  });

  it('ranks by walking then duration', () => {
    expect(rankTransitItineraries([fast, few, shortWalk], 'less_walking')).toEqual([shortWalk, fast, few]);
  });

  it('maps friendly mode groups to the existing Transitous mode constants', () => {
    expect(mapTransitModeGroups(['rail', 'bus']))
      .toBe('HIGHSPEED_RAIL,LONG_DISTANCE,NIGHT_RAIL,REGIONAL_RAIL,SUBURBAN,BUS,COACH');
    expect(mapTransitModeGroups()).toBeUndefined();
  });

  it('builds a compact English route summary', () => {
    expect(summarizeTransitItinerary(route())).toBe('Walk 5 min → Bus 100');
  });
});
