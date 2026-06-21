jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const AsyncStorage = require('@react-native-async-storage/async-storage');

const MNEMONIC_KEY = 'kondor_wallet_mnemonic';
const PRIVATE_KEY_PREFIX = 'kondor_pk_';
const LEGACY_PRIVATE_KEY = 'kondor_wallet_private_key';
const MISSING_RECOVERY_PHRASE_MESSAGE =
  'Recovery phrase is missing from secure storage. Re-import this wallet from the recovery phrase to restore secret access.';
const TEST_BACKUP_SECRET = 'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A';

const EXISTING_STATE = {
  accounts: [
    {
      id: 'old-hd',
      name: 'Account 1',
      address: '1OldHdAddress',
      derivationIndex: 0,
      isImported: false,
    },
    {
      id: 'old-imported',
      name: 'Imported 1',
      address: '1OldImportedAddress',
      derivationIndex: -1,
      isImported: true,
    },
  ],
  activeAccountId: 'old-hd',
  nextDerivationIndex: 1,
  address: '1OldHdAddress',
  balance: '42',
  isWalletCreated: true,
  lastBackupAt: '2026-06-19T00:00:00.000Z',
};

const RESTORED_SNAPSHOT = {
  accounts: [
    {
      id: 'new-hd',
      name: 'Account 1',
      address: '1NewHdAddress',
      derivationIndex: 0,
      isImported: false,
    },
    {
      id: 'new-imported',
      name: 'Imported 1',
      address: '1NewImportedAddress',
      derivationIndex: -1,
      isImported: true,
    },
  ],
  activeAccountId: 'new-hd',
  nextDerivationIndex: 1,
  mnemonic: 'new mnemonic',
  importedPrivateKeys: {
    'new-imported': 'new-private-key',
  },
};

async function loadWalletStore(options?: {
  verifyPin?: (pin: string) => Promise<boolean>;
  restoreWalletBackup?: () => Promise<typeof RESTORED_SNAPSHOT>;
}) {
  jest.resetModules();

  const verifyPin = jest.fn(options?.verifyPin ?? (async () => true));
  const restoreWalletBackup = jest.fn(
    options?.restoreWalletBackup ?? (async () => RESTORED_SNAPSHOT)
  );
  const requireBiometricAuth = jest.fn(async () => true);

  jest.doMock('../../services/auth', () => ({
    verifyPin,
  }));
  jest.doMock('../../lib/biometrics', () => ({
    requireBiometricAuth,
  }));
  jest.doMock('../../lib/wallet', () => ({
    createWalletFromMnemonic: jest.fn((_mnemonic: string, derivationIndex: number) => ({
      address: `hd-address-${derivationIndex}`,
      privateKey: `hd-private-key-${derivationIndex}`,
    })),
    createWalletFromPrivateKey: jest.fn((privateKey: string) => ({
      address: `imported-address-${privateKey.slice(0, 8)}`,
      privateKey,
    })),
    validateMnemonic: jest.fn(() => true),
  }));
  jest.doMock('../../lib/walletBackup', () => ({
    restoreWalletBackup,
    encryptSecretWithPin: jest.fn(),
    encryptSecretWithBackupSecret: jest.fn(async (secret: string, _backupSecret: string) => ({
      algorithm: 'pbkdf2-aes-256-gcm',
      ciphertext: `enc:${secret.length}`,
      iv: 'iv',
      salt: 'salt',
      iterations: 250000,
      digest: 'SHA-256',
      keyLength: 256,
    })),
  }));

  const mod = require('../walletStore');
  const secureStore = require('expo-secure-store');
  await mod.useWalletStore.persist.rehydrate();

  return {
    ...mod,
    secureStore,
    secureStoreState: secureStore.__store as Map<string, string>,
    verifyPin,
    restoreWalletBackup,
    requireBiometricAuth,
  };
}

