import React from 'react';
import { Alert, FlatList, StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

let mockRouteParams: { initialFilter?: 'all' | 'send' | 'receive' | 'swap' | 'pending' } = {};
const mockRefetch = jest.fn();
const mockGetRecovery = jest.fn();
const mockWallet = { address: 'wallet', activeAccountId: 'account' };
const mockNavigation = { isFocused: () => true, addListener: () => () => undefined };

const mockReceiveTransaction = {
  id: 'receive-1',
  type: 'receive',
  status: 'confirmed',
  amount: '10',
  tokenSymbol: 'KOIN',
  tokenIcon: null,
  from: '14AHKz111111111111111111111111111111111',
  to: '1Wallet1111111111111111111111111111111111',
  timestamp: Date.now() - 1_000,
  blockHeight: 100,
};
let mockTransactions = [mockReceiveTransaction];

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({
    params: mockRouteParams,
  }),
  useNavigation: () => mockNavigation,
}));

jest.mock('../../stores/walletStore', () => ({ useWalletStore: { getState: () => mockWallet } }));
jest.mock('../../stores/networkStore', () => ({ useNetworkStore: { getState: () => ({ mode: 'mainnet', hasHydrated: true }) } }));
jest.mock('../../lib/transactionJournal', () => ({ getTransactionRecovery: (...args: unknown[]) => mockGetRecovery(...args) }));
jest.mock('../../components/TransactionApprovalModal', () => ({ TransactionApprovalModal: 'TransactionApprovalModal' }));

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../hooks/useTransactionHistory', () => ({
  useTransactionHistory: () => ({
    transactions: mockTransactions,
    loading: false,
    error: null,
    refetch: mockRefetch,
  }),
}));

function findPressableByText(renderer: TestRenderer.ReactTestRenderer, label: string, role?: string): TestRenderer.ReactTestInstance {
  const button = renderer.root.findAll((node) => typeof node.props.onPress === 'function' &&
    (!role || node.props.accessibilityRole === role))
    .find((node) => node.findAllByType(Text).some((textNode) =>
      [textNode.props.children].flat().join('') === label));

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

describe('ActivityScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
    mockTransactions = [mockReceiveTransaction];
    mockWallet.address = 'wallet';
  });

  it('opens the saved transaction from a pending Activity row for fresh approval', async () => {
    const pending = { address: 'wallet', networkMode: 'mainnet', chainTransactionId: 'send-1' };
    const transaction = { id: 'send-1', header: { payer: 'wallet', rc_limit: '100' } };
    mockGetRecovery.mockResolvedValue({ pending, transaction });
    mockTransactions = [{ ...mockReceiveTransaction, id: 'send-1', type: 'send', status: 'pending' }];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { ActivityScreen } = require('../ActivityScreen');
    const { TransactionApprovalModal } = require('../../components/TransactionApprovalModal');
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ActivityScreen />); });
    await act(async () => { await findPressableByText(renderer!, 'Sent KOIN', 'button').props.onPress(); });
    const button = alert.mock.calls[0]?.[2]?.find(({ text }) => text === 'Review and retry');
    expect(button).toBeDefined();
    await act(async () => { await button?.onPress?.(); });
    const modal = renderer!.root.findByType(TransactionApprovalModal);
    expect(modal.props.request).toEqual({ signerAddress: 'wallet', transaction });
    expect(modal.props.recovery).toEqual(pending);
    expect(modal.props.isRequestCurrent()).toBe(true);
    mockWallet.address = 'switched-wallet';
    expect(modal.props.isRequestCurrent()).toBe(false);
    await act(async () => { renderer!.unmount(); });
    alert.mockRestore();
  });

  it('keeps the filter bar and chips at stable heights when filtered results are short', async () => {
    mockRouteParams = { initialFilter: 'receive' };
    const { ActivityScreen } = require('../ActivityScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<ActivityScreen />);
    });

    const filterList = renderer!.root.findAllByType(FlatList)
      .find((node) => node.props.horizontal);
    const receiveChip = findPressableByText(renderer!, 'Receive');
    const filterListStyle = StyleSheet.flatten(filterList?.props.style);
    const receiveChipStyle = StyleSheet.flatten(receiveChip.props.style);

    expect(filterListStyle).toEqual(expect.objectContaining({
      flexGrow: 0,
      maxHeight: 56,
    }));
    expect(receiveChipStyle).toEqual(expect.objectContaining({
      height: 44,
      minHeight: 44,
      alignSelf: 'flex-start',
    }));
  });

  it('includes transaction id, from, to, and payer in inspectable details', () => {
    const { buildTransactionDetailMessage } = require('../ActivityScreen');
    expect(buildTransactionDetailMessage({
      id: '0xabc',
      type: 'send',
      amount: '1',
      tokenSymbol: 'KOIN',
      from: 'from-address',
      to: 'to-address',
      payer: 'payer-address',
      status: 'confirmed',
      timestamp: 0,
      fee: '0',
      token: 'koin',
      tokenDecimals: 8,
    })).toContain('Transaction ID: 0xabc');
    expect(buildTransactionDetailMessage({
      id: '0xabc',
      type: 'send',
      amount: '1',
      tokenSymbol: 'KOIN',
      from: 'from-address',
      to: 'to-address',
      payer: 'payer-address',
      status: 'confirmed',
      timestamp: 0,
      fee: '0',
      token: 'koin',
      tokenDecimals: 8,
    })).toContain('Payer: payer-address');
  });
});
