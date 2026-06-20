jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { MAINNET, TESTNET } from '../../lib/constants';
import {
  buildTokensForNetwork,
  getTokenListUrlForNetwork,
  type Token,
} from '../tokenStore';

const mainnetList = [
  {
    chainId: 24,
    address: '1TokenMainnetAlpha',
    name: 'Alpha',
    symbol: 'ALPHA',
    decimals: 8,
    logoURI: 'https://example.com/alpha.png',
  },
  {
    chainId: 24,
    address: 'koin',
    name: 'Koin Alias',
    symbol: 'KOIN',
    decimals: 8,
    logoURI: 'https://example.com/koin.png',
  },
];

describe('tokenStore network token helpers', () => {
  it('uses the mainnet token list URL on mainnet', () => {
    expect(getTokenListUrlForNetwork(MAINNET)).toMatch(/mainnet\.json$/);
  });

  it('does not use the mainnet token list on Harbinger', () => {
    expect(getTokenListUrlForNetwork(TESTNET)).toBeNull();
  });

  it('builds a minimal Harbinger token set with the Harbinger KOIN contract', () => {
    const tokens = buildTokensForNetwork(TESTNET, mainnetList) as Token[];

    expect(tokens).toEqual([
      expect.objectContaining({
        contractId: TESTNET.koinContract,
        symbol: 'KOIN',
        balance: '0',
      }),
    ]);
    expect(tokens.some((token) => token.contractId === '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK')).toBe(false);
    expect(tokens.some((token) => token.symbol === 'ALPHA')).toBe(false);
  });
});
