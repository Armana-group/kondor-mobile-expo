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

async function buildSnapshot(): Promise<WalletBackupSnapshot> {
  return buildSnapshotWithSecret(TEST_BACKUP_SECRET);
}

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

describe('walletBackup', () => {
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

  it('rejects the wrong PIN during verification', async () => {
    const snapshot = await buildSnapshot();
    const backup = await createWalletBackup(snapshot, TEST_BACKUP_SECRET);

    await expect(verifyWalletBackup(backup, '654321')).resolves.toBe(false);
  });

  it('rejects a checksum mismatch', async () => {
    const snapshot = await buildSnapshot();
    const backup = await createWalletBackup(snapshot, TEST_BACKUP_SECRET);

    const tamperedBackup = {
      ...backup,
      wallet: {
        ...backup.wallet,
        accounts: backup.wallet.accounts.map((account, index) =>
          index === 0 ? { ...account, name: 'Tampered' } : account
        ),
      },
    };

    await expect(verifyWalletBackup(tamperedBackup, TEST_BACKUP_SECRET)).resolves.toBe(false);
  });

  it('rejects an unsupported version', async () => {
    const snapshot = await buildSnapshot();
    const backup = await createWalletBackup(snapshot, TEST_BACKUP_SECRET);

    await expect(
      restoreWalletBackup({ ...backup, version: 3 } as unknown as BackupData, TEST_BACKUP_SECRET)
    ).rejects.toThrow('Unsupported backup version');
  });

  it('rejects backups with missing encrypted account keys', async () => {
    const snapshot = await buildSnapshot();
    const backup = await createWalletBackup(snapshot, TEST_BACKUP_SECRET);
    const brokenBackup = {
      ...backup,
      wallet: {
        ...backup.wallet,
        accounts: backup.wallet.accounts.map((account, index) =>
          index === 1 ? ({ ...account, encryptedPrivateKey: undefined } as any) : account
        ),
      },
    };

    await expect(verifyWalletBackup(brokenBackup, TEST_BACKUP_SECRET)).resolves.toBe(false);
  });

  it('rejects backups whose active account is missing from the restored accounts', async () => {
    const snapshot = await buildSnapshot();
    const backup = await createWalletBackup(snapshot, TEST_BACKUP_SECRET);
    const brokenBackup = {
      ...backup,
      wallet: {
        ...backup.wallet,
        activeAccountId: 'missing-account',
      },
    };

    await expect(
      restoreWalletBackup(brokenBackup, TEST_BACKUP_SECRET, { skipChecksum: true })
    ).rejects.toThrow(
      'Backup restore did not include an active account'
    );
  });

  it('restores the wallet snapshot shape for store persistence', async () => {
    const snapshot = await buildSnapshot();
    const backup = await createWalletBackup(snapshot, TEST_BACKUP_SECRET);

    const restored = await restoreWalletBackup(backup, TEST_BACKUP_SECRET);

    expect(restored).toEqual({
      activeAccountId: 'acc-1',
      nextDerivationIndex: 2,
      accounts: [
        {
          id: 'acc-1',
          name: 'Account 1',
          address: createWalletFromMnemonic(TEST_MNEMONIC, 0).address,
          derivationIndex: 0,
          isImported: false,
        },
        {
          id: 'acc-2',
          name: 'Account 2',
          address: createWalletFromMnemonic(TEST_MNEMONIC, 1).address,
          derivationIndex: 1,
          isImported: false,
        },
        {
          id: 'acc-3',
          name: 'Imported 1',
          address: createWalletFromPrivateKey(
            '1111111111111111111111111111111111111111111111111111111111111111'
          ).address,
          derivationIndex: -1,
          isImported: true,
        },
      ],
      mnemonic: TEST_MNEMONIC,
      importedPrivateKeys: {
        'acc-3': '1111111111111111111111111111111111111111111111111111111111111111',
      },
    });
  });
});
