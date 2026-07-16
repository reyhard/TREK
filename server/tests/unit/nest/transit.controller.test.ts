import { TransitController } from '../../../src/nest/transit/transit.controller';
import { TransitModule } from '../../../src/nest/transit/transit.module';
import { resetTransitUsageLimits, TRANSIT_RATE_LIMITS } from '../../../src/services/transitRateLimit';
import { HttpException } from '@nestjs/common';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const transitMock = vi.hoisted(() => ({ geocode: vi.fn(), plan: vi.fn() }));
vi.mock('../../../src/services/transitService', () => transitMock);

const req = { ip: '127.0.0.1' } as any;

describe('TransitController', () => {
  beforeEach(() => {
    resetTransitUsageLimits();
    transitMock.geocode.mockReset();
    transitMock.plan.mockReset();
  });

  it('maps geocode query parameters exactly', async () => {
    transitMock.geocode.mockResolvedValue({ results: [] });
    const controller = new TransitController();

    await expect(controller.geocode('station', 'de', '52.5,13.4', req)).resolves.toEqual({ results: [] });

    expect(transitMock.geocode).toHaveBeenCalledWith('station', 'de', '52.5,13.4');
  });

  it('maps planning query parameters exactly', async () => {
    transitMock.plan.mockResolvedValue({ itineraries: [] });
    const controller = new TransitController();

    await controller.plan('52.5,13.4', '52.6,13.5', '2026-10-02T08:00:00Z', 'true', 'BUS', '2', req);

    expect(transitMock.plan).toHaveBeenCalledWith({
      from: '52.5,13.4',
      to: '52.6,13.5',
      time: '2026-10-02T08:00:00Z',
      arriveBy: true,
      modes: 'BUS',
      maxTransfers: 2,
    });
  });

  it('returns HTTP 429 before calling the provider after the shared planning limit', async () => {
    transitMock.plan.mockResolvedValue({ itineraries: [] });
    const controller = new TransitController();

    for (let i = 0; i < TRANSIT_RATE_LIMITS.plan; i++) {
      await controller.plan('52.5,13.4', '52.6,13.5', undefined, undefined, undefined, undefined, req);
    }

    await expect(
      controller.plan('52.5,13.4', '52.6,13.5', undefined, undefined, undefined, undefined, req),
    ).rejects.toMatchObject({ status: 429 });
    expect(transitMock.plan).toHaveBeenCalledTimes(TRANSIT_RATE_LIMITS.plan);
  });

  it('preserves transit provider HTTP error mapping', async () => {
    transitMock.geocode.mockRejectedValue(Object.assign(new Error('Provider unavailable'), { status: 503 }));
    const controller = new TransitController();

    const error = await controller.geocode('station', undefined, undefined, req).catch((err) => err);

    expect(error).toBeInstanceOf(HttpException);
    expect(error).toMatchObject({ response: { error: 'Provider unavailable' }, status: 503 });
  });
});

describe('TransitModule', () => {
  it('does not create an unused auth rate limiter', () => {
    expect(Reflect.getMetadata('providers', TransitModule)).toEqual([]);
  });
});
