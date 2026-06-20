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
