import { createWalletFromMnemonic, createWalletFromPrivateKey } from '../wallet';
import {
  createWalletBackup,
  encryptSecretWithPin,
  restoreWalletBackup,
  verifyWalletBackup,
  type WalletBackupSnapshot,
} from '../walletBackup';

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PIN = '123456';

async function buildSnapshot(): Promise<WalletBackupSnapshot> {
  const hdPrimary = createWalletFromMnemonic(TEST_MNEMONIC, 0);
  const hdSecondary = createWalletFromMnemonic(TEST_MNEMONIC, 1);
  const imported = createWalletFromPrivateKey(
    '1111111111111111111111111111111111111111111111111111111111111111'
  );

  return {
    activeAccountId: 'acc-1',
    nextDerivationIndex: 2,
    encryptedMnemonic: await encryptSecretWithPin(TEST_MNEMONIC, TEST_PIN),
    accounts: [
      {
        id: 'acc-1',
        name: 'Account 1',
        address: hdPrimary.address,
        derivationIndex: 0,
        isImported: false,
        encryptedPrivateKey: await encryptSecretWithPin(hdPrimary.privateKey, TEST_PIN),
      },
      {
        id: 'acc-2',
        name: 'Account 2',
        address: hdSecondary.address,
        derivationIndex: 1,
        isImported: false,
        encryptedPrivateKey: await encryptSecretWithPin(hdSecondary.privateKey, TEST_PIN),
      },
      {
        id: 'acc-3',
        name: 'Imported 1',
        address: imported.address,
        derivationIndex: -1,
        isImported: true,
        encryptedPrivateKey: await encryptSecretWithPin(imported.privateKey, TEST_PIN),
      },
    ],
  };
}

describe('walletBackup', () => {
  it('creates a valid backup without plaintext secrets and verifies with the correct PIN', async () => {
    const snapshot = await buildSnapshot();

    const backup = await createWalletBackup(snapshot, TEST_PIN);
    const serialized = JSON.stringify(backup);

    expect(backup.version).toBe(1);
    expect(backup.kind).toBe('kondor-wallet-backup');
    expect(serialized).not.toContain(TEST_MNEMONIC);
    expect(serialized).not.toContain(createWalletFromMnemonic(TEST_MNEMONIC, 0).privateKey);
    await expect(verifyWalletBackup(backup, TEST_PIN)).resolves.toBe(true);
  });

  it('rejects the wrong PIN during verification', async () => {
    const snapshot = await buildSnapshot();
    const backup = await createWalletBackup(snapshot, TEST_PIN);

    await expect(verifyWalletBackup(backup, '654321')).resolves.toBe(false);
  });

  it('rejects a checksum mismatch', async () => {
    const snapshot = await buildSnapshot();
    const backup = await createWalletBackup(snapshot, TEST_PIN);

    const tamperedBackup = {
      ...backup,
      wallet: {
        ...backup.wallet,
        accounts: backup.wallet.accounts.map((account, index) =>
          index === 0 ? { ...account, name: 'Tampered' } : account
        ),
      },
    };

    await expect(verifyWalletBackup(tamperedBackup, TEST_PIN)).resolves.toBe(false);
  });

  it('rejects an unsupported version', async () => {
    const snapshot = await buildSnapshot();
    const backup = await createWalletBackup(snapshot, TEST_PIN);

    await expect(
      restoreWalletBackup({ ...backup, version: 2 as 1 }, TEST_PIN)
    ).rejects.toThrow('Unsupported backup version');
  });

  it('rejects backups with missing encrypted account keys', async () => {
    const snapshot = await buildSnapshot();
    const backup = await createWalletBackup(snapshot, TEST_PIN);
    const brokenBackup = {
      ...backup,
      wallet: {
        ...backup.wallet,
        accounts: backup.wallet.accounts.map((account, index) =>
          index === 1 ? ({ ...account, encryptedPrivateKey: undefined } as any) : account
        ),
      },
    };

    await expect(verifyWalletBackup(brokenBackup, TEST_PIN)).resolves.toBe(false);
  });

  it('rejects backups whose active account is missing from the restored accounts', async () => {
    const snapshot = await buildSnapshot();
    const backup = await createWalletBackup(snapshot, TEST_PIN);
    const brokenBackup = {
      ...backup,
      wallet: {
        ...backup.wallet,
        activeAccountId: 'missing-account',
      },
    };

    await expect(restoreWalletBackup(brokenBackup, TEST_PIN, { skipChecksum: true })).rejects.toThrow(
      'Backup restore did not include an active account'
    );
  });

  it('restores the wallet snapshot shape for store persistence', async () => {
    const snapshot = await buildSnapshot();
    const backup = await createWalletBackup(snapshot, TEST_PIN);

    const restored = await restoreWalletBackup(backup, TEST_PIN);

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
