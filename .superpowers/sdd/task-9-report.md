# Task 9 Report: History And Pending Transaction Parity

## What changed

- Added a persisted `transactionStore` for optimistic pending activity, scoped by `networkMode + address`, with explicit confirm-by-local-id, confirm-by-chain-id, and stale-prune actions.
- Added store tests covering add/persist, local confirmation, chain confirmation, stale removal, and scope isolation.
- Updated `useTransactionHistory` to:
  - merge confirmed chain history with local pending entries,
  - keep stale-network suppression intact for confirmed history,
  - prune stale pending entries,
  - reconcile/remove pending entries when fetched chain history includes the same transaction id.
- Wired pending writes into all broadcast-success paths:
  - `SendScreen`
  - swap broadcast callback in `useNativeSwap` / `swapTransaction`
  - dApp `signer:sendTransaction` approval success
  - WalletConnect `koinos_signAndSendTransaction` approval success
- Added `Activity` filters for `all`, `send`, `receive`, `swap`, and `pending`, plus visible pending badges/status text.
- Added a Home header Activity shortcut with a pending-count badge and pending-first deep link.
- Added a global AsyncStorage Jest mock in `jest.setup.ts` so the new persisted store loads cleanly across the existing test graph.

## TDD Evidence

### RED

Command:

```bash
npm test -- src/stores/__tests__/transactionStore.test.ts --runInBand
```

Output:

```text
FAIL src/stores/__tests__/transactionStore.test.ts
  transactionStore
    ✕ adds a pending transaction and persists only non-sensitive metadata
    ✕ confirms a pending transaction by local id
    ✕ confirms a pending transaction by chain transaction id
    ✕ removes stale pending transactions without touching fresh ones
    ✕ scopes pending transactions by network and address

  Cannot find module '../transactionStore' from 'src/stores/__tests__/transactionStore.test.ts'
```

Expected failure:

- The new store file did not exist yet, so the store-contract tests failed immediately on module resolution.

### GREEN

Command:

```bash
npm test -- src/stores/__tests__/transactionStore.test.ts --runInBand
```

Output:

```text
PASS src/stores/__tests__/transactionStore.test.ts
  transactionStore
    ✓ adds a pending transaction and persists only non-sensitive metadata
    ✓ confirms a pending transaction by local id
    ✓ confirms a pending transaction by chain transaction id
    ✓ removes stale pending transactions without touching fresh ones
    ✓ scopes pending transactions by network and address
```

## Verification commands and results

1. Focused task verification

```bash
npm test -- src/stores/__tests__/transactionStore.test.ts src/hooks/__tests__ --runInBand
```

Result: PASS, 5 suites / 27 tests.

2. Type-check

```bash
npx tsc --noEmit
```

Result: PASS, exit code 0.

3. Full Jest suite

```bash
npm test -- --runInBand
```

Result: PASS, 40 suites / 301 tests.

4. React Doctor changed-scope scan

```bash
npx -y react-doctor@latest . --verbose --scope changed --base master
```

Result: advisory scan only, exit code 1 with 35 changed-scope findings. The new `ActivityScreen` mapped-`ScrollView` warning was removed before final verification; remaining findings are pre-existing debt in changed files and adjacent screens.

## Files changed

- `.superpowers/sdd/task-9-report.md`
- `jest.setup.ts`
- `src/components/WalletConnectHandler.tsx`
- `src/hooks/__tests__/useTransactionHistory.test.ts`
- `src/hooks/useNativeSwap.ts`
- `src/hooks/useTransactionHistory.ts`
- `src/lib/swapTransaction.ts`
- `src/navigation/TabNavigator.tsx`
- `src/screens/ActivityScreen.tsx`
- `src/screens/DAppWebViewScreen.tsx`
- `src/screens/HomeScreen.tsx`
- `src/screens/SendScreen.tsx`
- `src/stores/__tests__/transactionStore.test.ts`
- `src/stores/transactionStore.ts`

## Self-review findings

- Pending metadata audit:
  - Persisted fields are limited to display-safe optimistic history data: local id, network/address scope, chain tx id, type, amount, token identifiers/symbol/decimals/icon, from/to, timestamp, fee, payer, optional swap labels, and optional source/origin labels.
  - The store does **not** persist private keys, signer instances, raw signed transactions, raw ABI payloads, raw signatures, or signer auth material.
  - The store test explicitly probes for sensitive strings and verifies they are not persisted.
- Network scoping:
  - Pending entries are filtered by active `networkMode + address`.
  - Confirmed history still obeys the existing settled-scope guard from Task 2; only current-scope pending entries are merged in.
- Confirmation parity:
  - Each history fetch prunes stale entries and removes pending entries whose chain transaction ids now exist in confirmed history.
- Broadcast parity:
  - Send and swap paths write direct optimistic metadata from the UI flow.
  - dApp and WalletConnect paths derive optimistic metadata from the signed transaction when parseable; otherwise they fall back to a generic pending `TX` row until confirmed history replaces it.

## Concerns

- React Doctor still reports pre-existing changed-scope issues in `HomeScreen`, `SendScreen`, `WalletConnectHandler`, and nearby files. They were not introduced by this task, and I left them alone to keep Task 9 scoped.
- For dApp/WalletConnect broadcasts that are not recognizable as transfers or swaps, the optimistic row intentionally falls back to a generic pending `TX` entry until chain history confirms and replaces it.

## Review Fixes: 33df49f..bbce2ab

### Finding 1: Send pending row timing

- Added an accepted-broadcast hook to the manual token transfer stack and threaded it through `useKoinosStore.transfer` / `transferToken`.
- Updated `SendScreen` to record pending metadata from that hook, so the optimistic send row is written immediately after broadcast acceptance and before the existing confirmation wait resolves.
- Kept the pending payload scoped to `networkMode + address` and limited it to the existing display-safe metadata fields.

### Finding 2: swapTransaction callback ordering

- Moved `swapTransaction`'s `onBroadcast` callback to after receipt-level RPC error checks.
- Pending swap metadata is now emitted only on the broadcast path that `executeSwapTransaction` itself treats as accepted.

### Regression coverage

Commands:

```bash
npm test -- src/screens/__tests__/SendScreen.test.tsx src/lib/__tests__/manualTokenContract.test.ts src/lib/__tests__/swapTransaction.test.ts --runInBand
npx tsc --noEmit
npm test -- --runInBand
```

Results:

- Focused timing tests: PASS, 3 suites / 15 tests.
- Type-check: PASS, exit code 0.
- Full Jest suite: PASS, 41 suites / 303 tests.
