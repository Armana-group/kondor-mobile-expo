import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { TESTNET } from '../../lib/constants';
import { useNetworkStore } from '../../stores/networkStore';

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockProvider = jest.fn();
const mockSignTransaction: jest.MockedFunction<(tx: unknown) => Promise<void>> = jest.fn(
  async (_tx: unknown) => undefined
);
const mockPrepare = jest.fn(async function (this: any) {
  this.transaction.header = {
    ...(this.transaction.header ?? {}),
    nonce: this.transaction.header?.nonce ?? '0x01',
  };
});
const mockEstimateSend = jest.fn(async () => ({
  rc_used: '1000',
  reverted: false,
  logs: [],
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => ({
    activeAccountId: 'account-1',
    getActiveAccount: () => ({
      id: 'account-1',
      name: 'Primary',
      isImported: false,
    }),
  }),
}));

jest.mock('../../lib/biometrics', () => ({
  requireBiometricAuth: jest.fn(async () => true),
}));

jest.mock('../../lib/transactionDecoder', () => ({
  decodeKnownOperation: jest.fn(() => ({
    type: 'contract_call',
    title: 'Contract call',
    contractId: '1Contract',
    details: [],
  })),
  hasKoinDxSwapOperation: jest.fn(() => false),
}));

jest.mock('koilib', () => {
  class Provider {
    rpcNodes: string[];
    constructor(rpcNodes: string[]) {
      this.rpcNodes = rpcNodes;
      mockProvider(rpcNodes);
    }
  }

  class Signer {
    provider: Provider;
    privateKey: string;
    constructor({ privateKey, provider }: { privateKey: string; provider: Provider }) {
      this.privateKey = privateKey;
      this.provider = provider;
    }
    static fromWif(privateKey: string) {
      return new Signer({ privateKey, provider: undefined as unknown as Provider });
    }
    async signTransaction(tx: unknown) {
      return mockSignTransaction(tx);
    }
  }

  class Transaction {
    transaction: any = {};
    constructor(_options: unknown) {}
    async prepare() {
      return mockPrepare.call(this);
    }
    async send() {
      return mockEstimateSend();
    }
  }

  return {
    Provider,
    Signer,
    Transaction,
  };
});

function flushEffects() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('TransactionApprovalModal network wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useNetworkStore.setState({ mode: 'harbinger', hasHydrated: true });
    jest.spyOn(SecureStore, 'getItemAsync').mockResolvedValue('a'.repeat(64));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    useNetworkStore.setState({ mode: 'mainnet', hasHydrated: true });
  });

  it('uses the active network provider and free mana sharer when signing', async () => {
    const onApprove = jest.fn();
    const { TransactionApprovalModal } = require('../TransactionApprovalModal');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <TransactionApprovalModal
          visible
          request={{
            signerAddress: '1SignerAddress',
            transaction: {
              operations: [],
              header: {},
            },
          }}
          appName="Test dApp"
          appOrigin="https://example.com"
          isSend={false}
          onApprove={onApprove}
          onReject={jest.fn()}
          onClose={jest.fn()}
        />
      );
    });
    await flushEffects();

    const signButton = renderer!.root
      .findAllByType(TouchableOpacity)
      .find((node: TestRenderer.ReactTestInstance) =>
        node.findAllByType(Text).some((textNode: TestRenderer.ReactTestInstance) => (
          textNode.props.children === 'Sign'
        ))
      );

    expect(signButton).toBeDefined();

    await act(async () => {
      signButton!.props.onPress();
    });
    await flushEffects();

    expect(mockProvider).toHaveBeenCalledWith(TESTNET.rpcNodes);
    expect(mockSignTransaction).toHaveBeenCalled();
    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: expect.objectContaining({
          header: expect.objectContaining({
            payer: TESTNET.freeManaSharer,
            payee: '1SignerAddress',
            chain_id: TESTNET.chainId,
          }),
        }),
      })
    );
  });
});
