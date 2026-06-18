# STATUS: ACTIVE (revived 2026-06-17)

Kondor Mobile (Expo) — non-custodial Koinos wallet.

**History:** Marked DEAD/deprioritized on 2026-05-16 during a portfolio review. Revived on 2026-06-17 to continue the security-hardening work on the `fix-security-issues` branch.

## Current state (2026-06-17)
- Branch: `fix-security-issues` (in-progress security hardening: PIN/lock auth flow, URL validation, clipboard hardening, dApp/WebView review, test suite).
- Tests: **85 passing / 7 suites** (`npm test`).
- Type check: `tsc --noEmit` is clean for all branch-touched code. 9 **pre-existing** baseline errors remain in `src/lib/manualTokenContract.ts`, `src/stores/tokenStore.ts`, and `src/lib/convertAbi.ts` (koilib typing gaps, untouched by this branch — never blocked the running app).
- Dependency fix applied: `@expo/vector-icons` is now a direct dependency (was only available transitively/nested, which broke `tsc` resolution from `src/`).

## Security audit (2026-06-17)
- Ran `npm audit fix` (non-breaking patches): cleared both criticals (incl. direct `protobufjs` RCE) and 10 of 11 highs.
- Migrated **ethers v5 → v6** (see below), which removed the `@ethersproject/providers` ws dependency. An npm `override` then pins ethers' own `ws` to `8.21.0` (patched). **0 critical, 0 high remain.**
- Result: **65 → 32** vulnerabilities (32 moderate, all transitive Expo/Metro build-chain; not in the shipped app bundle). Revisit after a fuller dep refresh.

## ethers v5 → v6 migration (2026-06-17) — code DONE, device check PENDING
- API surface was tiny: all ethers usage lived in `src/lib/wallet.ts` (3 call sites) plus the `@ethersproject/shims` polyfill in `src/lib/crypto.ts`.
- Changes: `HDNode.fromMnemonic().derivePath()` → `HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(m), 'm').derivePath()`; `ethers.utils.HDNode` validation → `Mnemonic.fromPhrase`; removed v5-only `@ethersproject/shims` import + dependency.
- **Safety net:** golden-master tests (`src/lib/__tests__/wallet.test.ts`) lock exact derived address/privKey/pubKey for a known mnemonic. v6 derives **byte-identical** keys to v5 — verified, snapshots unchanged. No risk of locking users out.
- ⚠️ **PENDING — must do before shipping:** the golden-master test runs in Node (Jest), so it does NOT exercise the React Native runtime. Removing `@ethersproject/shims` changes the RN polyfill surface. Smoke-test on a real device/simulator: create wallet → import wallet → sign & broadcast a transaction. Only after that is the migration truly complete.

## Next steps
- ~~Plan the ethers v5→v6 migration~~ **Code DONE 2026-06-17.** Remaining: on-device smoke test (see above).
- ~~Clean up the 9 pre-existing koilib type errors~~ **DONE 2026-06-17 — `tsc --noEmit` now fully clean (0 errors).**
- Squash the `WIP checkpoint` commits into reviewable commits and open a PR for the security work.
