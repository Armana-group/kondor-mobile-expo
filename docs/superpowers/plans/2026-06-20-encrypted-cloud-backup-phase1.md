# Encrypted Cloud Backup Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Kondor's current manual backup flow so every backup uses a high-entropy recovery key, creates a v2 cloud-safe encrypted backup envelope, and updates wallet backup health.

**Architecture:** Phase 1 does not add iCloud or Google Drive provider dependencies. It upgrades the local backup domain first: pure crypto/key utilities, versioned backup envelopes, wallet-store backup health, and UI warnings that make unprotected wallets visible before users receive or send funds.

**Tech Stack:** Expo SDK 56, React Native, TypeScript, Zustand persist, Expo SecureStore, Expo Crypto, Expo FileSystem legacy, Expo Sharing, Jest.

## Global Constraints

- Kondor remains non-custodial: no plaintext recovery phrase, private key, backup password, or backup recovery key leaves the device.
- Do not use the 6-digit wallet PIN as the v2 backup encryption secret.
- Preserve restore support for existing v1 manual backups.
- Create only v2 backups after this plan lands.
- Phase 1 excludes iCloud, Google Drive, social recovery, MPC, guardians, and server custody.
- Every backup marked `verified` must have passed decrypt-and-address verification.
- Expected user mistakes must show actionable UI errors without logging secrets.
- Do not reset, uninstall, erase simulator state, or revert unrelated uncommitted changes.

---

## File Structure

- Create `src/lib/backupRecoveryKey.ts`: generation, normalization, and validation for high-entropy user-held backup recovery keys.
- Create `src/lib/__tests__/backupRecoveryKey.test.ts`: deterministic unit tests for key format and validation.
- Modify `src/lib/walletBackup.ts`: v2 backup envelope, v1 restore compatibility, backup fingerprint/hash helpers, encryption helper rename.
- Modify `src/lib/__tests__/walletBackup.test.ts`: v2 creation tests plus existing v1 restore regression.
- Create `src/lib/backupHealth.ts`: pure backup-health defaults, labels, account-set hashing, and stale/verified helpers.
- Create `src/lib/__tests__/backupHealth.test.ts`: backup-health transition tests.
- Modify `src/stores/walletStore.ts`: persist `backupHealth`, create snapshots with a backup recovery key, mark stale on account changes, mark verified after backup/restore.
- Modify `src/stores/__tests__/walletStore.test.ts`: store-level backup health and strong-secret tests.
- Modify `src/screens/BackupRecoveryScreen.tsx`: generated recovery-key flow, v2 manual backup, restore field copy changes, backup health display.
- Create `src/screens/__tests__/BackupRecoveryScreen.test.tsx`: UI behavior tests for generated recovery key and manual backup verification.
- Create `src/components/BackupStatusNotice.tsx`: compact reusable warning/status UI.
- Create `src/components/__tests__/BackupStatusNotice.test.tsx`: status rendering tests.
- Modify `src/screens/HomeScreen.tsx`, `src/screens/ReceiveScreen.tsx`, and `src/screens/SendScreen.tsx`: show backup warning surfaces.
- Modify `src/screens/__tests__/HomeScreen.test.tsx`, `src/screens/__tests__/SendScreen.test.tsx`, and create `src/screens/__tests__/ReceiveScreen.test.tsx`: warning behavior coverage.
- Modify `docs/legal/privacy-policy.md` only if user-facing copy now promises cloud-safe/manual encrypted backup behavior differently from the existing policy.

---

### Task 1: Backup Recovery Key and V2 Backup Envelope

**Files:**
- Create: `src/lib/backupRecoveryKey.ts`
- Create: `src/lib/__tests__/backupRecoveryKey.test.ts`
- Modify: `src/lib/walletBackup.ts`
- Modify: `src/lib/__tests__/walletBackup.test.ts`

**Interfaces:**
- Produces: `generateBackupRecoveryKey(): Promise<string>`
- Produces: `normalizeBackupRecoveryKey(value: string): string`
- Produces: `isValidBackupRecoveryKey(value: string): boolean`
- Produces: `encryptSecretWithBackupSecret(secret: string, backupSecret: string): Promise<EncryptedSecret>`
- Produces: `decryptSecretWithBackupSecret(secret: EncryptedSecret, backupSecret: string): Promise<string>`
- Produces: `createWalletBackup(snapshot: WalletBackupSnapshot, backupSecret: string, options?: CreateWalletBackupOptions): Promise<BackupData>`
- Produces: `restoreWalletBackup(backup: BackupData, backupSecret: string, options?: { skipChecksum?: boolean }): Promise<RestoredWalletSnapshot>`
- Consumes: existing `createWalletFromMnemonic`, `createWalletFromPrivateKey`, Expo Crypto, and current v1 backup test fixtures.

- [ ] **Step 1: Add failing backup recovery key tests**

Create `src/lib/__tests__/backupRecoveryKey.test.ts`:

```ts
import {
  BACKUP_RECOVERY_KEY_GROUP_COUNT,
  BACKUP_RECOVERY_KEY_GROUP_LENGTH,
  generateBackupRecoveryKey,
  isValidBackupRecoveryKey,
  normalizeBackupRecoveryKey,
} from '../backupRecoveryKey';

describe('backupRecoveryKey', () => {
  it('generates a grouped high-entropy recovery key', async () => {
    const key = await generateBackupRecoveryKey();

    expect(key.split('-')).toHaveLength(BACKUP_RECOVERY_KEY_GROUP_COUNT);
    expect(key.replaceAll('-', '')).toHaveLength(
      BACKUP_RECOVERY_KEY_GROUP_COUNT * BACKUP_RECOVERY_KEY_GROUP_LENGTH
    );
    expect(isValidBackupRecoveryKey(key)).toBe(true);
  });

  it('normalizes spaces and lowercase input into the canonical grouped form', () => {
    expect(normalizeBackupRecoveryKey('abcd efgh ijkm npqr stvw xyz2 3456 789a')).toBe(
      'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A'
    );
  });

  it('rejects missing, short, and ambiguous recovery keys', () => {
    expect(isValidBackupRecoveryKey('')).toBe(false);
    expect(isValidBackupRecoveryKey('ABCD-EFGH')).toBe(false);
    expect(isValidBackupRecoveryKey('ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789O')).toBe(false);
  });
});
```

- [ ] **Step 2: Run key tests and verify they fail**

Run:

```bash
npm test -- src/lib/__tests__/backupRecoveryKey.test.ts --runInBand
```

Expected: FAIL because `../backupRecoveryKey` does not exist.

- [ ] **Step 3: Implement recovery key generation and validation**

Create `src/lib/backupRecoveryKey.ts`:

