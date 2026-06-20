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

  it('keeps stale compact copy actionable', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <BackupStatusNotice
          backupHealth={{
            ...baseHealth,
            status: 'stale',
            provider: 'manual-file',
          }}
          compact
          onPress={jest.fn()}
        />
      );
    });

    const rendered = text(renderer!);
    expect(rendered).toContain('Backup stale');
    expect(rendered).toContain('Create a fresh encrypted backup before sending.');
  });

  it('keeps full stale copy explanatory', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <BackupStatusNotice
          backupHealth={{
            ...baseHealth,
            status: 'stale',
            provider: 'manual-file',
          }}
          onPress={jest.fn()}
        />
      );
    });

    const rendered = text(renderer!);
    expect(rendered).toContain('Backup stale');
    expect(rendered).toContain('Your wallet changed after the last backup. Create a fresh encrypted backup.');
  });

  it('keeps failed compact copy actionable', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <BackupStatusNotice
          backupHealth={{
            ...baseHealth,
            status: 'failed',
            provider: 'manual-file',
            failureReason: 'verification failed',
          }}
          compact
          onPress={jest.fn()}
        />
      );
    });

    const rendered = text(renderer!);
    expect(rendered).toContain('Backup failed');
    expect(rendered).toContain('Create a verified backup before relying on it.');
  });

  it('keeps full failed copy explanatory', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <BackupStatusNotice
          backupHealth={{
            ...baseHealth,
            status: 'failed',
            provider: 'manual-file',
            failureReason: 'verification failed',
          }}
          onPress={jest.fn()}
        />
      );
    });

    const rendered = text(renderer!);
    expect(rendered).toContain('Backup failed');
    expect(rendered).toContain('The last backup did not verify. Create a verified encrypted backup before relying on it.');
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
