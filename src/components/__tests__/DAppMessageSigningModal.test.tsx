import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: (selector: (state: { accounts: Array<{ address: string; name: string }> }) => unknown) =>
    selector({
      accounts: [
        {
          address: '1SignerAddress',
          name: 'Primary',
        },
      ],
    }),
}));

jest.mock('../../stores/networkStore', () => ({
  getActiveNetworkConfig: () => ({
    rpcNodes: ['https://rpc.koinos.test'],
  }),
}));

jest.mock('../../lib/dapp/originSecurity', () => ({
  inspectDAppOrigin: jest.fn(() => ({
    level: 'trusted',
    siteName: 'Example',
    displayOrigin: 'example.com',
    signals: [{ detail: 'Trusted origin' }],
  })),
}));

jest.mock('../../lib/haptics', () => ({
  HapticFeedback: {
    selection: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

function getTextContent(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : getTextContent(child)))
    .join('');
}

describe('DAppMessageSigningModal preview', () => {
  it('shows plain text strings directly and hex-like strings as signed bytes', async () => {
    const { DAppMessageSigningModal } = require('../DAppMessageSigningModal');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DAppMessageSigningModal
          visible
          request={{
            signerAddress: '1SignerAddress',
            kind: 'message',
            message: '0102ff',
          }}
          appName="Signer dApp"
          appOrigin="https://sign.example.com"
          onApprove={jest.fn()}
          onReject={jest.fn()}
        />
      );
    });

    const textValues = renderer!.root.findAllByType(Text).map(getTextContent);
    expect(textValues).toContain('AQL_');
    expect(textValues).not.toContain('0102ff');

    await act(async () => {
      renderer!.update(
        <DAppMessageSigningModal
          visible
          request={{
            signerAddress: '1SignerAddress',
            kind: 'message',
            message: 'hello world',
          }}
          appName="Signer dApp"
          appOrigin="https://sign.example.com"
          onApprove={jest.fn()}
          onReject={jest.fn()}
        />
      );
    });

    const updatedTextValues = renderer!.root.findAllByType(Text).map(getTextContent);
    expect(updatedTextValues).toContain('hello world');
  });
});
