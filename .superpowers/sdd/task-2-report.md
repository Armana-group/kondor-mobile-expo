# Task 2 Report: Network Foundation

## What I implemented

- Added `src/stores/networkStore.ts` with:
  - `NetworkMode = 'mainnet' | 'harbinger'`
  - typed `NetworkConfig`
  - persisted `useNetworkStore`
  - `getActiveNetworkConfig()`
  - `setNetworkMode(mode)`
- Added `src/stores/__tests__/networkStore.test.ts` covering:
  - default mode is `mainnet`
  - Harbinger mode can be selected and persisted
  - invalid persisted values normalize back to `mainnet`
  - config shape includes `chainId`, `rpcNodes`, `koinContract`, `explorer`, `rest`, `freeManaSharer`, and `isTestnet`
- Expanded `src/lib/constants.ts` so `MAINNET` and `TESTNET` carry the network metadata Task 2 needs without breaking existing imports.
- Updated `src/stores/koinosStore.ts` to initialize and refresh providers against the active network, and to reinitialize when the stored provider chain does not match the active app network.
- Updated `src/stores/tokenStore.ts` to scope token cache state by `networkMode:address`, clear stale balances on network changes, and fetch balances from the active network provider.
- Updated `src/hooks/useTransactionHistory.ts` and `src/lib/txHistory.ts` to use active-network REST config, prefix timestamp cache entries by `networkMode:address`, and block stale in-flight history responses from repainting the previous network.
- Updated `src/components/WalletConnectHandler.tsx`, `src/stores/walletConnectStore.ts`, and `src/screens/DAppWebViewScreen.tsx` so provider calls and WalletConnect namespace approvals follow the active network instead of hardcoded mainnet defaults.
- Added a history cache regression test in `src/lib/__tests__/txHistory.test.ts`.

## What I tested and exact results

1. Focused RED/GREEN target:
   - `npm test -- src/stores/__tests__/networkStore.test.ts --runInBand`
   - Final result: `PASS src/stores/__tests__/networkStore.test.ts` with `4 passed, 4 total`

2. Focused iteration suite:
   - `npm test -- src/stores/__tests__/networkStore.test.ts src/lib/__tests__/txHistory.test.ts src/hooks/__tests__ --runInBand`
   - Result: `3 passed, 3 total`, `20 passed, 20 total`

3. Task 2 verification command:
   - `npm test -- src/stores/__tests__/networkStore.test.ts src/hooks/__tests__ src/stores/__tests__ --runInBand`
   - Result: `2 passed, 2 total`, `13 passed, 13 total`

4. Required pre-commit full test suite:
   - `npm test -- --runInBand`
   - Result: `19 passed, 19 total`, `157 passed, 157 total`, `2 snapshots passed`

5. Required type-check:
   - `npx tsc --noEmit`
   - Result: passed with exit code `0`

## TDD evidence

### RED

Command:

```bash
npm test -- src/stores/__tests__/networkStore.test.ts --runInBand
```

Output:

```text
FAIL src/stores/__tests__/networkStore.test.ts
  networkStore
    ✕ defaults to mainnet
    ✕ persists Harbinger mode
    ✕ normalizes invalid persisted values to mainnet
    ✕ exposes the required config shape

  Cannot find module '../networkStore' from 'src/stores/__tests__/networkStore.test.ts'
```

### GREEN

Command:

```bash
npm test -- src/stores/__tests__/networkStore.test.ts --runInBand
```

Output:

