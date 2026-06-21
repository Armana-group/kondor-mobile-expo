import React from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const mockCreateBackupSnapshot = jest.fn();
const mockRestoreFromBackup = jest.fn();
const mockMarkBackupVerified = jest.fn();
const mockRecordBackupCreated = jest.fn();
const mockCopyWithAutoClear = jest.fn(async (_value: string) => undefined);
const mockGenerateBackupRecoveryKey = jest.fn(async () => 'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A');
const mockVerifyWalletBackup = jest.fn<Promise<boolean>, [unknown, string]>(async () => true);
const mockGetDocumentAsync = jest.fn<
  Promise<{ canceled: boolean; assets: Array<{ uri: string; name: string }> }>,
  []
>(async () => ({ canceled: true, assets: [] }));
const mockReadAsStringAsync = jest.fn<Promise<string>, [string, unknown]>(async () => '{}');
const mockNormalizeBackupRecoveryKey = (value: string) => {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.match(/.{1,4}/g)?.join('-') ?? '';
};
const mockCreateWalletBackup = jest.fn<Promise<{
  kind: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  appVersion: string;
  walletFingerprint: string;
  accountSetHash: string;
  encryption: {
    algorithm: string;
    digest: string;
    keyLength: number;
    iterations: number;
  };
  wallet: { accounts: unknown[] };
  checksum: string;
}>, [unknown, unknown]>(async () => ({
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
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: () => mockGetDocumentAsync(),
}));

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../lib/backupRecoveryKey', () => ({
  generateBackupRecoveryKey: () => mockGenerateBackupRecoveryKey(),
  normalizeBackupRecoveryKey: (value: string) => mockNormalizeBackupRecoveryKey(value),
  isValidBackupRecoveryKey: (value: string) =>
    mockNormalizeBackupRecoveryKey(value) === 'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A',
}));

