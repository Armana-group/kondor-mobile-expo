# Encrypted Cloud Backup Design

Date: 2026-06-20
Status: Draft for review
Scope: Kondor mobile Expo app

## Goal

Make it much harder for a Kondor mobile user to lose access to a wallet by adding a non-custodial encrypted cloud backup path.

The v1 promise is intentionally narrow:

- Kondor can help the user create, store, verify, and restore encrypted backups.
- Kondor never receives plaintext recovery phrases, private keys, backup passwords, or backup recovery keys.
- Kondor cannot recover a wallet if the user loses the phone and also loses the recovery phrase, private key, cloud backup, or backup secret.
- Social recovery, MPC, guardians, and account-abstraction recovery are future recovery architectures and are out of scope for this v1.

## Current Baseline

The app already has a local encrypted backup primitive:

- `src/lib/walletBackup.ts` creates versioned encrypted backup JSON with PBKDF2 + AES-256-GCM, checksum validation, and account address verification.
- `src/stores/walletStore.ts` builds snapshots from the mnemonic and imported private keys.
- `src/screens/BackupRecoveryScreen.tsx` creates and shares a backup file, imports a backup file, verifies it, and restores it.
- `lastBackupAt` tracks the last successful local backup timestamp, but does not distinguish manual export, cloud upload, provider, stale account set, or restore verification state.

Current gaps:

- The backup PIN is currently the wallet PIN. A 6-digit PIN is too weak for cloud-stored ciphertext.
- Backup is optional and easy to ignore.
- Backup status is a timestamp, not a safety model.
- There is no automatic iCloud/Google Drive target.
- The app does not clearly warn when a funded wallet has no verified recovery path.

## Non-Goals

- Do not build a Kondor server that can recover user wallets.
- Do not upload plaintext secrets.
- Do not rely on Expo SecureStore, Android Auto Backup, or app reinstall behavior as the only recovery mechanism.
- Do not add social recovery in this phase.
- Do not make cloud backup mandatory for users who prefer only offline phrase backup.

## Product Model

Recovery paths should be explicit and ranked:

1. Recovery phrase or imported private key.
2. Client-encrypted cloud backup plus backup secret.
3. Client-encrypted manual backup file plus backup secret.
4. Another existing device/install that can still sign.

If none of those exist, the wallet is unrecoverable. The app should say that plainly during onboarding and backup setup.

## Backup Secret Model

Cloud backups must not use the 6-digit wallet PIN as the encryption secret.

V1 should support one primary backup secret mode:

- App-generated backup recovery key, shown once and confirmed by the user.
- Format should be human-enterable and high entropy, for example grouped base32 words or characters.
- The app may store the backup recovery key in SecureStore for same-device backup refreshes, but restore on a new device still requires the user to provide it.

An optional user-chosen backup password can come later if we add strength estimation and clear warnings. A user password is easier to remember but easier to choose badly.

## Backup Format

Add a v2 backup envelope while preserving restore support for v1 manual backups.

V2 envelope fields:

- `kind`: `kondor-wallet-backup`
- `version`: `2`
- `createdAt`
- `updatedAt`
- `appVersion`
- `walletFingerprint`: hash over public wallet metadata, not a secret
- `accountSetHash`: hash over account ids, addresses, derivation indexes, and imported flags
- `encryption`: KDF, iterations, salt, algorithm, digest, key length
- `wallet`: encrypted mnemonic when HD accounts exist, encrypted imported private keys, public account metadata
- `checksum`: stable checksum over the backup envelope excluding `checksum`

Plaintext allowed in backup:

- public account addresses
- account names
- derivation indexes
- imported-account flags
- timestamps
- app/backup version

Plaintext not allowed:

- recovery phrase
- private keys
- backup recovery key
- wallet PIN
- current-device auth state

## Cloud Storage Targets

V1 should use provider-specific cloud storage without a Kondor backend.

### iOS

Preferred target: iCloud ubiquity container or iCloud Documents container.

Behavior:

- Store `kondor-wallet-backup.json` and a small public metadata file in the app's iCloud container.
- Keep the cloud object encrypted client-side before writing.
- Read, upload, replace, and verify through a native bridge or Expo config plugin if needed.

### Android

Preferred target: Google Drive `appDataFolder`.

Behavior:

- Request the narrow Drive app data scope.
- Store a hidden app-specific encrypted backup file.
- Replace or version the latest backup deterministically.
- Do not rely on Android Auto Backup for wallet secrets because SecureStore-backed secrets may be undecryptable after restore.

### Manual Export

Keep manual export/import through the existing file/share flow.

Changes:

- Use the v2 backup format and backup recovery key.
- Label it as "Manual encrypted backup".
- Continue to support v1 import so existing backups remain restorable.

## Backup Health State

Replace `lastBackupAt` with structured backup health while preserving migration from the old field.

Suggested state:

```ts
type BackupProvider = 'manual-file' | 'icloud' | 'google-drive';

type BackupHealth = {
  status: 'none' | 'verified' | 'stale' | 'failed';
  provider: BackupProvider | null;
  lastCreatedAt: string | null;
  lastVerifiedAt: string | null;
  walletFingerprint: string | null;
  accountSetHash: string | null;
  failureReason: string | null;
};
```

Backup is stale when:

- a new account is added
- an imported private-key account is added or removed
- restore writes a new wallet
- backup verification fails
- cloud provider upload succeeds but download/decrypt/verify fails

## UX Flow

### Onboarding

After create/import:

1. Show recovery phrase confirmation for HD wallets.
2. Ask user to set up encrypted cloud backup.
3. Generate a backup recovery key.
4. Require confirmation of the backup recovery key.
5. Upload encrypted backup.
6. Download it immediately.
7. Decrypt and verify in memory.
8. Mark backup as verified only after successful round trip.

Users may skip cloud backup, but the app should mark backup health as `none` and show persistent warnings.

### Home and Settings

Show a compact backup status indicator:

- `Backup verified`
- `Backup needed`
- `Backup stale`
- `Backup failed`

Warnings should appear before risky moments:

- first receive screen for an unbacked wallet
- send flow when backup health is `none` or `stale`
- adding accounts
- importing private-key accounts

The app should not block all activity, but it should make the risk hard to miss.

### Restore

From the unauthenticated wallet entry flow:

1. Choose "Restore from Cloud Backup" or "Restore from File".
2. Select provider or file.
3. Enter backup recovery key.
4. Decrypt and verify backup.
5. Show the restored public addresses before writing secrets.
6. Require setting a new wallet PIN.
7. Write mnemonic/private keys through the existing rollback-safe restore path.
8. Recompute backup health.

## Error Handling

User-facing errors should be specific:

- "Backup password or recovery key is incorrect."
- "Backup file is corrupted or incomplete."
- "This backup does not contain the active account."
- "Cloud backup was uploaded but could not be verified. Try again before relying on it."
- "Kondor cannot recover this wallet without the recovery phrase or backup recovery key."

Expected user mistakes should not be logged as internal wallet errors. Unexpected provider, crypto, or storage failures should be logged with non-secret metadata.

## Security Requirements

- Never send plaintext secrets to iCloud, Google Drive, logs, analytics, or a server.
- Never store the backup recovery key in AsyncStorage.
- Never derive cloud-backup encryption from the 6-digit wallet PIN.
- Use authenticated encryption and verify before marking a backup safe.
- Support restore of old backup versions, but create only the newest version.
- Keep cloud provider OAuth scopes minimal.
- Treat backup metadata as public but still avoid unnecessary identifying data.
- Make every restore write rollback-safe, as current backup restore hardening does.

## Testing

Unit tests:

- v2 backup creation does not include plaintext mnemonic/private keys.
- wrong backup recovery key fails.
- corrupted ciphertext fails.
- checksum mismatch fails.
- HD account address verification fails when mnemonic does not match.
- imported account address verification fails when private key does not match.
- backup health becomes stale after account-set changes.

Integration tests with mocks:

- iCloud provider upload-download-verify success.
- Google Drive provider upload-download-verify success.
- upload succeeds but verify fails leaves status `failed`.
- restore from cloud backup writes secrets only after verification.

Manual release checks:

- iOS simulator and real-device iCloud restore.
- Android emulator and real-device Google Drive restore.
- app reinstall with only cloud backup available.
- device migration where SecureStore data is not available.

## Implementation Phases

### Phase 1: Backup Health and Strong Secret

- Add backup health state.
- Add v2 backup format.
- Add generated backup recovery key.
- Update manual backup/export/import to v2.
- Add warnings for `none` and `stale`.

### Phase 2: iCloud Provider

- Add iOS cloud backup provider.
- Add required entitlement/config-plugin work.
- Add upload-download-verify round trip.
- Add restore from iCloud.

### Phase 3: Google Drive Provider

- Add Google auth and Drive `appDataFolder` provider.
- Add upload-download-verify round trip.
- Add restore from Google Drive.

### Phase 4: Polish and Release Hardening

- Add backup status UI polish.
- Add restore rehearsal test checklist.
- Add privacy/security copy updates.
- Add release notes and support docs.

## Open Decisions

The implementation plan should resolve these before coding:

- Exact generated backup recovery key format.
- Whether Phase 1 should ship manual backup v2 before cloud providers.
- Whether cloud backups keep only the latest copy or retain a small version history.
- Whether to support optional user-chosen backup passwords in v1 or defer them.

## References

- Expo SecureStore notes that Android Auto Backup must exclude SecureStore entries because restored entries cannot be decrypted after uninstall: https://docs.expo.dev/versions/latest/sdk/securestore/
- Android Auto Backup stores app data in the user's Google Drive, has quota limits, and is OS-managed: https://developer.android.com/identity/data/autobackup
- Google Drive `appDataFolder` is hidden app-specific storage accessible only by the app: https://developers.google.com/workspace/drive/api/guides/appdata
- Apple `FileManager.url(forUbiquityContainerIdentifier:)` is the native entry point for locating an app's iCloud ubiquity container: https://developer.apple.com/documentation/foundation/filemanager/url%28forubiquitycontaineridentifier%3A%29

## Spec Self-Review

- No server custody is included.
- Recovery phrase and cloud backup are separate recovery paths.
- The 6-digit wallet PIN is explicitly rejected for cloud-backup encryption.
- Social recovery is explicitly out of scope.
- Restore verification is required before writing secrets.
- The implementation is split into phases so manual backup hardening can ship before full provider integrations.