```ts
import * as Crypto from 'expo-crypto';

export const BACKUP_RECOVERY_KEY_GROUP_COUNT = 8;
export const BACKUP_RECOVERY_KEY_GROUP_LENGTH = 4;

const BACKUP_RECOVERY_KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const BACKUP_RECOVERY_KEY_CHARS =
  BACKUP_RECOVERY_KEY_GROUP_COUNT * BACKUP_RECOVERY_KEY_GROUP_LENGTH;

export function normalizeBackupRecoveryKey(value: string): string {
  const compact = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return compact
    .match(new RegExp(`.{1,${BACKUP_RECOVERY_KEY_GROUP_LENGTH}}`, 'g'))
    ?.join('-') ?? '';
}

export function isValidBackupRecoveryKey(value: string): boolean {
  const compact = normalizeBackupRecoveryKey(value).replaceAll('-', '');
  if (compact.length !== BACKUP_RECOVERY_KEY_CHARS) {
    return false;
  }

  return [...compact].every((char) => BACKUP_RECOVERY_KEY_ALPHABET.includes(char));
}

export async function generateBackupRecoveryKey(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(BACKUP_RECOVERY_KEY_CHARS);
  const chars = Array.from(bytes, (byte) => BACKUP_RECOVERY_KEY_ALPHABET[byte % 32]).join('');
  return normalizeBackupRecoveryKey(chars);
}
```

- [ ] **Step 4: Run key tests and verify they pass**

Run:

```bash
npm test -- src/lib/__tests__/backupRecoveryKey.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Add failing v2 backup tests while preserving v1 restore**

Modify `src/lib/__tests__/walletBackup.test.ts`:

```ts
import { createWalletFromMnemonic, createWalletFromPrivateKey } from '../wallet';
import {
  createWalletBackup,
  encryptSecretWithBackupSecret,
  restoreWalletBackup,
  verifyWalletBackup,
  type BackupData,
  type WalletBackupSnapshot,
} from '../walletBackup';

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_BACKUP_SECRET = 'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A';
const LEGACY_PIN = '123456';
```

Update `buildSnapshot` so every encryption call uses `encryptSecretWithBackupSecret(..., TEST_BACKUP_SECRET)`.

Replace the first test with:

```ts
it('creates a v2 backup without plaintext secrets and verifies with the recovery key', async () => {
  const snapshot = await buildSnapshot();

  const backup = await createWalletBackup(snapshot, TEST_BACKUP_SECRET, {
    appVersion: '1.0.0-test',
    now: '2026-06-20T00:00:00.000Z',
  });
  const serialized = JSON.stringify(backup);

  expect(backup.version).toBe(2);
  expect(backup.kind).toBe('kondor-wallet-backup');
  expect(backup.updatedAt).toBe('2026-06-20T00:00:00.000Z');
  expect(backup.appVersion).toBe('1.0.0-test');
  expect(backup.accountSetHash).toEqual(expect.any(String));
  expect(backup.walletFingerprint).toEqual(expect.any(String));
  expect(backup.encryption).toEqual(
    expect.objectContaining({
      algorithm: 'pbkdf2-aes-256-gcm',
      digest: 'SHA-256',
      keyLength: 256,
    })
  );
  expect(serialized).not.toContain(TEST_MNEMONIC);
  expect(serialized).not.toContain(createWalletFromMnemonic(TEST_MNEMONIC, 0).privateKey);
  await expect(verifyWalletBackup(backup, TEST_BACKUP_SECRET)).resolves.toBe(true);
});
```

Add this legacy restore regression:

```ts
it('restores an existing v1 backup encrypted with the legacy PIN', async () => {
  const snapshot = await buildSnapshotWithSecret(LEGACY_PIN);
  const v1Backup = await createWalletBackup(snapshot, LEGACY_PIN, {
    version: 1,
    now: '2026-06-19T00:00:00.000Z',
  });

  expect(v1Backup.version).toBe(1);
  await expect(restoreWalletBackup(v1Backup, LEGACY_PIN)).resolves.toMatchObject({
    activeAccountId: 'acc-1',
    mnemonic: TEST_MNEMONIC,
  });
});
```

Add helper above the tests:

```ts
async function buildSnapshotWithSecret(secret: string): Promise<WalletBackupSnapshot> {
  const hdPrimary = createWalletFromMnemonic(TEST_MNEMONIC, 0);
  const hdSecondary = createWalletFromMnemonic(TEST_MNEMONIC, 1);
  const imported = createWalletFromPrivateKey(
    '1111111111111111111111111111111111111111111111111111111111111111'
  );

  return {
    activeAccountId: 'acc-1',
    nextDerivationIndex: 2,
    encryptedMnemonic: await encryptSecretWithBackupSecret(TEST_MNEMONIC, secret),
    accounts: [
      {
        id: 'acc-1',
        name: 'Account 1',
        address: hdPrimary.address,
        derivationIndex: 0,
        isImported: false,
        encryptedPrivateKey: await encryptSecretWithBackupSecret(hdPrimary.privateKey, secret),
      },
      {
        id: 'acc-2',
        name: 'Account 2',
        address: hdSecondary.address,
        derivationIndex: 1,
        isImported: false,
        encryptedPrivateKey: await encryptSecretWithBackupSecret(hdSecondary.privateKey, secret),
      },
      {
        id: 'acc-3',
        name: 'Imported 1',
        address: imported.address,
        derivationIndex: -1,
        isImported: true,
        encryptedPrivateKey: await encryptSecretWithBackupSecret(imported.privateKey, secret),
      },
    ],
  };
}
```

- [ ] **Step 6: Run wallet backup tests and verify they fail**

Run:

```bash
npm test -- src/lib/__tests__/walletBackup.test.ts --runInBand
```

Expected: FAIL because `encryptSecretWithBackupSecret`, v2 envelope fields, and `CreateWalletBackupOptions` are missing.

- [ ] **Step 7: Implement v2 envelope and v1 compatibility**

Modify `src/lib/walletBackup.ts`:

```ts
const BACKUP_VERSION = 2;
const LEGACY_BACKUP_VERSION = 1;

export interface BackupEncryptionMetadata {
  algorithm: 'pbkdf2-aes-256-gcm';
  digest: 'SHA-256';
  keyLength: number;
  iterations: number;
}

export interface CreateWalletBackupOptions {
  version?: 1 | 2;
  now?: string;
  appVersion?: string;
}

export interface BackupDataV1 {
  kind: typeof BACKUP_KIND;
  version: typeof LEGACY_BACKUP_VERSION;
  createdAt: string;
  checksum: string;
  wallet: WalletBackupSnapshot;
}

