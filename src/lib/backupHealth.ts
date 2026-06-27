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

export type BackupRecord = {
  id: string;
  fileName: string;
  fileUri: string;
  provider: BackupProvider;
  createdAt: string;
  walletFingerprint: string;
  accountSetHash: string;
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