```text
PASS src/stores/__tests__/networkStore.test.ts
  networkStore
    ✓ defaults to mainnet
    ✓ persists Harbinger mode
    ✓ normalizes invalid persisted values to mainnet
    ✓ exposes the required config shape

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

## Files changed

- `.superpowers/sdd/task-2-report.md`
- `src/components/WalletConnectHandler.tsx`
- `src/hooks/useTransactionHistory.ts`
- `src/lib/__tests__/txHistory.test.ts`
- `src/lib/constants.ts`
- `src/lib/txHistory.ts`
- `src/screens/DAppWebViewScreen.tsx`
- `src/stores/__tests__/networkStore.test.ts`
- `src/stores/koinosStore.ts`
- `src/stores/networkStore.ts`
- `src/stores/tokenStore.ts`
- `src/stores/walletConnectStore.ts`

## Self-review findings or concerns

- `TransactionApprovalModal.tsx` and the native swap path still use mainnet constants directly. I left them untouched because they are outside the Task 2 file list and the current mainnet swap baseline must not regress.
- Harbinger history/transaction REST metadata is now centralized in the network config, but I did not add live endpoint verification; the public testnet host behavior should be confirmed when the UI task for network switching lands.

---

## Fix pass after task review

### Findings addressed

- Fixed `TransactionApprovalModal` so signing/dry-run provider creation, free-mana payer selection, and `chain_id` all use the active network instead of hardcoded mainnet values.
- Fixed Harbinger token initialization so testnet no longer bootstraps or queries mainnet token contracts. The Harbinger fallback token set is intentionally KOIN-only.
- Fixed persisted-network adoption on `HomeScreen` so initialization waits for network hydration and re-runs when the active network scope changes.
- Fixed explorer URL generation so Activity and Token Detail open the active network explorer instead of mainnet-only URLs.
- Fixed native swap to fail closed on Harbinger with a clear unsupported-network error instead of using mainnet KoinDX paths.

### Additional regression coverage

- Added `src/components/__tests__/TransactionApprovalModal.test.tsx`
- Added `src/screens/__tests__/HomeScreen.test.tsx`
- Added `src/stores/__tests__/tokenStore.test.ts`
- Extended `src/lib/__tests__/explorer.test.ts`
- Extended `src/hooks/__tests__/useNativeSwap.test.ts`
- Added `@types/react-test-renderer` for typed RN component tests

### RED

Command:

```bash
npm test -- src/lib/__tests__/explorer.test.ts src/stores/__tests__/tokenStore.test.ts src/screens/__tests__/HomeScreen.test.tsx src/components/__tests__/TransactionApprovalModal.test.tsx src/hooks/__tests__/useNativeSwap.test.ts --runInBand
```

Key failures before the fix:

```text
TypeError: getTokenListUrlForNetwork is not a function
TypeError: buildTokensForNetwork is not a function
TypeError: getSwapUnavailableMessage is not a function
Expected Harbinger explorer URLs, received mainnet Koinscan URLs
```

### GREEN

Focused regression suite:

```bash
npm test -- src/lib/__tests__/explorer.test.ts src/stores/__tests__/tokenStore.test.ts src/screens/__tests__/HomeScreen.test.tsx src/components/__tests__/TransactionApprovalModal.test.tsx src/hooks/__tests__/useNativeSwap.test.ts --runInBand
```

Result:

```text
PASS src/lib/__tests__/explorer.test.ts
PASS src/stores/__tests__/tokenStore.test.ts
PASS src/screens/__tests__/HomeScreen.test.tsx
PASS src/components/__tests__/TransactionApprovalModal.test.tsx
PASS src/hooks/__tests__/useNativeSwap.test.ts

Test Suites: 5 passed, 5 total
Tests:       21 passed, 21 total
```

Broader network-focused verification:

```bash
npm test -- src/stores/__tests__/networkStore.test.ts src/stores/__tests__/tokenStore.test.ts src/lib/__tests__/txHistory.test.ts src/lib/__tests__/explorer.test.ts src/hooks/__tests__/useNativeSwap.test.ts src/screens/__tests__/HomeScreen.test.tsx src/components/__tests__/TransactionApprovalModal.test.tsx --runInBand
```

Result:

```text
Test Suites: 7 passed, 7 total
Tests:       32 passed, 32 total
```

Required final verification:

```bash
npm test -- --runInBand
npx tsc --noEmit
```

Result:

```text
PASS 22 test suites, 167 tests, 2 snapshots
tsc exit code 0
```

### Remaining concerns

- Harbinger swap is intentionally disabled for this parity pass. Mainnet swap behavior remains unchanged; Harbinger now errors clearly instead of drifting onto mainnet KoinDX contracts.

---

## Second fix pass after re-review

### Finding addressed

- WalletConnect now reconciles existing sessions whenever the active network changes by disconnecting sessions whose approved chain/account namespace no longer matches the app-wide network.
- Generic WalletConnect request handling now fails closed for stale sessions instead of servicing provider calls against the wrong network.
- Added focused regression coverage for both the store-side reconciliation path and the handler-side request guard.

### Additional regression coverage

- Added `src/stores/__tests__/walletConnectStore.test.ts`
- Added `src/components/__tests__/WalletConnectHandler.test.tsx`

### RED

Command:

```bash
npm test -- src/stores/__tests__/walletConnectStore.test.ts src/components/__tests__/WalletConnectHandler.test.tsx --runInBand
```

Key failures before the fix:

```text
TypeError: useWalletConnectStore.getState(...).reconcileSessionsForActiveNetwork is not a function
Expected number of calls: 1
Received number of calls: 0
Expected: 9, "stale-topic", StringMatching /active network/i
Number of calls: 0
```

### GREEN

Focused WalletConnect regression suite:

```bash
npm test -- src/stores/__tests__/walletConnectStore.test.ts src/components/__tests__/WalletConnectHandler.test.tsx --runInBand
```

Result:

```text
PASS src/components/__tests__/WalletConnectHandler.test.tsx
PASS src/stores/__tests__/walletConnectStore.test.ts

