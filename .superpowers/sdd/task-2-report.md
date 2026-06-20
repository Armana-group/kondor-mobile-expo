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

## Tenth fix pass after re-review

### Finding addressed

- Guarded `HomeScreen` balance/mana writes behind the in-flight request's `network:address` scope so a previous-network response cannot repaint the current screen after a network switch.
- Reworked `SendScreen` to derive token selection, available balance display, and send-button enablement from active-scope token state instead of raw `useTokenStore().tokens` or `useWalletStore().balance`.
- During a scope transition, `SendScreen` now shows a loading balance state and keeps send/max disabled until the active-network token scope is ready.

### Additional regression coverage

- Extended `src/screens/__tests__/HomeScreen.test.tsx`
- Added `src/screens/__tests__/SendScreen.test.tsx`

### RED

Command:

```bash
npm test -- src/screens/__tests__/HomeScreen.test.tsx src/screens/__tests__/SendScreen.test.tsx --runInBand
```

Key failures before the fix:

```text
Expected value: not "Available: 12.34 KOIN"
Received array: ["Send KOIN", ..., "Available: 12.34 KOIN", ...]

Expected value: "70.0%"
Received array: [..., "Mana Available", "12.5%", ...]
```

### GREEN

Focused regression suite:

```bash
npm test -- src/screens/__tests__/HomeScreen.test.tsx src/screens/__tests__/SendScreen.test.tsx --runInBand
```

Result:

```text
PASS src/screens/__tests__/SendScreen.test.tsx
PASS src/screens/__tests__/HomeScreen.test.tsx

Test Suites: 2 passed, 2 total
Tests:       4 passed, 4 total
```

## Ninth fix section after final review

### Findings addressed

- HomeScreen now derives visible token rows and KOIN balance from the active `networkMode:address` cache scope, so a network flip hides prior-network balances immediately instead of waiting for reset effects.
- `useTransactionHistory` now derives its public result from a settled scope key, so a new network scope returns empty/loading state until that scope's fetch completes or errors.
- WalletConnect now routes `koinos_getNextNonce` to `provider.getNextNonce` instead of reusing `provider.getNonce`.

### Additional regression coverage

- Added `src/hooks/__tests__/useTransactionHistory.test.ts`
- Extended `src/screens/__tests__/HomeScreen.test.tsx`
- Extended `src/components/__tests__/WalletConnectHandler.test.tsx`

### RED

Command:

```bash
npm test -- src/screens/__tests__/HomeScreen.test.tsx src/hooks/__tests__/useTransactionHistory.test.ts src/components/__tests__/WalletConnectHandler.test.tsx --runInBand
```

Key failures before the fix:

```text
Expected value: "0.00 KOIN"
Received array: [..., "12.34 KOIN", ...]

Expected: "1WalletAddress"
Number of calls: 0
```

### GREEN

Focused regression suite:

```bash
npm test -- src/stores/__tests__/tokenStore.test.ts src/screens/__tests__/HomeScreen.test.tsx src/hooks/__tests__/useTransactionHistory.test.ts src/components/__tests__/WalletConnectHandler.test.tsx --runInBand
```

Result:

```text
PASS src/stores/__tests__/tokenStore.test.ts
PASS src/screens/__tests__/HomeScreen.test.tsx
PASS src/hooks/__tests__/useTransactionHistory.test.ts
PASS src/components/__tests__/WalletConnectHandler.test.tsx

Test Suites: 4 passed, 4 total
Tests:       14 passed, 14 total
```

Required final verification:

```bash
npm test -- --runInBand
npx tsc --noEmit
```

Result:

```text
PASS 27 test suites, 189 tests, 2 snapshots
tsc exit code 0
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

---

## Fourth fix pass after Important Task 2 follow-up review

### Findings addressed

- WalletConnect session approval UI now stays hidden until `useNetworkStore.hasHydrated` is true, even if a proposal arrives before hydration.
- WalletConnect store approval now fails closed before hydration instead of approving namespaces against the temporary mainnet fallback.
- Once hydrated, WalletConnect session approval still builds namespaces from the active app-wide network, including Harbinger.
- Native swap provider acquisition now reinitializes against the active network when the cached provider chain no longer matches, so quote/execution no longer depend on `HomeScreen` side effects to refresh providers.

### Additional regression coverage

- Extended `src/components/__tests__/WalletConnectHandler.test.tsx`
- Extended `src/stores/__tests__/walletConnectStore.test.ts`
- Added `src/hooks/__tests__/useNativeSwap.provider.test.ts`

### RED

Command:

```bash
npm test -- src/components/__tests__/WalletConnectHandler.test.tsx src/stores/__tests__/walletConnectStore.test.ts src/hooks/__tests__/useNativeSwap.provider.test.ts --runInBand
```

Key failures before the fix:

```text
TypeError: ensureProviderForActiveNetwork is not a function
Expected: false
Received: true
Received promise resolved instead of rejected
Expected buildApprovedNamespaces to be called with the hydrated Harbinger namespace
```

Those failures mapped directly to the remaining review findings: pre-hydration WalletConnect approval was still possible and native swap still reused a stale provider after a network change.

### GREEN

Focused regression suite:

```bash
npm test -- src/components/__tests__/WalletConnectHandler.test.tsx src/stores/__tests__/walletConnectStore.test.ts src/hooks/__tests__/useNativeSwap.provider.test.ts --runInBand
```

Result:

```text
PASS src/hooks/__tests__/useNativeSwap.provider.test.ts
PASS src/components/__tests__/WalletConnectHandler.test.tsx
PASS src/stores/__tests__/walletConnectStore.test.ts

