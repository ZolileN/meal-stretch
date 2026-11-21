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
