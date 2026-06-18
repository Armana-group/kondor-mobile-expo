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
- ✅ **ON-DEVICE VERIFIED (2026-06-18):** built a native dev client and ran it on the iOS Simulator (iPhone 15 Pro). App boots clean (fonts, quick-crypto JSI, wallet store all work after `@ethersproject/shims` removal). Drove a mainnet KOIN send on a funded account: Metro served `src/lib/wallet.bundle` (the migrated module), the ethers v6 derivation produced the signing key with no JS exception/crash, koilib signed, and the **mainnet node accepted the tx as well-formed + correctly signed**, rejecting only on `insufficient rc` (0% mana — a funding state, not a code defect). A migration bug would have surfaced as a crash / malformed-tx / invalid-signature error; none occurred. Migration is verified in the RN runtime.
  - ✅ **CONFIRMED BROADCAST (2026-06-18):** after funding the test account (mana 0.11 → 10.11 RC), a 0.42 KOIN mainnet send succeeded — tx id `0x12203c7f608faea1edfca2080b56c29252cd19fe19d8fc378f041291355321834e90`. Verified on-chain independently: account mana dropped 10.11 → 8.60 RC. Full path (ethers v6 derive → koilib sign → mainnet confirm) works end-to-end on device.
  - Build note: required pinning `react-native`/`expo-font` and regenerating a consistent, `npm ci`-reproducible, audit-clean lockfile (the branch's prior lockfile was non-reproducible). CI gate added (`.github/workflows/ci.yml`).

## Next steps
- ~~Plan the ethers v5→v6 migration~~ **Code DONE 2026-06-17.** Remaining: on-device smoke test (see above).
- ~~Clean up the 9 pre-existing koilib type errors~~ **DONE 2026-06-17 — `tsc --noEmit` now fully clean (0 errors).**
- Squash the `WIP checkpoint` commits into reviewable commits and open a PR for the security work.