export interface BackupDataV2 {
  kind: typeof BACKUP_KIND;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  updatedAt: string;
  appVersion: string;
  walletFingerprint: string;
  accountSetHash: string;
  encryption: BackupEncryptionMetadata;
  checksum: string;
  wallet: WalletBackupSnapshot;
}

export type BackupData = BackupDataV1 | BackupDataV2;
```

Rename encryption helpers while keeping legacy aliases:

```ts
export async function encryptSecretWithBackupSecret(
  secret: string,
  backupSecret: string
): Promise<EncryptedSecret> {
  const subtle = getSubtleCrypto();
  const salt = normalizeBytes(await Crypto.getRandomBytesAsync(SALT_BYTES));
  const iv = normalizeBytes(await Crypto.getRandomBytesAsync(IV_BYTES));
  const key = await deriveAesKey(backupSecret, salt, ['encrypt']);
  const encodedSecret = normalizeBytes(new TextEncoder().encode(secret));
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encodedSecret)
  );

  return {
    algorithm: 'pbkdf2-aes-256-gcm',
    ciphertext: bytesToHex(new Uint8Array(encrypted)),
    iv: bytesToHex(iv),
    salt: bytesToHex(salt),
    iterations: PBKDF2_ITERATIONS,
    digest: 'SHA-256',
    keyLength: AES_KEY_LENGTH,
  };
}

export const encryptSecretWithPin = encryptSecretWithBackupSecret;
```

Add deterministic public metadata helpers:

```ts
export function getBackupAccountSetHash(accounts: Account[]): Promise<string> {
  const publicAccounts = accounts.map(({ id, name, address, derivationIndex, isImported }) => ({
    id,
    name,
    address,
    derivationIndex,
    isImported,
  }));

  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    stableStringify(publicAccounts)
  );
}

export function getBackupWalletFingerprint(snapshot: WalletBackupSnapshot): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    stableStringify({
      activeAccountId: snapshot.activeAccountId,
      nextDerivationIndex: snapshot.nextDerivationIndex,
      accounts: snapshot.accounts.map(({ encryptedPrivateKey: _key, ...account }) => account),
    })
  );
}
```

Update checksum payload:

```ts
function getChecksumPayload(backup: Omit<BackupData, 'checksum'>): Omit<BackupData, 'checksum'> {
  return backup;
}
```

Update `createWalletBackup` to default to v2:

```ts
export async function createWalletBackup(
  walletSnapshot: WalletBackupSnapshot,
  backupSecret: string,
  options: CreateWalletBackupOptions = {}
): Promise<BackupData> {
  if (!walletSnapshot.accounts.length) {
    throw new Error('Cannot back up an empty wallet');
  }

  const version = options.version ?? BACKUP_VERSION;
  const createdAt = options.now ?? new Date().toISOString();

  if (version === LEGACY_BACKUP_VERSION) {
    const backupWithoutChecksum: Omit<BackupDataV1, 'checksum'> = {
      kind: BACKUP_KIND,
      version: LEGACY_BACKUP_VERSION,
      createdAt,
      wallet: walletSnapshot,
    };

    await restoreWalletBackup({ ...backupWithoutChecksum, checksum: '' }, backupSecret, {
      skipChecksum: true,
    });

    return {
      ...backupWithoutChecksum,
      checksum: await computeChecksum(getChecksumPayload(backupWithoutChecksum)),
    };
  }

  const accountSetHash = await getBackupAccountSetHash(walletSnapshot.accounts);
  const walletFingerprint = await getBackupWalletFingerprint(walletSnapshot);
  const backupWithoutChecksum: Omit<BackupDataV2, 'checksum'> = {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    createdAt,
    updatedAt: createdAt,
    appVersion: options.appVersion ?? 'unknown',
    walletFingerprint,
    accountSetHash,
    encryption: {
      algorithm: 'pbkdf2-aes-256-gcm',
      digest: 'SHA-256',
      keyLength: AES_KEY_LENGTH,
      iterations: PBKDF2_ITERATIONS,
    },
    wallet: walletSnapshot,
  };

  await restoreWalletBackup({ ...backupWithoutChecksum, checksum: '' }, backupSecret, {
    skipChecksum: true,
  });

  return {
    ...backupWithoutChecksum,
    checksum: await computeChecksum(getChecksumPayload(backupWithoutChecksum)),
  };
}
```

Update `assertSupportedVersion`:

```ts
function assertSupportedVersion(backup: BackupData): void {
  if (backup.kind !== BACKUP_KIND) {
    throw new Error('Unsupported backup format');
  }
  if (backup.version !== LEGACY_BACKUP_VERSION && backup.version !== BACKUP_VERSION) {
    throw new Error('Unsupported backup version');
  }
}
```

Update `restoreWalletBackup` checksum calculation:

```ts
const { checksum: _checksum, ...backupWithoutChecksum } = backup;
const expectedChecksum = await computeChecksum(
  getChecksumPayload(backupWithoutChecksum as Omit<BackupData, 'checksum'>)
);
```

- [ ] **Step 8: Run wallet backup tests and key tests**

Run:

```bash
npm test -- src/lib/__tests__/backupRecoveryKey.test.ts src/lib/__tests__/walletBackup.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/lib/backupRecoveryKey.ts src/lib/__tests__/backupRecoveryKey.test.ts src/lib/walletBackup.ts src/lib/__tests__/walletBackup.test.ts
git commit -m "feat: add v2 wallet backup recovery keys"
```

---

### Task 2: Backup Health State in Wallet Store

**Files:**
- Create: `src/lib/backupHealth.ts`
- Create: `src/lib/__tests__/backupHealth.test.ts`
- Modify: `src/stores/walletStore.ts`
- Modify: `src/stores/__tests__/walletStore.test.ts`

**Interfaces:**
- Consumes: `getBackupAccountSetHash(accounts: Account[]): Promise<string>`
- Produces: `BackupHealth`
- Produces: `EMPTY_BACKUP_HEALTH`
- Produces: `getBackupHealthLabel(health: BackupHealth): string`
- Produces: `isBackupHealthActionRequired(health: BackupHealth): boolean`
- Produces wallet store state `backupHealth: BackupHealth`
- Produces wallet store action `markBackupVerified(input: MarkBackupVerifiedInput): void`
- Produces wallet store action `markBackupStale(reason: string): void`
- Updates wallet store action `createBackupSnapshot(currentPin: string, backupSecret: string): Promise<WalletBackupSnapshot>`

- [ ] **Step 1: Add failing backup health tests**

Create `src/lib/__tests__/backupHealth.test.ts`:

```ts
import {
  EMPTY_BACKUP_HEALTH,
  getBackupHealthLabel,
  isBackupHealthActionRequired,
  markBackupHealthStale,
  markBackupHealthVerified,
} from '../backupHealth';

