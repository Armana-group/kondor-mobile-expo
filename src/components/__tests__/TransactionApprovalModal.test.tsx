import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { utils } from 'koilib';
import * as protobuf from 'protobufjs/minimal';
import { TransactionApprovalModal } from '../TransactionApprovalModal';
import { KOINDX, MAINNET } from '../../lib/constants';
import { encodeApproveArgs, encodeSwapTokensInArgs } from '../../lib/koindxCodec';
import { useNetworkStore } from '../../stores/networkStore';
import { requireBiometricAuth } from '../../lib/biometrics';
import { submitTransactionOnce } from '../../lib/transactionBroadcast';
import { readPayerCapacity } from '../../lib/mana';

jest.mock('../../lib/transactionBroadcast', () => ({
  ...jest.requireActual('../../lib/transactionBroadcast'),
  submitTransactionOnce: jest.fn(),
}));

jest.mock('../../lib/mana', () => ({
  ...jest.requireActual('../../lib/mana'),
  readPayerCapacity: jest.fn(async () => '3000000000'),
}));

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

let mockWalletState = {
  activeAccountId: 'account-1',
  accounts: [
    {
      id: 'account-1',
      name: 'Primary',
      address: '12vRwxu2nVG2697dM36KMNkmfecNdU8PpR',
      derivationIndex: 0,
      isImported: false,
    },
  ],
  getActiveAccount: () => ({
    id: 'account-1',
    name: 'Primary',
    address: '12vRwxu2nVG2697dM36KMNkmfecNdU8PpR',
    derivationIndex: 0,
    isImported: false,
  }),
};

const mockProvider = jest.fn();
const mockSignTransaction = jest.fn(async (tx: { signatures?: string[] }) => {
  tx.signatures = [...(tx.signatures ?? []), 'wallet-signature'];
});
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
  useWalletStore: Object.assign(
    () => mockWalletState,
    {
      getState: () => ({
        accounts: mockWalletState.accounts,
        address: mockWalletState.getActiveAccount().address,
      }),
    }
  ),
}));

jest.mock('../../lib/biometrics', () => ({
  requireBiometricAuth: jest.fn(async () => true),
}));

const mockCreateWalletFromMnemonic = jest.fn((_mnemonic: string, derivationIndex: number) =>
  derivationIndex === 1
    ? {
        address: RECEIVER,
        privateKey: 'b'.repeat(64),
      }
    : {
        address: OWNER,
        privateKey: 'a'.repeat(64),
      }
);

