export type TransitUsageKind = 'geocode' | 'plan';

export const TRANSIT_RATE_WINDOW_MS = 15 * 60 * 1000;
export const TRANSIT_RATE_LIMITS = Object.freeze({ geocode: 300, plan: 60 });

interface Attempt {
  count: number;
  first: number;
}

const buckets: Record<TransitUsageKind, Map<string, Attempt>> = {
  geocode: new Map(),
  plan: new Map(),
};

export function checkTransitUsage(kind: TransitUsageKind, callerKey: string, now = Date.now()): boolean {
  const bucket = buckets[kind];
  const limit = TRANSIT_RATE_LIMITS[kind];
  const record = bucket.get(callerKey);

  if (record && record.count >= limit && now - record.first < TRANSIT_RATE_WINDOW_MS) {
    return false;
  }

  if (!record || now - record.first >= TRANSIT_RATE_WINDOW_MS) {
    bucket.set(callerKey, { count: 1, first: now });
  } else {
    record.count += 1;
  }

  return true;
}

export function resetTransitUsageLimits(): void {
  buckets.geocode.clear();
  buckets.plan.clear();
}