describe('backupHealth', () => {
  it('starts as unprotected and action-required', () => {
    expect(EMPTY_BACKUP_HEALTH.status).toBe('none');
    expect(getBackupHealthLabel(EMPTY_BACKUP_HEALTH)).toBe('Backup needed');
    expect(isBackupHealthActionRequired(EMPTY_BACKUP_HEALTH)).toBe(true);
  });

  it('marks a manual backup verified with public hashes', () => {
    const verified = markBackupHealthVerified({
      provider: 'manual-file',
      verifiedAt: '2026-06-20T00:00:00.000Z',
      walletFingerprint: 'wallet-hash',
      accountSetHash: 'account-hash',
    });

    expect(verified).toEqual({
      status: 'verified',
      provider: 'manual-file',
      lastCreatedAt: '2026-06-20T00:00:00.000Z',
      lastVerifiedAt: '2026-06-20T00:00:00.000Z',
      walletFingerprint: 'wallet-hash',
      accountSetHash: 'account-hash',
      failureReason: null,
    });
    expect(getBackupHealthLabel(verified)).toBe('Backup verified');
    expect(isBackupHealthActionRequired(verified)).toBe(false);
  });

  it('marks a verified backup stale without discarding previous provider metadata', () => {
    const verified = markBackupHealthVerified({
      provider: 'manual-file',
      verifiedAt: '2026-06-20T00:00:00.000Z',
      walletFingerprint: 'wallet-hash',
      accountSetHash: 'account-hash',
    });

    expect(markBackupHealthStale(verified, 'Account set changed')).toEqual({
      ...verified,
      status: 'stale',
      failureReason: 'Account set changed',
    });
  });
});
```

- [ ] **Step 2: Run backup health tests and verify they fail**

Run:

```bash
npm test -- src/lib/__tests__/backupHealth.test.ts --runInBand
```

Expected: FAIL because `../backupHealth` does not exist.

- [ ] **Step 3: Implement backup health pure helpers**

Create `src/lib/backupHealth.ts`:

```ts
export type BackupProvider = 'manual-file' | 'icloud' | 'google-drive';
export type BackupHealthStatus = 'none' | 'verified' | 'stale' | 'failed';

export type BackupHealth = {
  status: BackupHealthStatus;
  provider: BackupProvider | null;
  lastCreatedAt: string | null;
  lastVerifiedAt: string | null;
  walletFingerprint: string | null;
  accountSetHash: string | null;
  failureReason: string | null;
};

export type MarkBackupVerifiedInput = {
  provider: BackupProvider;
  verifiedAt: string;
  walletFingerprint: string;
  accountSetHash: string;
};

export const EMPTY_BACKUP_HEALTH: BackupHealth = {
  status: 'none',
  provider: null,
  lastCreatedAt: null,
  lastVerifiedAt: null,
  walletFingerprint: null,
  accountSetHash: null,
  failureReason: null,
};

export function markBackupHealthVerified(input: MarkBackupVerifiedInput): BackupHealth {
  return {
    status: 'verified',
    provider: input.provider,
    lastCreatedAt: input.verifiedAt,
    lastVerifiedAt: input.verifiedAt,
    walletFingerprint: input.walletFingerprint,
    accountSetHash: input.accountSetHash,
    failureReason: null,
  };
}

export function markBackupHealthStale(health: BackupHealth, reason: string): BackupHealth {
  if (health.status === 'none') {
    return health;
  }

  return {
    ...health,
    status: 'stale',
    failureReason: reason,
  };
}

export function getBackupHealthLabel(health: BackupHealth): string {
  switch (health.status) {
    case 'verified':
      return 'Backup verified';
    case 'stale':
      return 'Backup stale';
    case 'failed':
      return 'Backup failed';
    case 'none':
    default:
      return 'Backup needed';
  }
}

export function isBackupHealthActionRequired(health: BackupHealth): boolean {
  return health.status !== 'verified';
}
```

- [ ] **Step 4: Run backup health tests and verify they pass**

Run:

```bash
npm test -- src/lib/__tests__/backupHealth.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Add failing wallet store backup health tests**

Modify `src/stores/__tests__/walletStore.test.ts`.

Add constants:

```ts
const TEST_BACKUP_SECRET = 'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A';
```

Add tests:

```ts
it('encrypts backup snapshots with the backup recovery key, not the wallet PIN', async () => {
  const { useWalletStore, secureStoreState } = await loadWalletStore();

  useWalletStore.setState(EXISTING_STATE);
  secureStoreState.set(MNEMONIC_KEY, 'old mnemonic');
  secureStoreState.set(`${PRIVATE_KEY_PREFIX}old-imported`, 'old-private-key');

  const snapshot = await useWalletStore
    .getState()
    .createBackupSnapshot('123456', TEST_BACKUP_SECRET);

  expect(JSON.stringify(snapshot)).not.toContain('old mnemonic');
  expect(JSON.stringify(snapshot)).not.toContain('old-private-key');
});

it('marks backup health verified after a successful manual backup', async () => {
  const { useWalletStore } = await loadWalletStore();

  useWalletStore.getState().markBackupVerified({
    provider: 'manual-file',
    verifiedAt: '2026-06-20T00:00:00.000Z',
    walletFingerprint: 'wallet-hash',
    accountSetHash: 'account-hash',
  });

  expect(useWalletStore.getState().backupHealth).toEqual({
    status: 'verified',
    provider: 'manual-file',
    lastCreatedAt: '2026-06-20T00:00:00.000Z',
    lastVerifiedAt: '2026-06-20T00:00:00.000Z',
    walletFingerprint: 'wallet-hash',
    accountSetHash: 'account-hash',
    failureReason: null,
  });
});

it('marks an existing verified backup stale when an account is imported', async () => {
  const { useWalletStore, secureStoreState } = await loadWalletStore();

  useWalletStore.setState({
    ...EXISTING_STATE,
    accounts: [EXISTING_STATE.accounts[0]],
  });
  useWalletStore.getState().markBackupVerified({
    provider: 'manual-file',
    verifiedAt: '2026-06-20T00:00:00.000Z',
    walletFingerprint: 'wallet-hash',
    accountSetHash: 'account-hash',
  });
  secureStoreState.set(MNEMONIC_KEY, 'old mnemonic');

  await useWalletStore
    .getState()
    .importAccountFromPrivateKey(
      '1111111111111111111111111111111111111111111111111111111111111111',
      'Imported Test'
    );

  expect(useWalletStore.getState().backupHealth.status).toBe('stale');
  expect(useWalletStore.getState().backupHealth.failureReason).toBe('Account set changed');
});
```

