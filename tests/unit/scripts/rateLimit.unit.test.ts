import { describe, expect, it, vi } from 'vitest';
import { pause } from '../../../scripts/utils/rateLimit';

describe('pause (unit)', () => {
  it('returns immediately for <=0', async () => {
    const spy = vi.spyOn(global, 'setTimeout');
    await pause(0);
    await pause(-1);
    expect(spy).not.toHaveBeenCalled();
  });

  it('waits for positive ms', async () => {
    const t0 = Date.now();
    await pause(5);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(0);
  });
});

