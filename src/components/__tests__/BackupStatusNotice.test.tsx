import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { BackupStatusNotice } from '../BackupStatusNotice';
import type { BackupHealth } from '../../lib/backupHealth';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const baseHealth: BackupHealth = {
  status: 'none',
  provider: null,
  lastCreatedAt: null,
  lastVerifiedAt: null,
  walletFingerprint: null,
  accountSetHash: null,
  failureReason: null,
};

function text(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .flat()
    .filter(Boolean)
    .join(' ');
}

describe('BackupStatusNotice', () => {
  it('renders nothing when backup is verified', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <BackupStatusNotice
          backupHealth={{ ...baseHealth, status: 'verified', provider: 'manual-file' }}
          onPress={jest.fn()}
        />
      );
    });

    expect(renderer!.root.findAllByType(Text)).toHaveLength(0);
  });

  it('renders action copy for missing backup', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <BackupStatusNotice backupHealth={baseHealth} onPress={jest.fn()} />
      );
    });

    expect(text(renderer!)).toContain('Back up this wallet');
    expect(text(renderer!)).toContain('Create a verified encrypted backup before relying on this wallet.');
  });

  it('fires onPress from the notice', async () => {
    const onPress = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <BackupStatusNotice backupHealth={baseHealth} onPress={onPress} />
      );
    });

    await act(async () => {
      renderer!.root.findByType(TouchableOpacity).props.onPress();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
