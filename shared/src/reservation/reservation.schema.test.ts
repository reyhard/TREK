import { transitRouteEndpointInputSchema, transitRouteEndpointsUpdateRequestSchema } from './reservation.schema';

import { describe, expect, it } from 'vitest';

describe('transitRouteEndpointsUpdateRequestSchema', () => {
  const endpoint = {
    name: '  Keihan Fushimi-Inari Station  ',
    lat: 34.9685211,
    lng: 135.7691251,
  };

  it('accepts and normalizes a from-only patch', () => {
    expect(transitRouteEndpointsUpdateRequestSchema.parse({ from: endpoint })).toEqual({
      from: { ...endpoint, name: 'Keihan Fushimi-Inari Station' },
    });
  });

  it('accepts a to-only patch and a two-endpoint update', () => {
    expect(transitRouteEndpointsUpdateRequestSchema.safeParse({ to: endpoint }).success).toBe(true);
    expect(transitRouteEndpointsUpdateRequestSchema.safeParse({ from: endpoint, to: endpoint }).success).toBe(true);
  });

  it('rejects an empty endpoint update', () => {
    const result = transitRouteEndpointsUpdateRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('At least one transit route endpoint is required.');
    }
  });

  it.each([
    [{ ...endpoint, name: '   ' }, 'blank name'],
    [{ ...endpoint, name: 'x'.repeat(301) }, 'oversized name'],
    [{ ...endpoint, lat: Number.NaN }, 'NaN latitude'],
    [{ ...endpoint, lat: Number.POSITIVE_INFINITY }, 'infinite latitude'],
    [{ ...endpoint, lat: -90.0001 }, 'latitude below range'],
    [{ ...endpoint, lat: 90.0001 }, 'latitude above range'],
    [{ ...endpoint, lng: Number.NEGATIVE_INFINITY }, 'infinite longitude'],
    [{ ...endpoint, lng: -180.0001 }, 'longitude below range'],
    [{ ...endpoint, lng: 180.0001 }, 'longitude above range'],
  ])('rejects %s (%s)', (value) => {
    expect(transitRouteEndpointInputSchema.safeParse(value).success).toBe(false);
  });
});
