import { describe, it, expect, vi, afterAll } from 'vitest';

describe('mcp/index lifecycle — module-level session sweep timer', () => {
  const intervals: ReturnType<typeof setInterval>[] = [];
  const origSetInterval = globalThis.setInterval;

  afterAll(() => {
    for (const iv of intervals) {
      if (iv && typeof iv === 'object' && 'hasRef' in iv) {
        expect(iv.hasRef()).toBe(false);
      }
    }
  });

  it('imports mcp/index without leaving a blocking timer', async () => {
    vi.spyOn(globalThis, 'setInterval').mockImplementation((handler: TimerHandler, ms?: number, ...args: unknown[]) => {
      const timer = origSetInterval(handler, ms, ...args);
      intervals.push(timer);
      return timer;
    });

    // This module has side-effects on import (session sweep timer)
    // Importing it must not leave a non-unref'd timer
    const mod = await import('../../../src/mcp/index');
    expect(mod).toBeDefined();
  });
});
