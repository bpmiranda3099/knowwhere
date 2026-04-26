import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('db helpers (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('logs on pool error event', async () => {
    const poolQuery = vi.fn();
    const poolConnect = vi.fn();
    const poolEnd = vi.fn();
    const poolOn = vi.fn();

    vi.doMock('pg', () => ({
      Pool: vi.fn(() => ({
        query: poolQuery,
        connect: poolConnect,
        end: poolEnd,
        on: poolOn
      }))
    }));
    vi.doMock('../../../src/config/env', () => ({ config: { DATABASE_URL: 'postgres://x' } }));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await import('../../../src/db/db');

    const onErrorCall = poolOn.mock.calls.find((c) => c[0] === 'error');
    expect(onErrorCall).toBeTruthy();
    const handler = onErrorCall?.[1] as ((err: unknown) => void) | undefined;
    handler?.(new Error('pg boom'));

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('query delegates to pool.query', async () => {
    const poolQuery = vi.fn().mockResolvedValue({ rows: [] });
    const poolConnect = vi.fn();
    const poolEnd = vi.fn();
    const poolOn = vi.fn();

    vi.doMock('pg', () => ({
      Pool: vi.fn(() => ({
        query: poolQuery,
        connect: poolConnect,
        end: poolEnd,
        on: poolOn
      }))
    }));
    vi.doMock('../../../src/config/env', () => ({ config: { DATABASE_URL: 'postgres://x' } }));

    const { query } = await import('../../../src/db/db');
    await query('SELECT 1', []);
    expect(poolQuery).toHaveBeenCalledWith('SELECT 1', []);
  });

  it('getClient delegates to pool.connect', async () => {
    const poolQuery = vi.fn();
    const poolConnect = vi.fn().mockResolvedValue({} as any);
    const poolEnd = vi.fn();
    const poolOn = vi.fn();

    vi.doMock('pg', () => ({
      Pool: vi.fn(() => ({
        query: poolQuery,
        connect: poolConnect,
        end: poolEnd,
        on: poolOn
      }))
    }));
    vi.doMock('../../../src/config/env', () => ({ config: { DATABASE_URL: 'postgres://x' } }));

    const { getClient } = await import('../../../src/db/db');
    await getClient();
    expect(poolConnect).toHaveBeenCalled();
  });

  it('closePool delegates to pool.end', async () => {
    const poolQuery = vi.fn();
    const poolConnect = vi.fn();
    const poolEnd = vi.fn().mockResolvedValue(undefined);
    const poolOn = vi.fn();

    vi.doMock('pg', () => ({
      Pool: vi.fn(() => ({
        query: poolQuery,
        connect: poolConnect,
        end: poolEnd,
        on: poolOn
      }))
    }));
    vi.doMock('../../../src/config/env', () => ({ config: { DATABASE_URL: 'postgres://x' } }));

    const { closePool } = await import('../../../src/db/db');
    await closePool();
    expect(poolEnd).toHaveBeenCalled();
  });
});