describe('walletStore backup restore hardening', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('requires the current wallet PIN before replacing the device wallet', async () => {
    const { useWalletStore, secureStoreState, verifyPin, restoreWalletBackup } = await loadWalletStore({
      verifyPin: async () => false,
    });

    useWalletStore.setState(EXISTING_STATE);
    secureStoreState.set(MNEMONIC_KEY, 'old mnemonic');
    secureStoreState.set(`${PRIVATE_KEY_PREFIX}old-imported`, 'old-private-key');

    await expect(
      useWalletStore.getState().restoreFromBackup({} as any, 'backup-pin', '000000')
    ).rejects.toThrow('Current PIN is incorrect');

    expect(verifyPin).toHaveBeenCalledWith('000000');
    expect(restoreWalletBackup).not.toHaveBeenCalled();
    expect(useWalletStore.getState().accounts).toEqual(EXISTING_STATE.accounts);
    expect(secureStoreState.get(MNEMONIC_KEY)).toBe('old mnemonic');
    expect(secureStoreState.get(`${PRIVATE_KEY_PREFIX}old-imported`)).toBe('old-private-key');
  });

  it('rolls back staged restore writes when secure storage fails mid-restore', async () => {
    const { useWalletStore, secureStore, secureStoreState } = await loadWalletStore();

    useWalletStore.setState(EXISTING_STATE);
    secureStoreState.set(MNEMONIC_KEY, 'old mnemonic');
    secureStoreState.set(`${PRIVATE_KEY_PREFIX}old-imported`, 'old-private-key');
    secureStoreState.set(LEGACY_PRIVATE_KEY, 'legacy-private-key');

    jest.spyOn(secureStore, 'setItemAsync').mockImplementation(async (...args: unknown[]) => {
      const [key, value] = args as [string, string];
      if (key === `${PRIVATE_KEY_PREFIX}new-imported`) {
        throw new Error('simulated write failure');
      }

      secureStoreState.set(key, value);
    });

    jest.spyOn(secureStore, 'deleteItemAsync').mockImplementation(async (...args: unknown[]) => {
      const [key] = args as [string];
      secureStoreState.delete(key);
    });

    await expect(
      useWalletStore.getState().restoreFromBackup({} as any, 'backup-pin', '123456')
    ).rejects.toThrow('simulated write failure');

    expect(useWalletStore.getState().accounts).toEqual(EXISTING_STATE.accounts);
    expect(useWalletStore.getState().activeAccountId).toBe(EXISTING_STATE.activeAccountId);
    expect(useWalletStore.getState().address).toBe(EXISTING_STATE.address);
    expect(secureStoreState.get(MNEMONIC_KEY)).toBe('old mnemonic');
    expect(secureStoreState.get(`${PRIVATE_KEY_PREFIX}old-imported`)).toBe('old-private-key');
    expect(secureStoreState.get(LEGACY_PRIVATE_KEY)).toBe('legacy-private-key');
    expect(secureStoreState.has(`${PRIVATE_KEY_PREFIX}new-imported`)).toBe(false);
  });

  it('throws an actionable error when the recovery phrase is missing', async () => {
    const { useWalletStore } = await loadWalletStore();

    await expect(useWalletStore.getState().getMnemonic()).rejects.toThrow(
      MISSING_RECOVERY_PHRASE_MESSAGE
    );
  });

  it('throws an actionable error when an HD account private key cannot be derived', async () => {
    const { useWalletStore } = await loadWalletStore();

    useWalletStore.setState(EXISTING_STATE);

    await expect(useWalletStore.getState().getPrivateKey()).rejects.toThrow(
      MISSING_RECOVERY_PHRASE_MESSAGE
    );
  });

  it('uses the actionable recovery phrase error when HD accounts cannot be backed up', async () => {
    const { useWalletStore } = await loadWalletStore();

    useWalletStore.setState(EXISTING_STATE);

    await expect(
      useWalletStore.getState().createBackupSnapshot('123456', TEST_BACKUP_SECRET)
    ).rejects.toThrow(
      MISSING_RECOVERY_PHRASE_MESSAGE
    );
  });

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

  it('rejects backup snapshots when the backup recovery key is missing', async () => {
    const { useWalletStore } = await loadWalletStore();

    useWalletStore.setState(EXISTING_STATE);

    await expect(useWalletStore.getState().createBackupSnapshot('123456')).rejects.toThrow(
      'Backup recovery key is required'
    );
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

  it('records created backup metadata without storing the backup recovery key', async () => {
    const { useWalletStore } = await loadWalletStore();

    useWalletStore.getState().recordBackupCreated({
      id: 'backup-1',
      fileName: 'kondor-wallet-backup-1782000000000.json',
      fileUri: 'file:///documents/backups/kondor-wallet-backup-1782000000000.json',
      provider: 'manual-file',
      createdAt: '2026-06-20T00:00:00.000Z',
      walletFingerprint: 'wallet-hash',
      accountSetHash: 'account-hash',
    });

    expect(useWalletStore.getState().backupRecords).toEqual([
      {
        id: 'backup-1',
        fileName: 'kondor-wallet-backup-1782000000000.json',
        fileUri: 'file:///documents/backups/kondor-wallet-backup-1782000000000.json',
        provider: 'manual-file',
        createdAt: '2026-06-20T00:00:00.000Z',
        walletFingerprint: 'wallet-hash',
        accountSetHash: 'account-hash',
      },
    ]);
    expect(JSON.stringify(useWalletStore.getState().backupRecords)).not.toContain(TEST_BACKUP_SECRET);
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
});