- [ ] **Step 6: Run wallet store tests and verify they fail**

Run:

```bash
npm test -- src/stores/__tests__/walletStore.test.ts --runInBand
```

Expected: FAIL because `backupHealth`, `markBackupVerified`, and the new `createBackupSnapshot` signature are not implemented.

- [ ] **Step 7: Implement wallet store backup health**

Modify `src/stores/walletStore.ts` imports:

```ts
import {
  EMPTY_BACKUP_HEALTH,
  markBackupHealthStale,
  markBackupHealthVerified,
  type BackupHealth,
  type MarkBackupVerifiedInput,
} from '../lib/backupHealth';
```

Update `WalletState`:

```ts
  backupHealth: BackupHealth;
  createBackupSnapshot: (currentPin: string, backupSecret: string) => Promise<WalletBackupSnapshot>;
  markBackupVerified: (input: MarkBackupVerifiedInput) => void;
  markBackupStale: (reason: string) => void;
```

Set initial state:

```ts
backupHealth: EMPTY_BACKUP_HEALTH,
```

Add actions:

```ts
markBackupVerified: (input: MarkBackupVerifiedInput) => {
  set({ backupHealth: markBackupHealthVerified(input), lastBackupAt: input.verifiedAt });
},

markBackupStale: (reason: string) => {
  set((state) => ({ backupHealth: markBackupHealthStale(state.backupHealth, reason) }));
},
```

Update `createBackupSnapshot`:

```ts
createBackupSnapshot: async (currentPin: string, backupSecret: string) => {
  const pinIsValid = await verifyPin(currentPin);
  if (!pinIsValid) {
    throw new Error('Incorrect PIN');
  }

  if (!backupSecret.trim()) {
    throw new Error('Backup recovery key is required');
  }

  const { accounts, activeAccountId, nextDerivationIndex } = get();
  if (!accounts.length || !activeAccountId) {
    throw new Error('No wallet accounts found');
  }

  const mnemonic = await SecureStore.getItemAsync(MNEMONIC_KEY);
  const hasHdAccounts = accounts.some((account) => !account.isImported);
  if (hasHdAccounts && !mnemonic) {
    throw new Error(MISSING_RECOVERY_PHRASE_MESSAGE);
  }

  const encryptedMnemonic = mnemonic
    ? await encryptSecretWithBackupSecret(mnemonic, backupSecret)
    : undefined;

  const encryptedAccounts = await Promise.all(
    accounts.map(async (account) => {
      const privateKey = account.isImported
        ? await SecureStore.getItemAsync(`${PRIVATE_KEY_PREFIX}${account.id}`)
        : createWalletFromMnemonic(mnemonic!, account.derivationIndex).privateKey;

      if (!privateKey) {
        throw new Error(`Missing private key for account ${account.name}`);
      }

      return {
        ...account,
        encryptedPrivateKey: await encryptSecretWithBackupSecret(privateKey, backupSecret),
      };
    })
  );

  return {
    activeAccountId,
    nextDerivationIndex,
    encryptedMnemonic,
    accounts: encryptedAccounts,
  };
},
```

Mark backup stale in account-changing actions:

```ts
// addAccount
set((state) => ({
  accounts: [...state.accounts, newAccount],
  nextDerivationIndex: state.nextDerivationIndex + 1,
  backupHealth: markBackupHealthStale(state.backupHealth, 'Account set changed'),
}));
```

Use the same `backupHealth` transition in `importAccountFromPrivateKey`:

```ts
set((state) => ({
  accounts: [...state.accounts, newAccount],
  backupHealth: markBackupHealthStale(state.backupHealth, 'Account set changed'),
}));
```

Use this transition in `removeAccount`:

```ts
set((state) => ({
  accounts: updatedAccounts,
  activeAccountId: newActiveId,
  address: newAddress,
  balance: '0',
  backupHealth: markBackupHealthStale(state.backupHealth, 'Account set changed'),
}));
```

Use this transition in `restoreFromBackup` after secrets are written:

```ts
const restoredBackupHealth = backup.version === 2
  ? markBackupHealthVerified({
      provider: 'manual-file',
      verifiedAt: new Date().toISOString(),
      walletFingerprint: backup.walletFingerprint,
      accountSetHash: backup.accountSetHash,
    })
  : EMPTY_BACKUP_HEALTH;

set({
  accounts: restored.accounts,
  activeAccountId: restored.activeAccountId,
  nextDerivationIndex: restored.nextDerivationIndex,
  address: activeAccount.address,
  balance: '0',
  isWalletCreated: true,
  lastBackupAt: null,
  backupHealth: restoredBackupHealth,
});
```

Set `backupHealth: EMPTY_BACKUP_HEALTH` in both `createWallet` and `clearWallet`.

Persist `backupHealth`:

```ts
backupHealth: state.backupHealth,
```

- [ ] **Step 8: Run wallet store and backup health tests**

Run:

```bash
npm test -- src/lib/__tests__/backupHealth.test.ts src/stores/__tests__/walletStore.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/lib/backupHealth.ts src/lib/__tests__/backupHealth.test.ts src/stores/walletStore.ts src/stores/__tests__/walletStore.test.ts
git commit -m "feat: track wallet backup health"
```

---

### Task 3: Manual Backup and Restore UI Uses Recovery Key

**Files:**
- Modify: `src/screens/BackupRecoveryScreen.tsx`
- Create: `src/screens/__tests__/BackupRecoveryScreen.test.tsx`

**Interfaces:**
- Consumes: `generateBackupRecoveryKey`, `normalizeBackupRecoveryKey`, `isValidBackupRecoveryKey`
- Consumes: `createBackupSnapshot(currentPin, backupSecret)`
- Consumes: `createWalletBackup(snapshot, backupSecret)`
- Consumes: `verifyWalletBackup(backup, backupSecret)`
- Consumes: `markBackupVerified(input)`
- Produces: manual v2 backup flow using generated backup recovery key.

- [ ] **Step 1: Add failing BackupRecoveryScreen tests**

Create `src/screens/__tests__/BackupRecoveryScreen.test.tsx`:

