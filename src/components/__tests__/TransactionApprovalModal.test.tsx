import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { utils } from 'koilib';
import * as protobuf from 'protobufjs/minimal';
import { TransactionApprovalModal } from '../TransactionApprovalModal';
import { KOINDX } from '../../lib/constants';
import { encodeApproveArgs, encodeSwapTokensInArgs } from '../../lib/koindxCodec';
import { useNetworkStore } from '../../stores/networkStore';
import { requireBiometricAuth } from '../../lib/biometrics';

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

let mockWalletState = {
  activeAccountId: 'account-1',
  getActiveAccount: () => ({
    id: 'account-1',
    name: 'Primary',
    address: '12vRwxu2nVG2697dM36KMNkmfecNdU8PpR',
    isImported: false,
  }),
};

const mockProvider = jest.fn();
const mockSignTransaction = jest.fn(async (_tx?: unknown) => undefined);
const mockPrepare = jest.fn(async function (this: any) {
  const header = this.transaction.header ?? {};
  header.nonce = header.nonce ?? '0x01';
  this.transaction.header = header;
});
const mockEstimateSend = jest.fn(async () => ({
  rc_used: '1000',
  reverted: false,
  logs: [],
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => mockWalletState,
}));

jest.mock('../../lib/biometrics', () => ({
  requireBiometricAuth: jest.fn(async () => true),
}));

jest.mock('../../lib/haptics', () => ({
  HapticFeedback: {
    success: jest.fn(),
    error: jest.fn(),
    selection: jest.fn(),
  },
}));

jest.mock('../../lib/logger', () => ({
  txLogger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
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
    utils: jest.requireActual('koilib').utils,
  };
});

function flushEffects() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function encodeTransferArgs(params: {
  from: string;
  to: string;
  value: string;
  memo?: string;
}): string {
  const writer = protobuf.Writer.create();
  writer.uint32(0x0a);
  writer.bytes(utils.decodeBase58(params.from));
  writer.uint32(0x12);
  writer.bytes(utils.decodeBase58(params.to));
  writer.uint32(0x18);
  writer.uint64(params.value);
  if (params.memo) {
    writer.uint32(0x22);
    writer.string(params.memo);
  }
  return utils.encodeBase64url(writer.finish());
}

function getTextContent(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).flatMap((node) => {
    const children = React.Children.toArray(node.props.children);
    return children
      .filter((child): child is string | number => typeof child === 'string' || typeof child === 'number')
      .map(String);
  });
}

function findButton(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === label));
}

const OWNER = '12vRwxu2nVG2697dM36KMNkmfecNdU8PpR';
const RECEIVER = '1LQPQ6rX9r9ZP7s2cb6cQJu1WDVYj1WFv6';

