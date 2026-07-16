import {
  checkTransitUsage,
  resetTransitUsageLimits,
  TRANSIT_RATE_LIMITS,
  TRANSIT_RATE_WINDOW_MS,
} from '../../../src/services/transitRateLimit';

import { beforeEach, describe, expect, it } from 'vitest';

describe('transitRateLimit', () => {
  beforeEach(() => resetTransitUsageLimits());

  it('allows exactly the configured number of planning calls per caller', () => {
    for (let i = 0; i < TRANSIT_RATE_LIMITS.plan; i++) {
      expect(checkTransitUsage('plan', 'mcp:user:1', 1_000)).toBe(true);
    }
    expect(checkTransitUsage('plan', 'mcp:user:1', 1_000)).toBe(false);
    expect(checkTransitUsage('plan', 'mcp:user:2', 1_000)).toBe(true);
  });

  it('uses the larger geocode bucket', () => {
    expect(TRANSIT_RATE_LIMITS.geocode).toBe(300);
    expect(TRANSIT_RATE_LIMITS.plan).toBe(60);
  });

  it('resets a caller after the 15-minute window', () => {
    for (let i = 0; i < TRANSIT_RATE_LIMITS.plan; i++) {
      checkTransitUsage('plan', 'http:127.0.0.1', 1_000);
    }
    expect(checkTransitUsage('plan', 'http:127.0.0.1', 1_000)).toBe(false);
    expect(checkTransitUsage('plan', 'http:127.0.0.1', 1_000 + TRANSIT_RATE_WINDOW_MS)).toBe(true);
  });

  it('removes an expired caller when a different caller uses the same bucket', () => {
    for (let i = 0; i < TRANSIT_RATE_LIMITS.plan; i++) {
      checkTransitUsage('plan', 'mcp:user:expired', 1_000);
    }
    expect(checkTransitUsage('plan', 'mcp:user:expired', 1_000)).toBe(false);

    expect(checkTransitUsage('plan', 'mcp:user:active', 1_000 + TRANSIT_RATE_WINDOW_MS)).toBe(true);

    // This deliberately non-monotonic clock probes whether the stale record was removed above.
    expect(checkTransitUsage('plan', 'mcp:user:expired', 1_001)).toBe(true);
  });
});
