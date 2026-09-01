import { describe, it, expect, vi, afterAll } from 'vitest';

describe('weather implementation lifecycle module path', () => {
  const intervals: ReturnType<typeof setInterval>[] = [];
  const origSetInterval = globalThis.setInterval;

  afterAll(() => {
    for (const iv of intervals) {
      if (iv && typeof iv === 'object' && 'hasRef' in iv) {
        expect(iv.hasRef()).toBe(false);
      }
    }
  });

  it('imports the canonical Nest weather implementation without starting a module-level timer', async () => {
    vi.spyOn(globalThis, 'setInterval').mockImplementation((handler: TimerHandler, ms?: number, ...args: unknown[]) => {
      const timer = origSetInterval(handler, ms, ...args);
      intervals.push(timer);
      return timer;
    });

    const mod = await import('../../../src/nest/weather/weather.impl');
    expect(mod.getWeather).toBeDefined();
    expect(mod.getDetailedWeather).toBeDefined();
    expect(mod.estimateCondition).toBeDefined();
  });
});
