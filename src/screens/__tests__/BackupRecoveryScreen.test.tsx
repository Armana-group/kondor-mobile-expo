import React from 'react';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

const mockGoBack = jest.fn();
const mockCreateBackupSnapshot = jest.fn();
const mockRestoreFromBackup = jest.fn();
const mockMarkBackupVerified = jest.fn();
const mockGenerateBackupRecoveryKey = jest.fn(async () => 'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A');
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
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../lib/backupRecoveryKey', () => ({
  generateBackupRecoveryKey: () => mockGenerateBackupRecoveryKey(),
  normalizeBackupRecoveryKey: (value: string) => value.toUpperCase().replace(/\s+/g, '-'),
  isValidBackupRecoveryKey: (value: string) => value.includes('ABCD-EFGH'),
}));

jest.mock('../../lib/walletBackup', () => ({
  createWalletBackup: (snapshot: unknown, backupSecret: unknown) => mockCreateWalletBackup(snapshot, backupSecret),
  verifyWalletBackup: jest.fn(async () => true),
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => ({
    createBackupSnapshot: mockCreateBackupSnapshot,
    restoreFromBackup: mockRestoreFromBackup,
    markBackupVerified: mockMarkBackupVerified,
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
  readAsStringAsync: jest.fn(async () => '{}'),
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

function findButton(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const node = renderer.root
    .findAllByType(TouchableOpacity)
    .find((candidate) => candidate.findAllByType(Text).some((textNode) => textNode.props.children === label));
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

describe('BackupRecoveryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateBackupSnapshot.mockResolvedValue({
      activeAccountId: 'acc-1',
      nextDerivationIndex: 1,
      accounts: [],
    });
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  it('requires generated recovery key confirmation before creating a backup', async () => {
    const { BackupRecoveryScreen } = require('../BackupRecoveryScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BackupRecoveryScreen />);
    });

    await act(async () => {
      findButton(renderer!, 'Generate Recovery Key').props.onPress();
    });

    await act(async () => {
      findInputByLabel(renderer!, 'Current wallet PIN').props.onChangeText('123456');
    });

    await act(async () => {
      findButton(renderer!, 'Create Manual Backup').props.onPress();
    });

    expect(mockCreateBackupSnapshot).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Recovery Key Required',
      'Confirm the generated backup recovery key before creating this backup.'
    );
  });

  it('creates a manual backup with current PIN plus backup recovery key', async () => {
    const { BackupRecoveryScreen } = require('../BackupRecoveryScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BackupRecoveryScreen />);
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
      findButton(renderer!, 'Create Manual Backup').props.onPress();
    });

    expect(mockCreateBackupSnapshot).toHaveBeenCalledWith(
      '123456',
      'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A'
    );
    expect(mockCreateWalletBackup).toHaveBeenCalledWith(
      expect.any(Object),
      'ABCD-EFGH-IJKM-NPQR-STVW-XYZ2-3456-789A'
    );
    expect(mockMarkBackupVerified).toHaveBeenCalledWith({
      provider: 'manual-file',
      verifiedAt: expect.any(String),
      walletFingerprint: 'wallet-hash',
      accountSetHash: 'account-hash',
    });
  });
});