jest.mock('../../lib/wallet', () => ({
  createWalletFromMnemonic: (mnemonic: string, derivationIndex: number) =>
    mockCreateWalletFromMnemonic(mnemonic, derivationIndex),
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
  const actual = jest.requireActual('koilib');
  class Provider {
    rpcNodes: string[];
    constructor(rpcNodes: string[]) {
      this.rpcNodes = rpcNodes;
      mockProvider(rpcNodes);
    }
    getNextNonce = jest.fn(async () => 'KAE=');
    sendTransaction = mockEstimateSend;
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
    getAddress() {
      if (this.privateKey.startsWith('b')) {
        return RECEIVER;
      }
      return OWNER;
    }
    async signTransaction(tx: { signatures?: string[] }) {
      return mockSignTransaction(tx);
    }
  }

  class Transaction {
    static prepareTransaction = actual.Transaction.prepareTransaction;
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
    ...actual,
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
      accounts: [
        {
          id: 'account-1',
          name: 'Primary',
          address: OWNER,
          derivationIndex: 0,
          isImported: false,
        },
      ],
      getActiveAccount: () => ({
        id: 'account-1',
        name: 'Primary',
        address: OWNER,
        derivationIndex: 0,
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

  it('rejects KoinDX dApp swaps on testnet before auth', async () => {
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
      findButton(renderer!, 'Review')?.props.onPress();
    });
    await act(async () => {
      findButton(renderer!, 'Sign')?.props.onPress();
    });
    await flushEffects();

    expect(onReject).toHaveBeenCalledWith(
      'KoinDX swaps are only available on Koinos Mainnet.'
    );
    expect(requireBiometricAuth).not.toHaveBeenCalled();
  });

  it('rejects signer addresses not owned by the wallet before auth', async () => {
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
      findButton(renderer!, 'Review')?.props.onPress();
    });
    await act(async () => {
      findButton(renderer!, 'Sign')?.props.onPress();
    });
    await flushEffects();

    expect(onReject).toHaveBeenCalledWith('Transaction signer is not in this wallet.');
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
      findButton(renderer!, 'Review')?.props.onPress();
    });
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

  it('shows the selected sponsored payer and uses the active network when signing', async () => {
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
      findButton(renderer!, 'Paying with account mana')?.props.onPress();
    });
    await act(async () => {
      findButton(renderer!, 'Review')?.props.onPress();
    });
    await act(async () => {
      findButton(renderer!, 'Sign')?.props.onPress();
    });
    await flushEffects();

    expect(mockProvider).toHaveBeenCalledWith([
      'https://testnet.koinosfoundation.org/jsonrpc',
    ]);
    expect(mockSignTransaction).toHaveBeenCalled();
    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: expect.objectContaining({
          header: expect.objectContaining({
            payer: '17mzHQmfp3qNWQpvJLvNgFXqoW4HoS7Xbj',
            payee: OWNER,
            chain_id: 'EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==',
          }),
        }),
      })
    );
  });

  it('derives the HD signer from the mnemonic when no stored private key exists', async () => {
    const onApprove = jest.fn();
    jest.spyOn(SecureStore, 'getItemAsync').mockImplementation(async (key: string) => {
      if (key === 'kondor_pk_account-1' || key === 'kondor_wallet_private_key') {
        return null;
      }
      if (key === 'kondor_wallet_mnemonic') {
        return 'test mnemonic words';
      }
      return null;
    });

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
          appName="HD dApp"
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
      findButton(renderer!, 'Review')?.props.onPress();
    });
    await act(async () => {
      findButton(renderer!, 'Sign')?.props.onPress();
    });
    await flushEffects();

    expect(mockCreateWalletFromMnemonic).toHaveBeenCalledWith('test mnemonic words', 0);
    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: expect.objectContaining({
          header: expect.objectContaining({
            payer: OWNER,
          }),
        }),
      })
    );
  });

  it('signs with a non-active HD account owned by the wallet', async () => {
    const onApprove = jest.fn();
    mockWalletState = {
      ...mockWalletState,
      accounts: [
        mockWalletState.getActiveAccount(),
        {
          id: 'account-2',
          name: 'Second',
          address: RECEIVER,
          derivationIndex: 1,
          isImported: false,
        },
      ],
    };
    jest.spyOn(SecureStore, 'getItemAsync').mockImplementation(async (key: string) => {
      if (key === 'kondor_wallet_mnemonic') {
        return 'test mnemonic words';
      }
      return null;
    });

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
          appName="Multi-account dApp"
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
      findButton(renderer!, 'Review')?.props.onPress();
    });
    await act(async () => {
      findButton(renderer!, 'Sign')?.props.onPress();
    });
    await flushEffects();

    expect(mockCreateWalletFromMnemonic).toHaveBeenCalledWith('test mnemonic words', 1);
    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: expect.objectContaining({
          header: expect.objectContaining({
            payer: RECEIVER,
          }),
        }),
      })
    );
  });

  it('signs with a non-active imported account owned by the wallet', async () => {
    const onApprove = jest.fn();
    mockWalletState = {
      ...mockWalletState,
      accounts: [
        mockWalletState.getActiveAccount(),
        {
          id: 'imported-1',
          name: 'Imported',
          address: RECEIVER,
          derivationIndex: 0,
          isImported: true,
        },
      ],
    };
    jest.spyOn(SecureStore, 'getItemAsync').mockImplementation(async (key: string) => {
      if (key === 'kondor_pk_imported-1') {
        return 'b'.repeat(64);
      }
      return null;
    });

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
          appName="Imported dApp"
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
      findButton(renderer!, 'Review')?.props.onPress();
    });
    await act(async () => {
      findButton(renderer!, 'Sign')?.props.onPress();
    });
    await flushEffects();

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('kondor_pk_imported-1');
    expect(mockCreateWalletFromMnemonic).not.toHaveBeenCalled();
    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: expect.objectContaining({
          header: expect.objectContaining({
            payer: RECEIVER,
          }),
        }),
      })
    );
  });

  it('signs the reviewed payload without replacing the payer or earlier signatures', async () => {
    const { Transaction } = jest.requireActual('koilib');
    const transaction = await Transaction.prepareTransaction({
      header: {
        payer: RECEIVER,
        payee: OWNER,
        chain_id: 'EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==',
        nonce: 'KAE=',
        rc_limit: '90000000',
      },
      operations: [],
      signatures: ['earlier-signature'],
    });
    const onApprove = jest.fn();
    await act(async () => {
      activeRenderer = TestRenderer.create(
        <TransactionApprovalModal
          visible
          request={{ signerAddress: OWNER, transaction }}
          appName="Existing signature"
          appOrigin="https://example.com"
          isSend={false}
          onApprove={onApprove}
          onReject={jest.fn()}
          onClose={jest.fn()}
        />
      );
    });
    await act(async () => {
      findButton(activeRenderer!, 'Review')?.props.onPress();
    });
    await act(async () => {
      findButton(activeRenderer!, 'Sign')?.props.onPress();
    });

    expect(mockEstimateSend).not.toHaveBeenCalled();
    expect(onApprove).toHaveBeenCalledWith({
      transaction: {
        ...transaction,
        signatures: ['earlier-signature', 'wallet-signature'],
      },
    });
  });

  it('does not authorize keys or submit until the final reviewed send is approved', async () => {
    const onApprove = jest.fn();
    jest.mocked(submitTransactionOnce).mockResolvedValueOnce({ reverted: false } as never);
    await act(async () => {
      activeRenderer = TestRenderer.create(
        <TransactionApprovalModal
          visible
          request={{ signerAddress: OWNER, transaction: { operations: [] } }}
          appName="Test dApp"
          appOrigin="https://example.com"
          isSend
          onApprove={onApprove}
          onReject={jest.fn()}
          onClose={jest.fn()}
        />
      );
    });

    await act(async () => {
      findButton(activeRenderer!, 'Review')?.props.onPress();
    });
    expect(submitTransactionOnce).not.toHaveBeenCalled();
    expect(requireBiometricAuth).not.toHaveBeenCalled();
    expect(getTextContent(activeRenderer!)).toContain('Reviewed transaction');

    await act(async () => {
      const approve = findButton(activeRenderer!, 'Send')?.props.onPress;
      approve?.();
      approve?.();
    });
    expect(readPayerCapacity).toHaveBeenCalledTimes(2);
    expect(submitTransactionOnce).toHaveBeenCalledTimes(1);
    expect(submitTransactionOnce).toHaveBeenCalledWith(expect.objectContaining({
      transaction: expect.objectContaining({
        header: expect.objectContaining({ payer: OWNER, rc_limit: '1000000000' }),
        signatures: ['wallet-signature'],
      }),
    }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('authenticates again and retries only the original Activity transfer', async () => {
    act(() => { useNetworkStore.setState({ mode: 'mainnet' }); });
    const { Transaction } = jest.requireActual('koilib');
    const transaction = await Transaction.prepareTransaction({
      header: { payer: OWNER, chain_id: MAINNET.chainId, nonce: 'KAE=', rc_limit: '90000000' },
      operations: [{ call_contract: {
        contract_id: MAINNET.koinContract, entry_point: 0x27f576ca,
        args: encodeTransferArgs({ from: OWNER, to: RECEIVER, value: '100000000' }),
      } }],
    });
    const recovery = {
      address: OWNER, networkMode: 'mainnet' as const, source: 'send' as const, chainTransactionId: transaction.id,
      transaction: { type: 'send' as const, from: OWNER, to: RECEIVER, payer: OWNER, fee: '0', timestamp: 1,
        amount: '1', token: MAINNET.koinContract, tokenDecimals: 8, tokenSymbol: 'KOIN' },
    };
    jest.mocked(submitTransactionOnce).mockResolvedValueOnce({ id: transaction.id } as never);
    await act(async () => {
      activeRenderer = TestRenderer.create(
        <TransactionApprovalModal visible request={{ signerAddress: OWNER, transaction }} appName="" appOrigin=""
          isSend recovery={recovery} onApprove={jest.fn()} onReject={jest.fn()} onClose={jest.fn()} />
      );
    });
    expect(getTextContent(activeRenderer!)).toEqual(expect.arrayContaining([RECEIVER, '1 KOIN', '100000000']));
    await act(async () => { await findButton(activeRenderer!, 'Review')?.props.onPress(); });
    expect(requireBiometricAuth).not.toHaveBeenCalled();
    expect(submitTransactionOnce).not.toHaveBeenCalled();
    await act(async () => { await findButton(activeRenderer!, 'Retry send')?.props.onPress(); });
    expect(requireBiometricAuth).toHaveBeenCalledTimes(1);
    expect(readPayerCapacity).toHaveBeenCalledWith(expect.objectContaining({ payer: OWNER, outgoingKoin: '100000000' }));
    expect(submitTransactionOnce).toHaveBeenCalledWith(expect.objectContaining({
      transaction: { ...transaction, signatures: ['wallet-signature'] }, pending: recovery, retryOnly: true,
    }));
  });

  it('does not load keys if the requesting site navigates during authentication', async () => {
    let completeAuth: (approved: boolean) => void = () => {};
    jest.mocked(requireBiometricAuth).mockImplementationOnce(() =>
      new Promise<boolean>((resolve) => { completeAuth = resolve; })
    );
    let current = true;
    const onApprove = jest.fn();
    await act(async () => {
      activeRenderer = TestRenderer.create(
        <TransactionApprovalModal
          visible
          request={{ signerAddress: OWNER, transaction: { operations: [] } }}
          appName="Site"
          appOrigin="https://example.com"
          isSend={false}
          isRequestCurrent={() => current}
          onApprove={onApprove}
          onReject={jest.fn()}
          onClose={jest.fn()}
        />
      );
    });
    await act(async () => {
      findButton(activeRenderer!, 'Review')?.props.onPress();
    });
    await act(async () => {
      findButton(activeRenderer!, 'Sign')?.props.onPress();
    });
    current = false;
    await act(async () => {
      completeAuth(true);
    });

    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(mockSignTransaction).not.toHaveBeenCalled();
    expect(onApprove).not.toHaveBeenCalled();
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
      findButton(renderer!, 'Review')?.props.onPress();
    });
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

  it('does not touch the request or keys when unsigned preparation fails', async () => {
    const onApprove = jest.fn();
    const onReject = jest.fn();
    const request = {
      signerAddress: OWNER,
      transaction: {
        operations: [],
        header: {},
      },
    };

    request.transaction.header = { payer: 'invalid payer' };

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
      findButton(renderer!, 'Review')?.props.onPress();
    });
    await act(async () => {
      findButton(renderer!, 'Sign')?.props.onPress();
    });
    await flushEffects();

    expect(onApprove).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    expect(request.transaction).toEqual({
      operations: [],
      header: { payer: 'invalid payer' },
    });
    expect(requireBiometricAuth).not.toHaveBeenCalled();
    expect(mockSignTransaction).not.toHaveBeenCalled();
  });
});