```tsx
import React from 'react';
import { Alert, Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

const mockGoBack = jest.fn();
const mockCreateBackupSnapshot = jest.fn();
const mockRestoreFromBackup = jest.fn();
const mockMarkBackupVerified = jest.fn();
const mockGenerateBackupRecoveryKey = jest.fn(async () => 'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A');
const mockCreateWalletBackup = jest.fn(async () => ({
  kind: 'kondor-wallet-backup',
  version: 2,
  createdAt: '2026-06-20T00:00:00.000Z',
  updatedAt: '2026-06-20T00:00:00.000Z',
  appVersion: 'test',
  walletFingerprint: 'wallet-hash',
  accountSetHash: 'account-hash',
  encryption: {
    algorithm: 'pbkdf2-aes-256-gcm',
    digest: 'SHA-256',
    keyLength: 256,
    iterations: 250000,
  },
  wallet: { accounts: [] },
  checksum: 'checksum',
}));
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../lib/backupRecoveryKey', () => ({
  generateBackupRecoveryKey: () => mockGenerateBackupRecoveryKey(),
  normalizeBackupRecoveryKey: (value: string) => value.toUpperCase().replace(/\s+/g, '-'),
  isValidBackupRecoveryKey: (value: string) => value.includes('ABCD-EFGH'),
}));

jest.mock('../../lib/walletBackup', () => ({
  createWalletBackup: (...args: unknown[]) => mockCreateWalletBackup(...args),
  verifyWalletBackup: jest.fn(async () => true),
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => ({
    createBackupSnapshot: mockCreateBackupSnapshot,
    restoreFromBackup: mockRestoreFromBackup,
    markBackupVerified: mockMarkBackupVerified,
    backupHealth: {
      status: 'none',
      provider: null,
      lastCreatedAt: null,
      lastVerifiedAt: null,
      walletFingerprint: null,
      accountSetHash: null,
      failureReason: null,
    },
  }),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  EncodingType: { UTF8: 'utf8' },
  makeDirectoryAsync: jest.fn(async () => undefined),
  writeAsStringAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => '{}'),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock('../../lib/haptics', () => ({
  HapticFeedback: {
    success: jest.fn(async () => undefined),
    error: jest.fn(async () => undefined),
    selection: jest.fn(async () => undefined),
  },
}));

function findButton(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const node = renderer.root.findAllByType(Text).find((candidate) => candidate.props.children === label);
  if (!node?.parent) {
    throw new Error(`Button not found: ${label}`);
  }
  return node.parent;
}

describe('BackupRecoveryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateBackupSnapshot.mockResolvedValue({
      activeAccountId: 'acc-1',
      nextDerivationIndex: 1,
      accounts: [],
    });
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  it('requires generated recovery key confirmation before creating a backup', async () => {
    const { BackupRecoveryScreen } = require('../BackupRecoveryScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BackupRecoveryScreen />);
    });

    await act(async () => {
      findButton(renderer!, 'Generate Recovery Key').props.onPress();
    });

    const inputs = renderer!.root.findAllByType(TextInput);
    await act(async () => {
      inputs.find((input) => input.props.placeholder === 'Current wallet PIN')?.props.onChangeText('123456');
    });

    await act(async () => {
      findButton(renderer!, 'Create Manual Backup').props.onPress();
    });

    expect(mockCreateBackupSnapshot).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Recovery Key Required',
      'Confirm the generated backup recovery key before creating this backup.'
    );
  });

  it('creates a manual backup with current PIN plus backup recovery key', async () => {
    const { BackupRecoveryScreen } = require('../BackupRecoveryScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BackupRecoveryScreen />);
    });

    await act(async () => {
      findButton(renderer!, 'Generate Recovery Key').props.onPress();
    });

    const inputs = renderer!.root.findAllByType(TextInput);
    await act(async () => {
      inputs.find((input) => input.props.placeholder === 'Current wallet PIN')?.props.onChangeText('123456');
      inputs
        .find((input) => input.props.placeholder === 'Confirm backup recovery key')
        ?.props.onChangeText('ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A');
    });

    await act(async () => {
      findButton(renderer!, 'Create Manual Backup').props.onPress();
    });

    expect(mockCreateBackupSnapshot).toHaveBeenCalledWith(
      '123456',
      'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A'
    );
    expect(mockCreateWalletBackup).toHaveBeenCalledWith(
      expect.any(Object),
      'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A'
    );
    expect(mockMarkBackupVerified).toHaveBeenCalledWith({
      provider: 'manual-file',
      verifiedAt: expect.any(String),
      walletFingerprint: 'wallet-hash',
      accountSetHash: 'account-hash',
    });
  });
});
```

- [ ] **Step 2: Run BackupRecoveryScreen tests and verify they fail**

Run:

```bash
npm test -- src/screens/__tests__/BackupRecoveryScreen.test.tsx --runInBand
```

Expected: FAIL because the screen still uses `backupPin`, `setLastBackupAt`, and old button labels.

- [ ] **Step 3: Implement recovery-key manual backup UI**

Modify `src/screens/BackupRecoveryScreen.tsx` imports:

```ts
import {
  generateBackupRecoveryKey,
  isValidBackupRecoveryKey,
  normalizeBackupRecoveryKey,
} from '../lib/backupRecoveryKey';
import { getBackupHealthLabel } from '../lib/backupHealth';
```

Replace store selection:

```ts
const {
  backupHealth,
  createBackupSnapshot,
  restoreFromBackup,
  markBackupVerified,
} = useWalletStore();
```

Replace backup state:

```ts
const [currentBackupPin, setCurrentBackupPin] = useState('');
const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');
const [confirmedRecoveryKey, setConfirmedRecoveryKey] = useState('');
```

Add generator:

```ts
const handleGenerateRecoveryKey = async () => {
  const key = await generateBackupRecoveryKey();
  setGeneratedRecoveryKey(key);
  setConfirmedRecoveryKey('');
  await HapticFeedback.selection();
};
```

Update backup creation guard:

```ts
const normalizedConfirmedKey = normalizeBackupRecoveryKey(confirmedRecoveryKey);
if (!generatedRecoveryKey || normalizedConfirmedKey !== generatedRecoveryKey) {
  Alert.alert(
    'Recovery Key Required',
    'Confirm the generated backup recovery key before creating this backup.'
  );
  return;
}

if (!isValidBackupRecoveryKey(normalizedConfirmedKey)) {
  Alert.alert('Invalid Recovery Key', 'Use the generated backup recovery key exactly as shown.');
  return;
}
```

Update snapshot and backup calls:

```ts
const snapshot = await createBackupSnapshot(currentBackupPin.trim(), normalizedConfirmedKey);
const backup = await createWalletBackup(snapshot, normalizedConfirmedKey);
```

After file write and before success alert:

```ts
const completedAt = new Date().toISOString();
markBackupVerified({
  provider: 'manual-file',
  verifiedAt: completedAt,
  walletFingerprint: backup.version === 2 ? backup.walletFingerprint : '',
  accountSetHash: backup.version === 2 ? backup.accountSetHash : '',
});
```

Update status text:

```tsx
<Text style={styles.statusText}>{getBackupHealthLabel(backupHealth)}</Text>
```

Use these labels in the create section:

- `Generate Recovery Key`
- `Current wallet PIN`
- `Confirm backup recovery key`
- `Create Manual Backup`

Change restore copy from "Backup PIN" to "Backup recovery key or legacy backup PIN" while keeping `restorePin` state for compatibility.

- [ ] **Step 4: Run BackupRecoveryScreen tests**

Run:

```bash
npm test -- src/screens/__tests__/BackupRecoveryScreen.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 5: Run related backup tests**

Run:

```bash
npm test -- src/screens/__tests__/BackupRecoveryScreen.test.tsx src/lib/__tests__/walletBackup.test.ts src/stores/__tests__/walletStore.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/screens/BackupRecoveryScreen.tsx src/screens/__tests__/BackupRecoveryScreen.test.tsx
git commit -m "feat: require recovery key for manual backups"
```

---

### Task 4: Backup Warning Surfaces

**Files:**
- Create: `src/components/BackupStatusNotice.tsx`
- Create: `src/components/__tests__/BackupStatusNotice.test.tsx`
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/screens/ReceiveScreen.tsx`
- Modify: `src/screens/SendScreen.tsx`
- Modify: `src/screens/__tests__/HomeScreen.test.tsx`
- Modify: `src/screens/__tests__/SendScreen.test.tsx`
- Create: `src/screens/__tests__/ReceiveScreen.test.tsx`

**Interfaces:**
- Consumes: `backupHealth` from `useWalletStore`
- Consumes: `getBackupHealthLabel` and `isBackupHealthActionRequired`
- Produces: `BackupStatusNotice({ backupHealth, onPress, compact? })`
- Produces: visible warnings for backup states `none`, `stale`, and `failed`.

- [ ] **Step 1: Add failing BackupStatusNotice tests**

Create `src/components/__tests__/BackupStatusNotice.test.tsx`:

```tsx
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { BackupStatusNotice } from '../BackupStatusNotice';
import type { BackupHealth } from '../../lib/backupHealth';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const baseHealth: BackupHealth = {
  status: 'none',
  provider: null,
  lastCreatedAt: null,
  lastVerifiedAt: null,
  walletFingerprint: null,
  accountSetHash: null,
  failureReason: null,
};

function text(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .flat()
    .filter(Boolean)
    .join(' ');
}

describe('BackupStatusNotice', () => {
  it('renders nothing when backup is verified', () => {
    const renderer = TestRenderer.create(
      <BackupStatusNotice
        backupHealth={{ ...baseHealth, status: 'verified', provider: 'manual-file' }}
        onPress={jest.fn()}
      />
    );

    expect(renderer.root.findAllByType(Text)).toHaveLength(0);
  });

  it('renders action copy for missing backup', () => {
    const renderer = TestRenderer.create(
      <BackupStatusNotice backupHealth={baseHealth} onPress={jest.fn()} />
    );

    expect(text(renderer)).toContain('Back up this wallet');
    expect(text(renderer)).toContain('Create a verified encrypted backup before relying on this wallet.');
  });

  it('fires onPress from the notice', () => {
    const onPress = jest.fn();
    const renderer = TestRenderer.create(
      <BackupStatusNotice backupHealth={baseHealth} onPress={onPress} />
    );

    renderer.root.findByType(TouchableOpacity).props.onPress();

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run component tests and verify they fail**

Run:

```bash
npm test -- src/components/__tests__/BackupStatusNotice.test.tsx --runInBand
```

Expected: FAIL because `BackupStatusNotice` does not exist.

- [ ] **Step 3: Implement BackupStatusNotice**

Create `src/components/BackupStatusNotice.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getBackupHealthLabel,
  isBackupHealthActionRequired,
  type BackupHealth,
} from '../lib/backupHealth';
import colors from '../theme/colors';

type BackupStatusNoticeProps = {
  backupHealth: BackupHealth;
  onPress: () => void;
  compact?: boolean;
};