Test Suites: 3 passed, 3 total
Tests:       9 passed, 9 total
```

### Remaining concerns

- Harbinger swap remains intentionally unsupported for this parity pass. This fix only guarantees the swap hook refreshes provider state against the active network before it decides whether to quote or execute.

---

## Fifth fix pass after latest Task 2 review findings

### Findings addressed

- WalletConnect generic request handling now fails closed for `koinos_sendTransaction` and rejects it with manual-approval-required copy instead of broadcasting through `provider.sendTransaction(..., true)`.
- Existing WalletConnect signing flows remain intact: `koinos_signTransaction` and `koinos_signAndSendTransaction` still go through the existing approval/auth path.
- Native swap now owns active-scope token initialization inside `useNativeSwap`, so swap no longer depends on `HomeScreen` mounting to refresh the token universe after a network change.
- Swap hides stale previous-network token lists until the active `network:address` token scope is initialized, and `SwapScreen` now renders from that scoped token list instead of the raw shared store.

### Additional regression coverage

- Extended `src/components/__tests__/WalletConnectHandler.test.tsx`
- Extended `src/hooks/__tests__/useNativeSwap.provider.test.ts`
- Extended `src/hooks/__tests__/useNativeSwap.test.ts`

### RED

Command:

```bash
npm test -- src/components/__tests__/WalletConnectHandler.test.tsx src/hooks/__tests__/useNativeSwap.provider.test.ts src/hooks/__tests__/useNativeSwap.test.ts --runInBand
```

Key failures before the fix:

```text
TypeError: ensureSwapTokenScopeForActiveNetwork is not a function
TypeError: getScopedSwapTokens is not a function
Expected: 27, "send-topic", StringMatching /manual approval|required/i
Received: 27, "send-topic", "WalletConnect session no longer matches the active network"
```

The first RED run also exposed a sticky per-test WalletConnect validation mock in the new handler test; I reset that mock in `beforeEach` so the test exercised the broadcast path deterministically.

### GREEN

Focused regression suite:

```bash
npm test -- src/components/__tests__/WalletConnectHandler.test.tsx src/hooks/__tests__/useNativeSwap.provider.test.ts src/hooks/__tests__/useNativeSwap.test.ts --runInBand
```

Result:

```text
PASS src/hooks/__tests__/useNativeSwap.test.ts
PASS src/components/__tests__/WalletConnectHandler.test.tsx
PASS src/hooks/__tests__/useNativeSwap.provider.test.ts

Test Suites: 3 passed, 3 total
Tests:       20 passed, 20 total
```

Covering focused verification:

```bash
npm test -- src/components/__tests__/WalletConnectHandler.test.tsx src/stores/__tests__/walletConnectStore.test.ts src/hooks/__tests__/useNativeSwap.provider.test.ts src/hooks/__tests__/useNativeSwap.test.ts src/stores/__tests__/tokenStore.test.ts --runInBand
```

Result:

```text
Test Suites: 5 passed, 5 total
Tests:       27 passed, 27 total
```

Required final verification:

```bash
npm test -- --runInBand
npx tsc --noEmit
```

Result:

```text
PASS 25 test suites, 180 tests, 2 snapshots
tsc exit code 0
```

### Remaining concerns

- `koinos_sendTransaction` is intentionally unsupported until a dedicated approval flow exists. That is the fail-closed posture for this parity pass.
- Harbinger swap remains intentionally unsupported; this fix only guarantees that swap token/provider state follows the active network and never falls back to stale mainnet token lists.

---

## Sixth fix pass after re-review

### Finding addressed

- WalletConnect approved namespaces no longer advertise `koinos_sendTransaction` until there is a real approval flow for broadcast requests.
- Runtime rejection in `WalletConnectHandler` remains in place as defense in depth, so unexpected `koinos_sendTransaction` requests still fail closed.
- Added focused approval coverage proving the approved namespace excludes `koinos_sendTransaction` while retaining the supported signing methods.

### Additional regression coverage

- Extended `src/stores/__tests__/walletConnectStore.test.ts`
- Reused `src/components/__tests__/WalletConnectHandler.test.tsx` to keep the runtime rejection path covered

### RED

Command:

```bash
npm test -- src/stores/__tests__/walletConnectStore.test.ts --runInBand
```

Key failure before the fix:

```text
FAIL src/stores/__tests__/walletConnectStore.test.ts
  walletConnectStore network reconciliation
    ✕ approves sessions with the hydrated active-network namespace

  expect(received).not.toContain(expected)
  Expected value: not "koinos_sendTransaction"
  Received array: ["koinos_signMessage", ..., "koinos_sendTransaction", ...]
