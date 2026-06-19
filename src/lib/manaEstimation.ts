/**
 * Mana / RC estimation helpers.
 */

/** Fallback rc_limit for the dry-run when neither max nor available rc is known. */
export const DEFAULT_DRY_RUN_RC_LIMIT = 100_000_000; // 100M

/**
 * Pick the rc_limit to use for the estimation dry-run (broadcast:false).
 *
 * Prefer the account's MAX rc (its KOIN balance), NOT a fraction of currently
 * *available* rc. Available rc can momentarily read low or stale — e.g. right
 * after funding before the queried node applies the block, or when mana is
 * reserved by a pending tx — which would cap the dry-run below the transfer's
 * real cost and make the node reject it with "insufficient rc" (then a retry
 * against a synced node works). The dry-run doesn't consume rc, so using max is
 * safe and robust. This mirrors the kondor extension's estimateAndAdjustMana,
 * which dry-runs at maxMana and then sets a tight final limit (1.1 * rc_used).
 */
export function dryRunRcLimit(opts: { maxRc?: number; availableRc?: number }): number {
  const max = Number(opts.maxRc) || 0;
  if (max > 0) return Math.floor(max);
  const available = Number(opts.availableRc) || 0;
  if (available > 0) return Math.floor(available);
  return DEFAULT_DRY_RUN_RC_LIMIT;
}
