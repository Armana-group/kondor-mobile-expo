import * as Crypto from 'expo-crypto';
import {
  BACKUP_RECOVERY_KEY_GROUP_COUNT,
  BACKUP_RECOVERY_KEY_GROUP_LENGTH,
  generateBackupRecoveryKey,
  isValidBackupRecoveryKey,
  normalizeBackupRecoveryKey,
} from '../backupRecoveryKey';

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(),
}));

const mockGetRandomBytesAsync = Crypto.getRandomBytesAsync as jest.MockedFunction<
  typeof Crypto.getRandomBytesAsync
>;

describe('backupRecoveryKey', () => {
  beforeEach(() => {
    mockGetRandomBytesAsync.mockReset();
    mockGetRandomBytesAsync.mockResolvedValue(
      Uint8Array.from(Array.from({ length: 32 }, (_, index) => index % 30))
    );
  });

  it('generates a grouped high-entropy recovery key', async () => {
    const key = await generateBackupRecoveryKey();

    expect(key.split('-')).toHaveLength(BACKUP_RECOVERY_KEY_GROUP_COUNT);
    expect(key.replaceAll('-', '')).toHaveLength(
      BACKUP_RECOVERY_KEY_GROUP_COUNT * BACKUP_RECOVERY_KEY_GROUP_LENGTH
    );
    expect(isValidBackupRecoveryKey(key)).toBe(true);
  });

  it('rejects random bytes that would bias the recovery key alphabet', async () => {
    mockGetRandomBytesAsync
      .mockResolvedValueOnce(
        Uint8Array.from([
          ...Array.from({ length: 31 }, (_, index) => index % 30),
          240,
        ])
      )
      .mockResolvedValueOnce(Uint8Array.from([1]));

    const key = await generateBackupRecoveryKey();

    expect(key.replaceAll('-', '')).toHaveLength(
      BACKUP_RECOVERY_KEY_GROUP_COUNT * BACKUP_RECOVERY_KEY_GROUP_LENGTH
    );
    expect(mockGetRandomBytesAsync).toHaveBeenNthCalledWith(1, 32);
    expect(mockGetRandomBytesAsync).toHaveBeenNthCalledWith(2, 1);
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
