jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { getContractExplorerUrl, getTransactionExplorerUrl } from '../explorer';
import { KOINOS_TOKEN_CONTRACTS, MAINNET, TESTNET } from '../constants';

describe('getContractExplorerUrl', () => {
  it('uses Koinscan contract aliases for KOIN and VHP', () => {
    expect(getContractExplorerUrl(KOINOS_TOKEN_CONTRACTS.KOIN, MAINNET)).toBe(
      'https://www.koinscan.com/contracts/koin'
    );
    expect(getContractExplorerUrl(KOINOS_TOKEN_CONTRACTS.VHP, MAINNET)).toBe(
      'https://www.koinscan.com/contracts/vhp'
    );
  });

  it('uses the active network explorer for Harbinger contracts', () => {
    expect(getContractExplorerUrl(TESTNET.koinContract, TESTNET)).toBe(
      'https://harbinger.koinscan.com/contracts/koin'
    );
  });

  it('uses the contracts route for other contract ids', () => {
    expect(getContractExplorerUrl('1DdERbxQte8XCwLQT8KVDyq1NJo5EGhpdg', TESTNET)).toBe(
      'https://harbinger.koinscan.com/contracts/1DdERbxQte8XCwLQT8KVDyq1NJo5EGhpdg'
    );
  });
});

describe('getTransactionExplorerUrl', () => {
  it('uses the active network transaction route', () => {
    expect(getTransactionExplorerUrl('0xmainnet', MAINNET)).toBe(
      'https://www.koinscan.com/tx/0xmainnet'
    );
    expect(getTransactionExplorerUrl('0xharbinger', TESTNET)).toBe(
      'https://harbinger.koinscan.com/tx/0xharbinger'
    );
  });

  it('falls back to the raw contract id when there is no alias', () => {
    expect(getContractExplorerUrl('1DdERbxQte8XCwLQT8KVDyq1NJo5EGhpdg', MAINNET)).toBe(
      'https://www.koinscan.com/contracts/1DdERbxQte8XCwLQT8KVDyq1NJo5EGhpdg'
    );
  });
});