jest.mock('../../lib/walletBackup', () => ({
  createWalletBackup: (snapshot: unknown, backupSecret: unknown) => mockCreateWalletBackup(snapshot, backupSecret),
  verifyWalletBackup: (backup: unknown, backupSecret: string) => mockVerifyWalletBackup(backup, backupSecret),
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => ({
    createBackupSnapshot: mockCreateBackupSnapshot,
    restoreFromBackup: mockRestoreFromBackup,
    markBackupVerified: mockMarkBackupVerified,
    recordBackupCreated: mockRecordBackupCreated,
    backupRecords: [],
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
  readAsStringAsync: (uri: string, options: unknown) => mockReadAsStringAsync(uri, options),
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

jest.mock('../../lib/logger', () => ({
  sanitizeErrorForUser: (_error: unknown, fallback: string) => fallback,
}));

jest.mock('../../lib/clipboard', () => ({
  copyWithAutoClear: (value: string) => mockCopyWithAutoClear(value),
}));

function findButton(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const node = renderer.root.findAll((candidate) =>
    typeof candidate.props.onPress === 'function' &&
    candidate.findAllByType(Text).some((textNode) => textNode.props.children === label)
  )[0];
  if (!node) {
    throw new Error(`Button not found: ${label}`);
  }
  return node;
}

function findInputByLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const labelNode = renderer.root.findAllByType(Text).find((candidate) => candidate.props.children === label);
  const container = labelNode?.parent?.parent;
  const input = container?.findAllByType(TextInput)[0];
  if (!input) {
    throw new Error(`Input not found: ${label}`);
  }
  return input;
}

function findInputContainerByLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const labelNode = renderer.root.findAllByType(Text).find((candidate) => candidate.props.children === label);
  const container = labelNode?.parent;
  if (!container) {
    throw new Error(`Input container not found: ${label}`);
  }
  return container;
}

describe('BackupRecoveryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateBackupSnapshot.mockResolvedValue({
      activeAccountId: 'acc-1',
      nextDerivationIndex: 1,
      accounts: [],
    });
    mockVerifyWalletBackup.mockResolvedValue(true);
    mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: [] });
    mockReadAsStringAsync.mockResolvedValue('{}');
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  it('explains recovery requirements and opens the dedicated create backup screen', async () => {
    const { BackupRecoveryScreen } = require('../BackupRecoveryScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BackupRecoveryScreen />);
    });

    const renderedText = renderer!.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .join(' ');

    expect(renderedText).toContain('To recover this wallet later, you need the encrypted backup file and its backup recovery key.');

    await act(async () => {
      findButton(renderer!, 'Create new backup').props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('CreateBackup');
  });

  it('keeps restore inputs visually separated from each other and the action buttons', async () => {
    const { BackupRecoveryScreen } = require('../BackupRecoveryScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BackupRecoveryScreen />);
    });

    const backupSecretContainer = findInputContainerByLabel(
      renderer!,
      'Backup recovery key or legacy backup PIN'
    );
    const currentPinContainer = findInputContainerByLabel(renderer!, 'Current Wallet PIN');

    expect(StyleSheet.flatten(backupSecretContainer.props.style).marginBottom).toBeGreaterThanOrEqual(16);
    expect(StyleSheet.flatten(currentPinContainer.props.style).marginBottom).toBeGreaterThanOrEqual(18);
  });

  it('keeps create backup inputs visually separated from the final action', async () => {
    const { CreateBackupScreen } = require('../CreateBackupScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<CreateBackupScreen />);
    });

    const recoveryKeyContainer = findInputContainerByLabel(renderer!, 'Confirm backup recovery key');
    const currentPinContainer = findInputContainerByLabel(renderer!, 'Current wallet PIN');

    expect(StyleSheet.flatten(recoveryKeyContainer.props.style).marginBottom).toBeGreaterThanOrEqual(16);
    expect(StyleSheet.flatten(currentPinContainer.props.style).marginBottom).toBeGreaterThanOrEqual(18);
  });

  it('requires generated recovery key confirmation before creating a backup', async () => {
    const { CreateBackupScreen } = require('../CreateBackupScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<CreateBackupScreen />);
    });

    await act(async () => {
      findButton(renderer!, 'Generate Recovery Key').props.onPress();
    });

    await act(async () => {
      findInputByLabel(renderer!, 'Current wallet PIN').props.onChangeText('123456');
    });

    await act(async () => {
      findButton(renderer!, 'Create encrypted backup').props.onPress();
    });

    expect(mockCreateBackupSnapshot).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Recovery Key Required',
      'Confirm the generated backup recovery key before creating this backup.'
    );
  });

  it('creates a manual backup with current PIN plus backup recovery key', async () => {
    const { CreateBackupScreen } = require('../CreateBackupScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<CreateBackupScreen />);
    });

    await act(async () => {
      findButton(renderer!, 'Generate Recovery Key').props.onPress();
    });

    await act(async () => {
      findInputByLabel(renderer!, 'Current wallet PIN').props.onChangeText('123456');
      findInputByLabel(renderer!, 'Confirm backup recovery key')
        .props.onChangeText('ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A');
    });

    await act(async () => {
      findButton(renderer!, 'Create encrypted backup').props.onPress();
    });

    expect(mockCreateBackupSnapshot).toHaveBeenCalledWith(
      '123456',
      'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A'
    );
    expect(mockCreateWalletBackup).toHaveBeenCalledWith(
      expect.any(Object),
      'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A'
    );
    expect(mockRecordBackupCreated).toHaveBeenCalledWith({
      id: expect.any(String),
      fileName: expect.stringMatching(/^kondor-wallet-backup-\d+\.json$/),
      fileUri: expect.stringMatching(/^file:\/\/\/documents\/backups\/kondor-wallet-backup-\d+\.json$/),
      provider: 'manual-file',
      createdAt: expect.any(String),
      walletFingerprint: 'wallet-hash',
      accountSetHash: 'account-hash',
    });
  });

  it('copies the generated backup recovery key so the user can save it', async () => {
    const { CreateBackupScreen } = require('../CreateBackupScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<CreateBackupScreen />);
    });

    await act(async () => {
      findButton(renderer!, 'Generate Recovery Key').props.onPress();
    });

    await act(async () => {
      findButton(renderer!, 'Copy Recovery Key').props.onPress();
    });

    expect(mockCopyWithAutoClear).toHaveBeenCalledWith(
      'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A'
    );
    expect(alertSpy).toHaveBeenCalledWith(
      'Recovery Key Copied',
      'Backup recovery key copied to clipboard. It will be cleared in 30 seconds.'
    );
  });

  it('normalizes recovery key input before verifying and restoring a v2 backup', async () => {
    const backup = {
      kind: 'kondor-wallet-backup',
      version: 2,
      walletFingerprint: 'wallet-hash',
      accountSetHash: 'account-hash',
    };
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/backup.json', name: 'backup.json' }],
    });
    mockReadAsStringAsync.mockResolvedValue(JSON.stringify(backup));

    const { BackupRecoveryScreen } = require('../BackupRecoveryScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BackupRecoveryScreen />);
    });

    await act(async () => {
      findButton(renderer!, 'Import Backup File').props.onPress();
    });

    await act(async () => {
      findInputByLabel(renderer!, 'Backup recovery key or legacy backup PIN')
        .props.onChangeText('abcd efgh ijkm npqr stvw xyz2 3456 789a');
    });

    await act(async () => {
      findButton(renderer!, 'Verify Backup').props.onPress();
    });

    expect(mockVerifyWalletBackup).toHaveBeenCalledWith(
      backup,
      'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A'
    );

    await act(async () => {
      findInputByLabel(renderer!, 'Current Wallet PIN').props.onChangeText('123456');
    });

    await act(async () => {
      findButton(renderer!, 'Restore Backup').props.onPress();
    });

    const restoreAlert = alertSpy.mock.calls.find((call) => call[0] === 'Restore Wallet Backup');
    const restoreButton = restoreAlert?.[2]?.find((button: { text?: string }) => button.text === 'Restore');
    await act(async () => {
      await restoreButton?.onPress?.();
    });

    expect(mockRestoreFromBackup).toHaveBeenCalledWith(
      backup,
      'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A',
      '123456'
    );
  });

  it('passes legacy backup PIN input through unchanged for v1 backups', async () => {
    const backup = {
      kind: 'kondor-wallet-backup',
      version: 1,
    };
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/legacy-backup.json', name: 'legacy-backup.json' }],
    });
    mockReadAsStringAsync.mockResolvedValue(JSON.stringify(backup));

    const { BackupRecoveryScreen } = require('../BackupRecoveryScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BackupRecoveryScreen />);
    });

    await act(async () => {
      findButton(renderer!, 'Import Backup File').props.onPress();
    });

    await act(async () => {
      findInputByLabel(renderer!, 'Backup recovery key or legacy backup PIN')
        .props.onChangeText('123456');
    });

    await act(async () => {
      findButton(renderer!, 'Verify Backup').props.onPress();
    });

    expect(mockVerifyWalletBackup).toHaveBeenCalledWith(backup, '123456');
  });

  it('shows an actionable production error when the current PIN cannot create a backup', async () => {
    mockCreateBackupSnapshot.mockRejectedValueOnce(new Error('Incorrect PIN'));

    const { CreateBackupScreen } = require('../CreateBackupScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<CreateBackupScreen />);
    });

    await act(async () => {
      findButton(renderer!, 'Generate Recovery Key').props.onPress();
    });

    await act(async () => {
      findInputByLabel(renderer!, 'Current wallet PIN').props.onChangeText('000000');
      findInputByLabel(renderer!, 'Confirm backup recovery key')
        .props.onChangeText('ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A');
    });

    await act(async () => {
      findButton(renderer!, 'Create encrypted backup').props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith('Backup Failed', 'Current PIN is incorrect.');
  });

  it('shows an actionable production error when an imported backup file is invalid', async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/backup.json', name: 'backup.json' }],
    });
    mockReadAsStringAsync.mockResolvedValue('{not json');

    const { BackupRecoveryScreen } = require('../BackupRecoveryScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BackupRecoveryScreen />);
    });

    await act(async () => {
      findButton(renderer!, 'Import Backup File').props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Import Failed',
      'Select a valid Kondor backup file and try again.'
    );
  });

  it('shows an actionable production error when backup verification fails', async () => {
    const backup = {
      kind: 'kondor-wallet-backup',
      version: 2,
      walletFingerprint: 'wallet-hash',
      accountSetHash: 'account-hash',
    };
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/backup.json', name: 'backup.json' }],
    });
    mockReadAsStringAsync.mockResolvedValue(JSON.stringify(backup));
    mockVerifyWalletBackup.mockResolvedValueOnce(false);

    const { BackupRecoveryScreen } = require('../BackupRecoveryScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BackupRecoveryScreen />);
    });

    await act(async () => {
      findButton(renderer!, 'Import Backup File').props.onPress();
    });

    await act(async () => {
      findInputByLabel(renderer!, 'Backup recovery key or legacy backup PIN')
        .props.onChangeText('ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A');
    });

    await act(async () => {
      findButton(renderer!, 'Verify Backup').props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Verification Failed',
      'Check the backup recovery key or legacy backup PIN and backup file, then try again.'
    );
  });

  it('shows an actionable production error when restore authorization fails', async () => {
    const backup = {
      kind: 'kondor-wallet-backup',
      version: 2,
      walletFingerprint: 'wallet-hash',
      accountSetHash: 'account-hash',
    };
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/backup.json', name: 'backup.json' }],
    });
    mockReadAsStringAsync.mockResolvedValue(JSON.stringify(backup));
    mockRestoreFromBackup.mockRejectedValueOnce(new Error('Current PIN is incorrect'));

    const { BackupRecoveryScreen } = require('../BackupRecoveryScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BackupRecoveryScreen />);
    });

    await act(async () => {
      findButton(renderer!, 'Import Backup File').props.onPress();
    });

    await act(async () => {
      findInputByLabel(renderer!, 'Backup recovery key or legacy backup PIN')
        .props.onChangeText('ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A');
    });

    await act(async () => {
      findButton(renderer!, 'Verify Backup').props.onPress();
    });

    await act(async () => {
      findInputByLabel(renderer!, 'Current Wallet PIN').props.onChangeText('000000');
    });

    await act(async () => {
      findButton(renderer!, 'Restore Backup').props.onPress();
    });

    const restoreAlert = alertSpy.mock.calls.find((call) => call[0] === 'Restore Wallet Backup');
    const restoreButton = restoreAlert?.[2]?.find((button: { text?: string }) => button.text === 'Restore');
    await act(async () => {
      await restoreButton?.onPress?.();
    });

    expect(alertSpy).toHaveBeenCalledWith('Restore Failed', 'Current PIN is incorrect.');
  });
});
