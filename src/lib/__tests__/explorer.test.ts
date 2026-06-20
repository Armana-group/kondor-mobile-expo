import { getContractExplorerUrl } from '../explorer';
import { KOINOS_TOKEN_CONTRACTS } from '../constants';

describe('getContractExplorerUrl', () => {
  it('uses Koinscan contract aliases for KOIN and VHP', () => {
    expect(getContractExplorerUrl(KOINOS_TOKEN_CONTRACTS.KOIN)).toBe(
      'https://www.koinscan.com/contracts/koin'
    );
    expect(getContractExplorerUrl(KOINOS_TOKEN_CONTRACTS.VHP)).toBe(
      'https://www.koinscan.com/contracts/vhp'
    );
  });

  it('uses the contracts route for other contract ids', () => {
    expect(getContractExplorerUrl('1DdERbxQte8XCwLQT8KVDyq1NJo5EGhpdg')).toBe(
      'https://www.koinscan.com/contracts/1DdERbxQte8XCwLQT8KVDyq1NJo5EGhpdg'
    );
  });
});
