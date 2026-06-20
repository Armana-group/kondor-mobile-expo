# Final Fix Report

## Root cause summary

1. `TransactionApprovalModal` only read raw private-key storage and never used the HD mnemonic path, so normal HD accounts could not approve dApp or WalletConnect transaction signing.
2. `signer:prepareTransaction` in `DAppWebViewScreen` treated a non-signing prepare as a signing flow by reading SecureStore and constructing a signer.
3. `swapTransaction` returned early on accepted RPC deadline receipts before calling `onBroadcast`, so pending swap reconciliation missed real accepted broadcasts.
4. `DAppMessageSigningModal` reset local state from props inside an effect, which produced the React Doctor `no-reset-all-state-on-prop-change` and `no-adjust-state-on-prop-change` errors.

## Red test evidence

### Focused regression command

```bash
npm test -- src/lib/dapp/__tests__/messageSigning.test.ts src/components/__tests__/TransactionApprovalModal.test.tsx src/screens/__tests__/DAppWebViewScreen.test.ts src/lib/__tests__/swapTransaction.test.ts --runInBand
```

Result:

- `FAIL src/lib/dapp/__tests__/messageSigning.test.ts`
  - `withAuthenticatedAccountSigner is not a function`
- `FAIL src/components/__tests__/TransactionApprovalModal.test.tsx`
  - mnemonic-derived HD signer test showed `mockCreateWalletFromMnemonic` was never called
- `FAIL src/screens/__tests__/DAppWebViewScreen.test.ts`
  - `mockSecureStoreGetItemAsync` was called for `signer:prepareTransaction`
- `FAIL src/lib/__tests__/swapTransaction.test.ts`
  - accepted deadline receipt did not call `onBroadcast`

### React Doctor red command

```bash
npx -y react-doctor@latest . --verbose --scope changed --base ff4d28f
```

Result:

- exit code `1`
- `src/components/DAppMessageSigningModal.tsx` had:
  - `Multiple setState calls in one effect`
  - `All state reset on prop change`
  - `State synced to a prop inside an effect ×4`

## Fix summary

- Added shared authenticated signer access in `src/lib/dapp/messageSigning.ts`:
  - supports HD mnemonic derivation, imported keys, and legacy keys
  - authenticates before secret access
  - verifies the derived signer address matches the requested signer address
  - scopes signer/private-key lifetime to one callback action
- Switched `TransactionApprovalModal` to use that helper instead of reading SecureStore directly.
- Removed SecureStore/private-key/signer access from `DAppWebViewScreen` `signer:prepareTransaction`; it now prepares via provider-only `Transaction`.
- Moved swap `onBroadcast` emission so accepted non-reverted receipts are recorded before pending-confirmation returns.
- Reworked `DAppMessageSigningModal` to use a keyed inner render instead of effect-driven state resets.
- Added/updated regression coverage for:
  - shared authenticated signer behavior
  - HD-wallet transaction approval signing
  - provider-only `signer:prepareTransaction`
  - accepted-deadline swap receipts
  - message-signing modal reset behavior

## Exact verification output summary

### Focused green command

```bash
npm test -- src/lib/dapp/__tests__/messageSigning.test.ts src/components/__tests__/TransactionApprovalModal.test.tsx src/screens/__tests__/DAppWebViewScreen.test.ts src/lib/__tests__/swapTransaction.test.ts src/components/__tests__/DAppMessageSigningModal.test.tsx --runInBand
```

Result:

- `PASS 5 suites`
- `44 passed, 44 total`

### Required full test suite

```bash
npm test -- --runInBand
```

Result:

- `PASS 45 suites`
- `326 passed, 326 total`
- `2 snapshots passed`

### Required type-check

```bash
npx tsc --noEmit
```

Result:

- exit code `0`

### Required React Doctor command

```bash
npx -y react-doctor@latest . --verbose --scope changed
```

Result:

- exit code `0`
- `All 34 issues`
- `Bugs: 27 warnings`
- `Performance: 5 warnings`
- `Maintainability: 2 warnings`
- The previous `DAppMessageSigningModal` error group is gone; only warnings remain.

## Remaining concerns

- React Doctor still reports 34 branch-level warnings outside the requested blocker scope. I left those alone.
- `src/screens/__tests__/DAppWebViewScreen.test.ts` still logs the existing React Native `SafeAreaView` deprecation warning during tests. It is pre-existing and unrelated to these blockers.
