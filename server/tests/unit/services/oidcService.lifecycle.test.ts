import { describe, it, expect, vi, afterAll } from 'vitest';

describe('oidcService lifecycle — module-level cleanup timers', () => {
  const intervals: ReturnType<typeof setInterval>[] = [];
  const origSetInterval = globalThis.setInterval;

  afterAll(() => {
    for (const iv of intervals) {
      if (iv && typeof iv === 'object' && 'hasRef' in iv) {
        expect(iv.hasRef()).toBe(false);
      }
    }
  });

  it('imports oidcService without leaving blocking timers', async () => {
    vi.spyOn(globalThis, 'setInterval').mockImplementation((handler: TimerHandler, ms?: number, ...args: unknown[]) => {
      const timer = origSetInterval(handler, ms, ...args);
      intervals.push(timer);
      return timer;
    });

    const mod = await import('../../../src/services/oidcService');
    expect(mod.createState).toBeDefined();
    expect(mod.consumeState).toBeDefined();
    expect(mod.createAuthCode).toBeDefined();
    expect(mod.resolveOidcRole).toBeDefined();
  });
});
