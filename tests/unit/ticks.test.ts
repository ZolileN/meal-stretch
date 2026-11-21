import { describe, expect, it } from 'vitest';
import { mergeTicks, type LocalTick } from '@/lib/offline/ticks';

const local = (key: string, ticked: boolean, at: string): LocalTick => ({ id: `p|${key}`, planId: 'p', key, ticked, at, synced: false });

describe('tick merge (LST-3)', () => {
  it('newer timestamp wins either way', () => {
    const server = { a: { ticked: true, at: '2026-11-21T10:00:00.000Z' }, b: { ticked: false, at: '2026-11-21T10:00:00.000Z' } };
    expect(mergeTicks(server, [local('a', false, '2026-11-21T09:00:00.000Z'), local('b', true, '2026-11-21T11:00:00.000Z'), local('c', true, '2026-11-21T08:00:00.000Z')])).toEqual({
      a: true, b: true, c: true,
    });
  });
});
