import React from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

let mockRouteParams: { initialFilter?: 'all' | 'send' | 'receive' | 'swap' | 'pending' } = {};
const mockRefetch = jest.fn();

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

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({
    params: mockRouteParams,
  }),
}));

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../hooks/useTransactionHistory', () => ({
  useTransactionHistory: () => ({
    transactions: [mockReceiveTransaction],
    loading: false,
    error: null,
    refetch: mockRefetch,
  }),
}));

function findPressableByText(
  renderer: TestRenderer.ReactTestRenderer,
  label: string
): TestRenderer.ReactTestInstance {
  const button = renderer.root.findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === label));

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

describe('ActivityScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
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
});
