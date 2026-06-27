import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BackupHealth } from '../../lib/backupHealth';
import {
  getBackupNoticeDismissalKey,
  useBackupNoticeDismissalStore,
} from '../backupNoticeDismissalStore';

const baseHealth: BackupHealth = {
  status: 'none',
  provider: null,
  lastCreatedAt: null,
  lastVerifiedAt: null,
  walletFingerprint: null,
  accountSetHash: null,
  failureReason: null,
};

describe('backupNoticeDismissalStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useBackupNoticeDismissalStore.getState().clearDismissals();
    jest.clearAllMocks();
  });

  it('returns no dismissal key for verified backups', () => {
    expect(getBackupNoticeDismissalKey({
      ...baseHealth,
      status: 'verified',
      provider: 'manual-file',
    })).toBeNull();
  });

  it('keys dismissals by backup health identity', () => {
    const staleKey = getBackupNoticeDismissalKey({
      ...baseHealth,
      status: 'stale',
      provider: 'manual-file',
      walletFingerprint: 'wallet-1',
      accountSetHash: 'accounts-1',
      failureReason: 'Account set changed',
    });
    const failedKey = getBackupNoticeDismissalKey({
      ...baseHealth,
      status: 'failed',
      provider: 'manual-file',
      walletFingerprint: 'wallet-1',
      accountSetHash: 'accounts-1',
      failureReason: 'Backup verification failed',
    });

    expect(staleKey).toContain('stale');
    expect(staleKey).toContain('wallet-1');
    expect(staleKey).toContain('accounts-1');
    expect(staleKey).not.toBe(failedKey);
  });

  it('persists dismissed notice keys', async () => {
    const key = getBackupNoticeDismissalKey(baseHealth);
    expect(key).toEqual(expect.any(String));

    useBackupNoticeDismissalStore.getState().dismissNotice(key);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const persisted = await AsyncStorage.getItem('kondor-backup-notice-dismissals');

    expect(useBackupNoticeDismissalStore.getState().isDismissed(key)).toBe(true);
    expect(persisted).toContain(key);
  });
});
