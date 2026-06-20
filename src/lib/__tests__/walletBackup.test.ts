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
const LEGACY_V1_BACKUP: BackupData = {
  kind: 'kondor-wallet-backup',
  version: 1,
  createdAt: '2026-06-19T00:00:00.000Z',
  wallet: {
    activeAccountId: 'acc-1',
    nextDerivationIndex: 2,
    encryptedMnemonic: {
      algorithm: 'pbkdf2-aes-256-gcm',
      ciphertext:
        '40677e902e9b2aa32d83bb6e8d844a107fa88d698f4b58bf6fea23c2faf044c22532b251ae040766090d3fedc0b380c9b684ab3e5f34fff7de947d4561ed2769d80cbf9231461755c2128fc8418685902946da72186931ea9a881bd698a8b060def781ff2b767cb2a0e9ab7f36',
      iv: '0a0b0c0d0e0f101112131415',
      salt: '00112233445566778899aabbccddeeff',
      iterations: 250000,
      digest: 'SHA-256',
      keyLength: 256,
    },
    accounts: [
      {
        id: 'acc-1',
        name: 'Account 1',
        address: '1DFF1akeStY8SfomzFsSYsZPesQcbnF1vR',
        derivationIndex: 0,
        isImported: false,
        encryptedPrivateKey: {
          algorithm: 'pbkdf2-aes-256-gcm',
          ciphertext:
            'b10bc00742d27875be7dcb09107503b4e9c83b414cb1f6efd2be4df7bc509220a6feaaacab4402aa3bcafdda4b66243a02aece6658482a22720f310bfae9df708759272576518f10117996b8643ba551',
          iv: '202122232425262728292a2b',
          salt: '102132435465768798a9bacbdcedfe0f',
          iterations: 250000,
          digest: 'SHA-256',
          keyLength: 256,
        },
      },
      {
        id: 'acc-2',
        name: 'Account 2',
        address: '15n9ZbL3xmLBCUFtVQUzXKox5WhFnyAba3',
        derivationIndex: 1,
        isImported: false,
        encryptedPrivateKey: {
          algorithm: 'pbkdf2-aes-256-gcm',
          ciphertext:
            '0f1c19cf4507da6adb0d4c68e145e19667ec975c47716e6a5b62e87d4d5aa867692ea1454f9cd0d6ab55f2d17c99f241b35ca5e1de58f36fc641d153e3176ded500e4ff836096db47f6f9143169cb1b7',
          iv: '303132333435363738393a3b',
          salt: '11223344556677889900aabbccddeeff',
          iterations: 250000,
          digest: 'SHA-256',
          keyLength: 256,
        },
      },
      {
        id: 'acc-3',
        name: 'Imported 1',
        address: '1Q1pE5vPGEEMqRcVRMbtBK842Y6Pzo6nK9',
        derivationIndex: -1,
        isImported: true,
        encryptedPrivateKey: {
          algorithm: 'pbkdf2-aes-256-gcm',
          ciphertext:
            'ee86d7451c72f1ab906b5be849013e93f7f1e3084f01384cb8612b3ce2528cbc42f844c175dafcdfcf1d2c9922e500c2123d19ce94bc2b8946a3962798278d17ae7c7bcb96c3f91e2b4ffdde9f6a0595',
          iv: '404142434445464748494a4b',
          salt: '12233445566778899aabbccddeeff001',
          iterations: 250000,
          digest: 'SHA-256',
          keyLength: 256,
        },
      },
    ],
  },
  checksum: 'b6f43ef7dcc3c13890fab7515584f4edbdc481ccc360678e873a8055adf23a3a',
};

async function buildSnapshot(): Promise<WalletBackupSnapshot> {
  const hdPrimary = createWalletFromMnemonic(TEST_MNEMONIC, 0);
  const hdSecondary = createWalletFromMnemonic(TEST_MNEMONIC, 1);
  const imported = createWalletFromPrivateKey(
    '1111111111111111111111111111111111111111111111111111111111111111'
  );

  return {
    activeAccountId: 'acc-1',
    nextDerivationIndex: 2,
    encryptedMnemonic: await encryptSecretWithBackupSecret(TEST_MNEMONIC, TEST_BACKUP_SECRET),
    accounts: [
      {
        id: 'acc-1',
        name: 'Account 1',
        address: hdPrimary.address,
        derivationIndex: 0,
        isImported: false,
        encryptedPrivateKey: await encryptSecretWithBackupSecret(
          hdPrimary.privateKey,
          TEST_BACKUP_SECRET
        ),
      },
      {
        id: 'acc-2',
        name: 'Account 2',
        address: hdSecondary.address,
        derivationIndex: 1,
        isImported: false,
        encryptedPrivateKey: await encryptSecretWithBackupSecret(
          hdSecondary.privateKey,
          TEST_BACKUP_SECRET
        ),
      },
      {
        id: 'acc-3',
        name: 'Imported 1',
        address: imported.address,
        derivationIndex: -1,
        isImported: true,
        encryptedPrivateKey: await encryptSecretWithBackupSecret(
          imported.privateKey,
          TEST_BACKUP_SECRET
        ),
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
    await expect(
      restoreWalletBackup(LEGACY_V1_BACKUP, LEGACY_PIN, { skipChecksum: true })
    ).resolves.toMatchObject({
      activeAccountId: 'acc-1',
      mnemonic: TEST_MNEMONIC,
    });
  });

  it('always creates v2 backups even if a legacy version is requested', async () => {
    const snapshot = await buildSnapshot();

    const backup = await createWalletBackup(snapshot, TEST_BACKUP_SECRET, {
      version: 1 as 1,
      now: '2026-06-20T00:00:00.000Z',
    } as any);

    expect(backup.version).toBe(2);
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