Test Suites: 2 passed, 2 total
Tests:       3 passed, 3 total
```

Broader focused verification:

```bash
npm test -- src/stores/__tests__/networkStore.test.ts src/stores/__tests__/walletConnectStore.test.ts src/components/__tests__/WalletConnectHandler.test.tsx --runInBand
```

Result:

```text
Test Suites: 3 passed, 3 total
Tests:       7 passed, 7 total
```

Required final verification:

```bash
npm test -- --runInBand
npx tsc --noEmit
```

Result:

```text
PASS 24 test suites, 170 tests, 2 snapshots
tsc exit code 0
```

### Remaining concerns

- Session reconciliation disconnects mismatched peers instead of attempting in-place namespace mutation. That is intentional here because it uses confirmed WalletKit APIs and keeps the behavior explicit.

---

## Third fix pass after critical re-review

### Finding addressed

- WalletConnect transaction approvals now stay fail-closed until `useNetworkStore.hasHydrated` is true.
- WalletConnect topic validation no longer treats the pre-hydration mainnet fallback as an approved active-network match.
- Once hydration completes, stale WalletConnect topics are rejected before any transaction approval modal is shown, while the existing hydrated-session reconciliation flow remains intact.
- Generic WalletConnect request handling now uses the same hydration/topic validation path, so stale requests continue to defer pre-hydration and reject cleanly after hydration.

### Additional regression coverage

- Extended `src/components/__tests__/WalletConnectHandler.test.tsx`
- Extended `src/stores/__tests__/walletConnectStore.test.ts`

### RED

Command:

```bash
npm test -- src/stores/__tests__/walletConnectStore.test.ts src/components/__tests__/WalletConnectHandler.test.tsx --runInBand
```

Key failures before the fix:

```text
TypeError: useWalletConnectStore.getState(...).getSessionTopicValidationForActiveNetwork is not a function
Expected: false
Received: true
```

The second failure was the pre-hydration regression: `WalletConnectHandler` was still surfacing the transaction approval modal before network hydration completed.

### GREEN

Focused WalletConnect hydration-race regression suite:

```bash
npm test -- src/stores/__tests__/walletConnectStore.test.ts src/components/__tests__/WalletConnectHandler.test.tsx --runInBand
```

Result:

```text
PASS src/components/__tests__/WalletConnectHandler.test.tsx
PASS src/stores/__tests__/walletConnectStore.test.ts

Test Suites: 2 passed, 2 total
Tests:       5 passed, 5 total
```

### Required final verification

```bash
npm test -- src/stores/__tests__/networkStore.test.ts src/stores/__tests__/walletConnectStore.test.ts src/components/__tests__/WalletConnectHandler.test.tsx --runInBand
npm test -- --runInBand
npx tsc --noEmit
```

Result:

```text
Focused suite: 3 passed, 9 tests
Full suite: 24 passed, 172 tests, 2 snapshots
tsc exit code 0
```

### Remaining concerns

- `reconcileSessionsForActiveNetwork()` still owns the bulk session disconnect path after hydration. This fix keeps that behavior, but request gating now blocks stale-topic approval UI even if reconciliation resolves a moment later.
