import { describe, expect, it } from 'vitest';
import { pruneLoyalty, readShops, relevantPrograms, toggleShop, type BranchSummary } from '@/lib/location/store';

const b = (id: number, retailerId: string): BranchSummary => ({ branchId: id, retailerId, retailerName: retailerId, branchName: `TEST ${retailerId}` });
const retailers = [
  { id: 'checkers', loyaltyProgramId: 'xtra_savings', loyaltyProgramName: 'Xtra Savings' },
  { id: 'shoprite', loyaltyProgramId: 'xtra_savings', loyaltyProgramName: 'Xtra Savings' },
  { id: 'spar', loyaltyProgramId: 'spar_rewards', loyaltyProgramName: 'SPAR Rewards' },
  { id: 'pnp', loyaltyProgramId: 'smart_shopper', loyaltyProgramName: 'Smart Shopper' },
  { id: 'usave', loyaltyProgramId: null, loyaltyProgramName: null },
];

describe('toggleShop', () => {
  it('first tap = main, second = top-up, retap = unselect', () => {
    let s = toggleShop({ main: null, topUp: null }, b(1, 'checkers'));
    expect(s.main?.branchId).toBe(1);
    s = toggleShop(s, b(2, 'spar'));
    expect(s.topUp?.branchId).toBe(2);
    s = toggleShop(s, b(3, 'pnp'));
    expect([s.main?.branchId, s.topUp?.branchId]).toEqual([1, 3]);
    s = toggleShop(s, b(3, 'pnp'));
    expect(s.topUp).toBeNull();
    s = toggleShop({ main: b(1, 'checkers'), topUp: b(2, 'spar') }, b(1, 'checkers'));
    expect([s.main?.branchId, s.topUp]).toEqual([2, null]);
  });
});

describe('loyalty chips (ONB-2)', () => {
  it('only programmes for the chosen shops, deduplicated', () => {
    expect(relevantPrograms({ main: b(1, 'checkers'), topUp: b(2, 'shoprite') }, retailers)).toEqual([{ id: 'xtra_savings', name: 'Xtra Savings' }]);
    expect(relevantPrograms({ main: b(1, 'spar'), topUp: null }, retailers).map((p) => p.id)).toEqual(['spar_rewards']);
    expect(relevantPrograms({ main: b(1, 'usave'), topUp: null }, retailers)).toEqual([]);
  });
  it('prunes cards that no longer apply', () => {
    expect(pruneLoyalty(['smart_shopper', 'xtra_savings', 'xtra_savings'], [{ id: 'xtra_savings' }])).toEqual(['xtra_savings']);
  });
  it('readShops tolerates garbage', () => {
    expect(readShops('not json').main).toBeNull();
    expect(readShops(JSON.stringify({ main: 5 })).main).toBeNull();
  });
});

import { parseShops } from '@/lib/location/store';
describe('parseShops (hand-written validator)', () => {
  const ok = { location: { lat: -34.077, lng: 18.846, label: 'Somerset West', source: 'gps' }, main: { branchId: 1, retailerId: 'checkers', retailerName: 'Checkers', branchName: 'TEST', distanceM: 110 }, topUp: null, loyalty: ['xtra_savings'], updatedAt: '2026-11-21T00:00:00Z' };
  it('accepts valid data and defaults loyalty', () => {
    expect(parseShops(ok)).toEqual(ok);
    const { loyalty: _l, ...noLoyalty } = ok;
    expect(parseShops(noLoyalty)?.loyalty).toEqual([]);
  });
  it.each([
    { ...ok, location: { ...ok.location, source: 'satellite' } },
    { ...ok, main: { ...ok.main, branchId: 1.5 } },
    { ...ok, main: { ...ok.main, distanceM: -1 } },
    { ...ok, loyalty: [1] },
    { ...ok, updatedAt: 5 },
    [],
  ])('rejects %#', (bad) => expect(parseShops(bad)).toBeNull());
});
