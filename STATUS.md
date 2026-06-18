# STATUS: ACTIVE (revived 2026-06-17)

Kondor Mobile (Expo) — non-custodial Koinos wallet.

**History:** Marked DEAD/deprioritized on 2026-05-16 during a portfolio review. Revived on 2026-06-17 to continue the security-hardening work on the `fix-security-issues` branch.

## Current state (2026-06-17)
- Branch: `fix-security-issues` (in-progress security hardening: PIN/lock auth flow, URL validation, clipboard hardening, dApp/WebView review, test suite).
- Tests: **85 passing / 7 suites** (`npm test`).
- Type check: `tsc --noEmit` is clean for all branch-touched code. 9 **pre-existing** baseline errors remain in `src/lib/manualTokenContract.ts`, `src/stores/tokenStore.ts`, and `src/lib/convertAbi.ts` (koilib typing gaps, untouched by this branch — never blocked the running app).
- Dependency fix applied: `@expo/vector-icons` is now a direct dependency (was only available transitively/nested, which broke `tsc` resolution from `src/`).

## Next steps
- Decide whether to clean up the 9 pre-existing koilib type errors.
- Squash the `WIP checkpoint` commits into reviewable commits and open a PR for the security work.