export function BackupStatusNotice({
  backupHealth,
  onPress,
  compact = false,
}: BackupStatusNoticeProps) {
  if (!isBackupHealthActionRequired(backupHealth)) {
    return null;
  }

  const body = backupHealth.status === 'stale'
    ? 'Your wallet changed after the last backup. Create a fresh encrypted backup.'
    : backupHealth.status === 'failed'
      ? 'The last backup did not verify. Create a verified encrypted backup before relying on it.'
      : 'Create a verified encrypted backup before relying on this wallet.';

  return (
    <TouchableOpacity style={[styles.container, compact && styles.compact]} onPress={onPress}>
      <View style={styles.iconWrap}>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>
          {backupHealth.status === 'none' ? 'Back up this wallet' : getBackupHealthLabel(backupHealth)}
        </Text>
        {!compact && <Text style={styles.body}>{body}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 8,
    padding: 12,
  },
  compact: {
    paddingVertical: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
});
```

- [ ] **Step 4: Run component tests**

Run:

```bash
npm test -- src/components/__tests__/BackupStatusNotice.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 5: Add warnings to Home, Receive, and Send**

Modify `src/screens/HomeScreen.tsx`:

```ts
import { BackupStatusNotice } from '../components/BackupStatusNotice';
```

Select `backupHealth`:

```ts
const { address, updateBalance, accounts, getActiveAccount, backupHealth } = useWalletStore();
```

Add a handler:

```ts
const handleBackupPress = () => {
  navigation.navigate('Settings');
};
```

Render the notice near the top of the main content before action buttons:

```tsx
<BackupStatusNotice backupHealth={backupHealth} onPress={handleBackupPress} />
```

Modify `src/screens/ReceiveScreen.tsx`:

```ts
import { BackupStatusNotice } from '../components/BackupStatusNotice';
```

Select `backupHealth`:

```ts
const { address, backupHealth } = useWalletStore();
```

Add handler:

```ts
const handleBackupPress = () => {
  navigation.navigate('Settings');
};
```

Render before the QR code:

```tsx
<BackupStatusNotice backupHealth={backupHealth} onPress={handleBackupPress} />
```

Modify `src/screens/SendScreen.tsx`:

```ts
import { BackupStatusNotice } from '../components/BackupStatusNotice';
```

Select `backupHealth` from wallet store, and render a compact notice above the send button:

```tsx
<BackupStatusNotice
  backupHealth={backupHealth}
  compact
  onPress={() => navigation.navigate('Settings')}
/>
```

- [ ] **Step 6: Update screen tests**

In `src/screens/__tests__/SendScreen.test.tsx`, extend the wallet store mock:

```ts
let mockBackupHealth = {
  status: 'verified' as const,
  provider: 'manual-file' as const,
  lastCreatedAt: '2026-06-20T00:00:00.000Z',
  lastVerifiedAt: '2026-06-20T00:00:00.000Z',
  walletFingerprint: 'wallet-hash',
  accountSetHash: 'account-hash',
  failureReason: null,
};
```

Update mocked `useWalletStore` return:

```ts
backupHealth: mockBackupHealth,
```

Add this test:

```ts
it('shows a backup warning before sending from an unbacked wallet', async () => {
  mockBackupHealth = {
    status: 'none',
    provider: null,
    lastCreatedAt: null,
    lastVerifiedAt: null,
    walletFingerprint: null,
    accountSetHash: null,
    failureReason: null,
  };
  const { SendScreen } = require('../SendScreen');

  let renderer: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<SendScreen />);
  });

  expect(collectRenderedText(renderer!).join(' ')).toContain('Back up this wallet');
});
```

Create `src/screens/__tests__/ReceiveScreen.test.tsx`:

```tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

const mockNavigate = jest.fn();
const mockAddress = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: undefined }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-native-qrcode-svg', () => 'QRCode');

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => ({
    address: mockAddress,
    backupHealth: {
      status: 'none',
      provider: null,
      lastCreatedAt: null,
      lastVerifiedAt: null,
      walletFingerprint: null,
      accountSetHash: null,
      failureReason: null,
    },
  }),
}));

function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .flat()
    .filter(Boolean)
    .join(' ');
}

describe('ReceiveScreen backup warning', () => {
  it('shows backup warning before displaying a receive address', async () => {
    const { ReceiveScreen } = require('../ReceiveScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<ReceiveScreen />);
    });

    expect(renderedText(renderer!)).toContain('Back up this wallet');
  });
});
```

In `src/screens/__tests__/HomeScreen.test.tsx`, add mutable backup health state near `mockTokenState`:

```ts
let mockBackupHealth = {
  status: 'verified' as const,
  provider: 'manual-file' as const,
  lastCreatedAt: '2026-06-20T00:00:00.000Z',
  lastVerifiedAt: '2026-06-20T00:00:00.000Z',
  walletFingerprint: 'wallet-hash',
  accountSetHash: 'account-hash',
  failureReason: null,
};
```

Update the wallet store mock return:

```ts
backupHealth: mockBackupHealth,
```

Reset `mockBackupHealth` in `beforeEach`:

```ts
mockBackupHealth = {
  status: 'verified',
  provider: 'manual-file',
  lastCreatedAt: '2026-06-20T00:00:00.000Z',
  lastVerifiedAt: '2026-06-20T00:00:00.000Z',
  walletFingerprint: 'wallet-hash',
  accountSetHash: 'account-hash',
  failureReason: null,
};
```

Add this test in the existing `HomeScreen network initialization` describe block:

```ts
it('shows a backup warning for an unbacked wallet', async () => {
  mockNetworkState = {
    mode: 'mainnet',
    hasHydrated: true,
  };
  mockBackupHealth = {
    status: 'none',
    provider: null,
    lastCreatedAt: null,
    lastVerifiedAt: null,
    walletFingerprint: null,
    accountSetHash: null,
    failureReason: null,
  };

  const { HomeScreen } = require('../HomeScreen');
  let renderer: TestRenderer.ReactTestRenderer;

  await act(async () => {
    renderer = TestRenderer.create(<HomeScreen />);
  });
  await flushEffects();

  expect(collectRenderedText(renderer!).join(' ')).toContain('Back up this wallet');
});
```

- [ ] **Step 7: Run warning-related tests**

Run:

```bash
npm test -- src/components/__tests__/BackupStatusNotice.test.tsx src/screens/__tests__/SendScreen.test.tsx src/screens/__tests__/ReceiveScreen.test.tsx src/screens/__tests__/HomeScreen.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/components/BackupStatusNotice.tsx src/components/__tests__/BackupStatusNotice.test.tsx src/screens/HomeScreen.tsx src/screens/ReceiveScreen.tsx src/screens/SendScreen.tsx src/screens/__tests__/HomeScreen.test.tsx src/screens/__tests__/ReceiveScreen.test.tsx src/screens/__tests__/SendScreen.test.tsx
git commit -m "feat: surface wallet backup warnings"
```

---

### Task 5: Final Verification and Documentation Check

**Files:**
- Modify: `docs/legal/privacy-policy.md` only if current wording is contradicted by the implemented manual backup behavior.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified Phase 1 branch with no unreviewed plan gaps.

- [ ] **Step 1: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 2: Run full Jest suite**

Run:

```bash
npm test -- --runInBand
```

Expected: all suites pass.

- [ ] **Step 3: Run React Doctor**

Run:

```bash
npx -y react-doctor@latest . --verbose --scope changed
```

Expected: exit 0. Existing branch-wide warnings can remain if unrelated; new warnings in files changed by this plan need investigation before completion.

- [ ] **Step 4: Review privacy copy**

Read:

```bash
sed -n '1,120p' docs/legal/privacy-policy.md
```

If it still truthfully says recovery phrases are stored locally and never sent plaintext, leave it unchanged. If it omits the new encrypted manual backup behavior, add this bullet under wallet/security data:

```md
- **Encrypted wallet backups** - Backup files may include encrypted recovery phrases and private keys. Kondor never stores or receives the plaintext recovery phrase, private keys, or backup recovery key.
```

- [ ] **Step 5: Run final status check**

Run:

```bash
git status --short
```

Expected: only intended Phase 1 files are modified or staged.

- [ ] **Step 6: Commit Task 5 if docs changed**

If `docs/legal/privacy-policy.md` changed:

```bash
git add docs/legal/privacy-policy.md
git commit -m "docs: clarify encrypted backup privacy"
```

If no docs changed, do not create an empty commit.

---

## Plan Self-Review

Spec coverage:

- Strong backup secret: Task 1 and Task 3.
- V2 backup envelope: Task 1.
- V1 restore support: Task 1.
- Backup health state: Task 2.
- Stale backup after account changes: Task 2.
- Backup warnings before risky moments: Task 4.
- Manual backup remains available before cloud providers: Task 3.
- iCloud and Google Drive are excluded from Phase 1 and remain separate plans.
- No custody or social recovery is added.

Type consistency:

- `BackupHealth`, `BackupProvider`, and `MarkBackupVerifiedInput` are defined in Task 2 and consumed by Tasks 3 and 4.
- `createBackupSnapshot(currentPin, backupSecret)` is defined in Task 2 and consumed by Task 3.
- `createWalletBackup(snapshot, backupSecret, options?)` is defined in Task 1 and consumed by Task 3.
- `BackupStatusNotice` consumes `BackupHealth` from Task 2.

Validation commands:

- Focused tests are included per task.
- Final checks include `npx tsc --noEmit`, full Jest, and React Doctor changed-scope scan.
