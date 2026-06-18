# STATUS: ACTIVE (revived 2026-06-17)

Kondor Mobile (Expo) — non-custodial Koinos wallet.

**History:** Marked DEAD/deprioritized on 2026-05-16 during a portfolio review. Revived on 2026-06-17 to continue the security-hardening work on the `fix-security-issues` branch.

## Current state (2026-06-17)
- Branch: `fix-security-issues` (in-progress security hardening: PIN/lock auth flow, URL validation, clipboard hardening, dApp/WebView review, test suite).
- Tests: **85 passing / 7 suites** (`npm test`).
- Type check: `tsc --noEmit` is clean for all branch-touched code. 9 **pre-existing** baseline errors remain in `src/lib/manualTokenContract.ts`, `src/stores/tokenStore.ts`, and `src/lib/convertAbi.ts` (koilib typing gaps, untouched by this branch — never blocked the running app).
- Dependency fix applied: `@expo/vector-icons` is now a direct dependency (was only available transitively/nested, which broke `tsc` resolution from `src/`).

## Security audit (2026-06-17)
- Ran `npm audit fix` (non-breaking patches): cleared both criticals (incl. direct `protobufjs` RCE) and 10 of 11 highs. **65 → 47** vulnerabilities (1 high, 34 moderate, 12 low remain).
- **DEFERRED — known item:** `ws` (high, memory-exhaustion DoS) is only fixable by upgrading to `ethers@6`, a breaking major. The wallet's mnemonic/HD-key derivation is built on **ethers v5**, so this must be migrated deliberately, not auto-bumped. Schedule an ethers v5→v6 migration spike before shipping to production.
- Remaining moderate/low are transitive (Expo/Metro build chain); revisit after a fuller dep refresh.

## Next steps
- Plan the ethers v5→v6 migration (unblocks the last high-sev `ws` advisory). **In progress.**
- ~~Clean up the 9 pre-existing koilib type errors~~ **DONE 2026-06-17 — `tsc --noEmit` now fully clean (0 errors).**
- Squash the `WIP checkpoint` commits into reviewable commits and open a PR for the security work.
