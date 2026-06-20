# Task 1 Report: Backup Recovery Key and V2 Backup Envelope

## What I implemented

- Added `src/lib/backupRecoveryKey.ts` with grouped recovery-key generation, normalization, and validation.
- Added `src/lib/__tests__/backupRecoveryKey.test.ts` covering generation, canonical formatting, and invalid-key rejection.
- Updated `src/lib/walletBackup.ts` to support a v2 backup envelope with:
  - `CreateWalletBackupOptions`
  - `BackupDataV1` and `BackupDataV2`
  - deterministic `accountSetHash` and `walletFingerprint`
  - v2 metadata fields `updatedAt`, `appVersion`, and `encryption`
  - v1 restore compatibility
  - `encryptSecretWithBackupSecret` / `decryptSecretWithBackupSecret` plus legacy aliases
- Updated `src/lib/__tests__/walletBackup.test.ts` to verify:
  - v2 backup creation without plaintext secrets
  - legacy v1 backup restore compatibility
  - checksum and restore failure cases
  - restored snapshot shape

## What I tested

- `npm test -- src/lib/__tests__/backupRecoveryKey.test.ts --runInBand`
- `npm test -- src/lib/__tests__/walletBackup.test.ts --runInBand`
- `npm test -- src/lib/__tests__/backupRecoveryKey.test.ts src/lib/__tests__/walletBackup.test.ts --runInBand`
- `git diff --check`

### Final test result

- `2` test suites passed
- `11` tests passed
- `0` snapshots

## TDD Evidence

### RED

- Command: `npm test -- src/lib/__tests__/backupRecoveryKey.test.ts --runInBand`
- Result: failed with `Cannot find module '../backupRecoveryKey'`

- Command: `npm test -- src/lib/__tests__/walletBackup.test.ts --runInBand`
- Result: failed because `encryptSecretWithBackupSecret` was not exported from `walletBackup`

### GREEN

- Command: `npm test -- src/lib/__tests__/backupRecoveryKey.test.ts --runInBand`
- Result: `PASS src/lib/__tests__/backupRecoveryKey.test.ts`

- Command: `npm test -- src/lib/__tests__/backupRecoveryKey.test.ts src/lib/__tests__/walletBackup.test.ts --runInBand`
- Result: `PASS src/lib/__tests__/backupRecoveryKey.test.ts`
  `PASS src/lib/__tests__/walletBackup.test.ts`

## Files changed

- `src/lib/backupRecoveryKey.ts`
- `src/lib/__tests__/backupRecoveryKey.test.ts`
- `src/lib/walletBackup.ts`
- `src/lib/__tests__/walletBackup.test.ts`

## Self-review findings

- `git diff --check` is clean.
- v1 restore path still works through the compatibility branch.
- Legacy `encryptSecretWithPin` / `decryptSecretWithPin` aliases remain available for existing callers.
- v2 backups now carry deterministic public metadata while still verifying through the same restore path.

## Concerns

- None at this stage.

## Fix follow-up

### What I changed

- Removed the runtime `version: 1` creation path from `src/lib/walletBackup.ts`, leaving v1 restore support intact and v2 as the only creation path.
- Updated the low-level decryption error to say `Invalid backup secret or corrupted encrypted secret`.
- Replaced the v1 restore regression in `src/lib/__tests__/walletBackup.test.ts` with a fixed legacy v1 fixture and added a guard that `createWalletBackup` still produces v2 when a legacy version is requested through an untyped call site.

### Files changed

- `src/lib/walletBackup.ts`
- `src/lib/__tests__/walletBackup.test.ts`

### Test results

- `npm test -- src/lib/__tests__/walletBackup.test.ts --runInBand`
  - `PASS src/lib/__tests__/walletBackup.test.ts`
  - `9 passed, 9 total`
- `npm test -- src/lib/__tests__/backupRecoveryKey.test.ts src/lib/__tests__/walletBackup.test.ts --runInBand`
  - `PASS src/lib/__tests__/walletBackup.test.ts`
  - `PASS src/lib/__tests__/backupRecoveryKey.test.ts`
  - `12 passed, 12 total`
- `git diff --check`
  - clean
