import { dryRunRcLimit, DEFAULT_DRY_RUN_RC_LIMIT } from '../manaEstimation';

describe('dryRunRcLimit', () => {
  // The bug: the dry-run used 0.9 * available, so a stale/low `available` reading
  // (e.g. right after funding, before the node reflects it) capped the dry-run
  // below the transfer cost and the node rejected it with "insufficient rc".
  // The fix mirrors the kondor extension: dry-run at MAX rc (balance).

  it('uses maxRc even when available rc reads stale-low (the bug case)', () => {
    // funded account: balance ~10 KOIN, but available rc momentarily reads 0.1M
    expect(dryRunRcLimit({ maxRc: 934_000_000, availableRc: 100_000 })).toBe(934_000_000);
  });

  it('falls back to full available rc when maxRc is unknown (not 0.9x)', () => {
    expect(dryRunRcLimit({ availableRc: 50_000_000 })).toBe(50_000_000);
  });

  it('ignores zero / missing maxRc and uses available', () => {
    expect(dryRunRcLimit({ maxRc: 0, availableRc: 50_000_000 })).toBe(50_000_000);
    expect(dryRunRcLimit({ maxRc: undefined, availableRc: 50_000_000 })).toBe(50_000_000);
  });

  it('returns the default when neither is usable', () => {
    expect(dryRunRcLimit({})).toBe(DEFAULT_DRY_RUN_RC_LIMIT);
    expect(dryRunRcLimit({ maxRc: 0, availableRc: 0 })).toBe(DEFAULT_DRY_RUN_RC_LIMIT);
  });

  it('floors fractional inputs', () => {
    expect(dryRunRcLimit({ maxRc: 12.9 })).toBe(12);
  });
});