```

### GREEN

Focused WalletConnect verification:

```bash
npm test -- src/stores/__tests__/walletConnectStore.test.ts src/components/__tests__/WalletConnectHandler.test.tsx --runInBand
```

Result:

```text
PASS src/stores/__tests__/walletConnectStore.test.ts
PASS src/components/__tests__/WalletConnectHandler.test.tsx

Test Suites: 2 passed, 2 total
Tests:       9 passed, 9 total
```

Required final verification:

```bash
npm test -- --runInBand
npx tsc --noEmit
```

Result:

```text
PASS 25 test suites, 180 tests, 2 snapshots
tsc exit code 0
```

---

## Seventh fix pass after review

### Findings addressed

- Blocked `provider:sendTransaction` inside the in-app WebView unless the caller explicitly requests `broadcast: false`; omitted or `true` now fails closed with a manual-approval-required error.
- Kept the only safe WebView provider path as non-broadcast submission by forwarding `broadcast: false` unchanged.
- Tightened WalletConnect approved namespaces to advertise only Task 2 runtime-supported methods.
- Stopped advertising `koinos_signMessage`, `koinos_signHash`, `koinos_sendTransaction`, and `koinos_submitBlock` before those flows exist or are approval-safe.

### Additional regression coverage

- Added `src/screens/__tests__/DAppWebViewScreen.test.ts`
- Tightened `src/stores/__tests__/walletConnectStore.test.ts`

### RED

Command:

```bash
npm test -- src/screens/__tests__/DAppWebViewScreen.test.ts src/stores/__tests__/walletConnectStore.test.ts --runInBand
```

Key failures before the fix:

```text
Cannot find module '../dappWebViewProviderGuards'
Expected approved WalletConnect methods to exclude koinos_signMessage, koinos_signHash, and koinos_submitBlock
```

### GREEN

Focused regression suite:

```bash
npm test -- src/screens/__tests__/DAppWebViewScreen.test.ts src/stores/__tests__/walletConnectStore.test.ts --runInBand
```

Result:

```text
PASS src/screens/__tests__/DAppWebViewScreen.test.ts
PASS src/stores/__tests__/walletConnectStore.test.ts

Test Suites: 2 passed, 2 total
Tests:       5 passed, 5 total
```

Required final verification:

```bash
npm test -- --runInBand
npx tsc --noEmit
```

Result:

```text
PASS 26 test suites, 181 tests, 2 snapshots
tsc exit code 0
```

### Remaining concerns

- The WebView provider still exposes `provider:sendTransaction` as a callable command name for compatibility, but the runtime now rejects anything except an explicit non-broadcast dry run and never auto-broadcasts.

---

## Eighth fix pass after RPC passthrough security review

### Findings addressed

- Restricted WebView `provider:call` to a small allowlist of safe read-only Koinos RPC methods and fail-closed everything else with approval-required/unsupported copy.
- Changed WebView `provider:submitBlock` to reject explicitly instead of forwarding block submission.
- Stopped advertising `koinos_JsonRpcCall` in WalletConnect approved namespaces for Task 2.
- Kept a WalletConnect runtime guard that rejects any unexpected `koinos_JsonRpcCall` request before a provider is constructed or a passthrough RPC executes.

### Additional regression coverage

- Extended `src/screens/__tests__/DAppWebViewScreen.test.ts`
- Extended `src/components/__tests__/WalletConnectHandler.test.tsx`
- Tightened `src/stores/__tests__/walletConnectStore.test.ts`

### RED

Command:

```bash
npm test -- src/screens/__tests__/DAppWebViewScreen.test.ts src/components/__tests__/WalletConnectHandler.test.tsx src/stores/__tests__/walletConnectStore.test.ts --runInBand
```

Key failures before the fix:

```text
TypeError: handleWebViewProviderCall is not a function
TypeError: handleWebViewProviderSubmitBlock is not a function
Expected approved WalletConnect methods to exclude koinos_JsonRpcCall
Expected mockRejectRequest to be called for koinos_JsonRpcCall, but it was never called
```

### GREEN

Focused RPC-guard verification:

```bash
npm test -- src/screens/__tests__/DAppWebViewScreen.test.ts src/components/__tests__/WalletConnectHandler.test.tsx src/stores/__tests__/walletConnectStore.test.ts --runInBand
```

Result:

```text
PASS src/screens/__tests__/DAppWebViewScreen.test.ts
PASS src/components/__tests__/WalletConnectHandler.test.tsx
PASS src/stores/__tests__/walletConnectStore.test.ts

Test Suites: 3 passed, 3 total
Tests:       14 passed, 14 total
```

Required final verification:

```bash
npm test -- --runInBand
npx tsc --noEmit
```

Result:

```text
PASS 26 test suites, 185 tests, 2 snapshots
tsc ok
```

### Remaining concerns

- Generic WalletConnect JSON-RPC passthrough remains intentionally unavailable until there is a reviewed safe-policy design for which methods can be exposed and how approval flows should work for anything state-changing.