describe('TransactionApprovalModal', () => {
  let activeRenderer: TestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWalletState = {
      activeAccountId: 'account-1',
      getActiveAccount: () => ({
        id: 'account-1',
        name: 'Primary',
        address: OWNER,
        isImported: false,
      }),
    };
    act(() => {
      useNetworkStore.setState({ mode: 'harbinger', hasHydrated: true });
    });
    jest.spyOn(SecureStore, 'getItemAsync').mockResolvedValue('a'.repeat(64));
  });

  afterEach(() => {
    if (activeRenderer) {
      act(() => {
        activeRenderer?.unmount();
      });
      activeRenderer = null;
    }
    jest.restoreAllMocks();
    act(() => {
      useNetworkStore.setState({ mode: 'mainnet', hasHydrated: true });
    });
  });

  it('rejects KoinDX dApp swaps with mobile-native copy before auth', async () => {
    const onReject = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <TransactionApprovalModal
          visible
          request={{
            signerAddress: OWNER,
            transaction: {
              operations: [
                {
                  call_contract: {
                    contract_id: KOINDX.PERIPHERY_CONTRACT,
                    entry_point: KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN,
                    args: encodeSwapTokensInArgs({
                      from: OWNER,
                      receiver: OWNER,
                      amountIn: '100000000',
                      amountOutMin: '50000000',
                      path: ['koin', 'vhp'],
                    }),
                  },
                },
              ],
              header: {},
            },
          }}
          appName="KoinDX"
          appOrigin="https://app.koindx.com"
          isSend={false}
          onApprove={jest.fn()}
          onReject={onReject}
          onClose={jest.fn()}
        />
      );
    });
    activeRenderer = renderer!;
    await flushEffects();

    await act(async () => {
      findButton(renderer!, 'Sign')?.props.onPress();
    });
    await flushEffects();

    expect(onReject).toHaveBeenCalledWith(
      'KoinDX swaps from dApps are not supported on mobile. Use the Swap tab in Kondor Mobile instead.'
    );
    expect(requireBiometricAuth).not.toHaveBeenCalled();
  });

  it('rejects signer address mismatches before auth', async () => {
    const onReject = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <TransactionApprovalModal
          visible
          request={{
            signerAddress: RECEIVER,
            transaction: {
              operations: [],
              header: {},
            },
          }}
          appName="Mismatch dApp"
          appOrigin="https://example.com"
          isSend={false}
          onApprove={jest.fn()}
          onReject={onReject}
          onClose={jest.fn()}
        />
      );
    });
    activeRenderer = renderer!;
    await flushEffects();

    await act(async () => {
      findButton(renderer!, 'Sign')?.props.onPress();
    });
    await flushEffects();

    expect(onReject).toHaveBeenCalledWith('Transaction signer does not match the active wallet account.');
    expect(requireBiometricAuth).not.toHaveBeenCalled();
  });

  it('rejects transaction chain mismatches before auth', async () => {
    const onReject = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <TransactionApprovalModal
          visible
          request={{
            signerAddress: OWNER,
            transaction: {
              operations: [],
              header: {
                chain_id: 'EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==',
              },
            },
          }}
          appName="Wrong Network dApp"
          appOrigin="https://example.com"
          isSend={false}
          onApprove={jest.fn()}
          onReject={onReject}
          onClose={jest.fn()}
        />
      );
    });
    activeRenderer = renderer!;
    await flushEffects();

    await act(async () => {
      findButton(renderer!, 'Sign')?.props.onPress();
    });
    await flushEffects();

    expect(onReject).toHaveBeenCalledWith(
      'Transaction network does not match the active wallet network.'
    );
    expect(requireBiometricAuth).not.toHaveBeenCalled();
  });

  it('renders decoded operation rows, origin notice, and active network label', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <TransactionApprovalModal
          visible
          request={{
            signerAddress: OWNER,
            transaction: {
              operations: [
                {
                  call_contract: {
                    contract_id: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
                    entry_point: 0x27f576ca,
                    args: encodeTransferArgs({
                      from: OWNER,
                      to: RECEIVER,
                      value: '123456789',
                      memo: 'Invoice 42',
                    }),
                  },
                },
                {
                  call_contract: {
                    contract_id: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
                    entry_point: KOINDX.ENTRY_POINTS.TOKEN_APPROVE,
                    args: encodeApproveArgs(OWNER, KOINDX.PERIPHERY_CONTRACT, '100000000'),
                  },
                },
              ],
              header: {},
            },
          }}
          appName="Fogata"
          appOrigin="https://fogata.io"
          isSend={false}
          onApprove={jest.fn()}
          onReject={jest.fn()}
          onClose={jest.fn()}
        />
      );
    });
    activeRenderer = renderer!;
    await flushEffects();

    const textContent = getTextContent(renderer!);

    expect(textContent).toContain('Transfer KOIN');
    expect(textContent).toContain('Approve KOIN spend');
    expect(textContent).toContain('1.23456789 KOIN');
    expect(textContent).toContain('Invoice 42');
    expect(textContent).toContain('Harbinger (testnet)');
    expect(textContent).toContain('Review the site origin and network before approving this transaction.');
  });

  it('renders unknown operation contract ids and entry points', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <TransactionApprovalModal
          visible
          request={{
            signerAddress: OWNER,
            transaction: {
              operations: [
                {
                  call_contract: {
                    contract_id: '1UnknownContract',
                    entry_point: 123,
                    args: 'opaque',
                  },
                },
              ],
              header: {},
            },
          }}
          appName="Unknown dApp"
          appOrigin="https://unknown.example.com"
          isSend={false}
          onApprove={jest.fn()}
          onReject={jest.fn()}
          onClose={jest.fn()}
        />
      );
    });
    activeRenderer = renderer!;
    await flushEffects();

    const textContent = getTextContent(renderer!);

    expect(textContent).toContain('Contract Call (Entry: 0x7b)');
    expect(textContent).toContain('1UnknownContract');
    expect(textContent).toContain('0x7b');
  });

  it('uses the active network provider and free mana sharer when signing', async () => {
    const onApprove = jest.fn();

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <TransactionApprovalModal
          visible
          request={{
            signerAddress: OWNER,
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
    activeRenderer = renderer!;
    await flushEffects();

    await act(async () => {
      findButton(renderer!, 'Sign')?.props.onPress();
    });
    await flushEffects();

    expect(mockProvider).toHaveBeenCalledWith([
      'https://harbinger-api.koinos.io',
      'https://testnet.koinosblocks.com',
    ]);
    expect(mockSignTransaction).toHaveBeenCalled();
    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: expect.objectContaining({
          header: expect.objectContaining({
            payer: '17mzHQmfp3qNWQpvJLvNgFXqoW4HoS7Xbj',
            payee: OWNER,
            chain_id: 'EiBncD4pKRIQWco_WRqo5Q-xnXR7JuO3PtZv983mKdKHSQ==',
          }),
        }),
      })
    );
  });

  it('does not mutate the original request transaction after a successful approve', async () => {
    const onApprove = jest.fn();
    const request = {
      signerAddress: OWNER,
      transaction: {
        operations: [],
        header: {},
      },
    };

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <TransactionApprovalModal
          visible
          request={request}
          appName="Test dApp"
          appOrigin="https://example.com"
          isSend={false}
          onApprove={onApprove}
          onReject={jest.fn()}
          onClose={jest.fn()}
        />
      );
    });
    activeRenderer = renderer!;
    await flushEffects();

    await act(async () => {
      findButton(renderer!, 'Sign')?.props.onPress();
    });
    await flushEffects();

    expect(onApprove).toHaveBeenCalled();
    expect(request.transaction).toEqual({
      operations: [],
      header: {},
    });
  });

  it('does not mutate the original request transaction when dry-run estimation fails', async () => {
    const onApprove = jest.fn();
    const onReject = jest.fn();
    const request = {
      signerAddress: OWNER,
      transaction: {
        operations: [],
        header: {},
      },
    };

    mockEstimateSend.mockRejectedValueOnce(new Error('Dry-run exploded'));

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <TransactionApprovalModal
          visible
          request={request}
          appName="Test dApp"
          appOrigin="https://example.com"
          isSend={false}
          onApprove={onApprove}
          onReject={onReject}
          onClose={jest.fn()}
        />
      );
    });
    activeRenderer = renderer!;
    await flushEffects();

    await act(async () => {
      findButton(renderer!, 'Sign')?.props.onPress();
    });
    await flushEffects();

    expect(onApprove).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    expect(request.transaction).toEqual({
      operations: [],
      header: {},
    });
    expect(getTextContent(renderer!)).toContain(
      'Transaction simulation failed: Dry-run exploded'
    );
  });
});
