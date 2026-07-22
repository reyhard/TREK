import { describe, it, expect, vi, afterAll } from 'vitest';

describe('weatherService lifecycle — module-level cleanup timer', () => {
  const intervals: ReturnType<typeof setInterval>[] = [];
  const origSetInterval = globalThis.setInterval;

  afterAll(() => {
    for (const iv of intervals) {
      if (iv && typeof iv === 'object' && 'hasRef' in iv) {
        expect(iv.hasRef()).toBe(false);
      }
    }
  });

  it('imports weatherService without leaving a blocking timer', async () => {
    vi.spyOn(globalThis, 'setInterval').mockImplementation(
      (handler: TimerHandler, ms?: number, ...args: unknown[]) => {
        const timer = origSetInterval(handler, ms, ...args);
        intervals.push(timer);
        return timer;
      },
    );

    const mod = await import('../../../src/services/weatherService');
    expect(mod.getWeather).toBeDefined();
    expect(mod.getDetailedWeather).toBeDefined();
    expect(mod.estimateCondition).toBeDefined();
  });
});
