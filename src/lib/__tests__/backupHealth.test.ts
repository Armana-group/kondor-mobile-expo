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
