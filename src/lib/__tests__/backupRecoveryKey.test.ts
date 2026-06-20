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
