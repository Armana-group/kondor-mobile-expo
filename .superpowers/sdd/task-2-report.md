## What I implemented

- Added `src/lib/backupHealth.ts` with:
  - `BackupHealth` and related types
  - `EMPTY_BACKUP_HEALTH`
  - `markBackupHealthVerified`
  - `markBackupHealthStale`
  - `getBackupHealthLabel`
  - `isBackupHealthActionRequired`
- Added `src/lib/__tests__/backupHealth.test.ts` covering the empty, verified, and stale backup health states.
- Updated `src/stores/walletStore.ts` to:
  - persist `backupHealth` in wallet state
  - expose `markBackupVerified` and `markBackupStale`
  - reset `backupHealth` on `createWallet`, migration-based `loadWallet`, and `clearWallet`
  - mark existing verified backup state stale when accounts are added, imported, or removed
  - set verified backup health metadata when restoring a version 2 backup
  - change `createBackupSnapshot(currentPin, backupSecret)` so `currentPin` is only used for `verifyPin`, while secrets are encrypted with `backupSecret`
- Updated `src/stores/__tests__/walletStore.test.ts` with Task 2 coverage for:
  - backup snapshot encryption using the backup recovery key
  - manual backup verification state
  - stale backup state after account import

## What I tested and exact test results

- `npm test -- src/lib/__tests__/backupHealth.test.ts --runInBand`
  - PASS: 1 suite, 3 tests
- `npm test -- src/stores/__tests__/walletStore.test.ts --runInBand`
  - PASS: 1 suite, 8 tests

## TDD Evidence

### RED

- Command: `npm test -- src/lib/__tests__/backupHealth.test.ts --runInBand`
  - Result: FAIL
  - Summary: Jest could not resolve `../backupHealth` because the module did not exist.
- Command: `npm test -- src/stores/__tests__/walletStore.test.ts --runInBand`
  - Result: FAIL
  - Summary:
    - `markBackupVerified` was not defined on the store
    - the new snapshot path was not implemented
    - one new snapshot test also exposed that the existing harness needed a deterministic wallet mock to exercise the HD-account backup path with the brief’s placeholder mnemonic values

### GREEN

- Command: `npm test -- src/lib/__tests__/backupHealth.test.ts --runInBand`
  - Result: PASS
  - Summary: 3/3 backup health tests passed.
- Command: `npm test -- src/stores/__tests__/walletStore.test.ts --runInBand`
  - Result: PASS
  - Summary: 8/8 wallet store tests passed.

## Files changed

- `src/lib/backupHealth.ts`
- `src/lib/__tests__/backupHealth.test.ts`
- `src/stores/walletStore.ts`
- `src/stores/__tests__/walletStore.test.ts`

## Self-review findings

- The store change is limited to backup-health state, snapshot encryption input handling, and account-change invalidation.
- Snapshot encryption now matches Task 1’s library boundary: wallet PIN is only used for `verifyPin`, and `backupSecret` is used for mnemonic/private-key encryption.
- Existing restore hardening behavior remains covered by the focused wallet store suite.
- The wallet store tests needed deterministic mocks for `../../lib/wallet` and `encryptSecretWithBackupSecret` so the new Task 2 assertions could run against stable test data without leaking plaintext into the mocked ciphertext.

## Concerns, if any

- No functional concerns from the focused scope.
- I did not run broader repo test suites or typecheck beyond the task’s required focused tests.
