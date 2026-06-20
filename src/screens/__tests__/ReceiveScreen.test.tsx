import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

const mockNavigate = jest.fn();
const mockAddress = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: undefined }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-native-qrcode-svg', () => 'QRCode');

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => ({
    address: mockAddress,
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

function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .flat()
    .filter(Boolean)
    .join(' ');
}

describe('ReceiveScreen backup warning', () => {
  it('shows backup warning before displaying a receive address', async () => {
    const { ReceiveScreen } = require('../ReceiveScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<ReceiveScreen />);
    });

    expect(renderedText(renderer!)).toContain('Back up this wallet');
  });
});
