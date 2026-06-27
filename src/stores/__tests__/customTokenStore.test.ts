jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createEmptyCustomTokenNetworks,
  useCustomTokenStore,
  type CustomTokenDefinition,
} from '../customTokenStore';

const alphaToken: CustomTokenDefinition = {
  contractId: '1AlphaContract',
  symbol: 'ALPHA',
  name: 'Alpha Token',
  decimals: 8,
  icon: 'https://example.com/alpha.png',
};

const betaToken: CustomTokenDefinition = {
  contractId: '1BetaContract',
  symbol: 'BETA',
  name: 'Beta Token',
  decimals: 5,
};

describe('customTokenStore', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    useCustomTokenStore.setState(
      {
        networks: createEmptyCustomTokenNetworks(),
      },
      false
    );
  });

  it('stores custom tokens by network', () => {
    const state = useCustomTokenStore.getState();

    state.addCustomToken('mainnet', alphaToken);
    state.addCustomToken('harbinger', betaToken);

    expect(state.getCustomTokens('mainnet')).toEqual([alphaToken]);
    expect(state.getCustomTokens('harbinger')).toEqual([betaToken]);
  });

  it('tracks hidden system tokens per network without affecting the other network', () => {
    const state = useCustomTokenStore.getState();

    state.setSystemTokenHidden('mainnet', 'koin-mainnet', true);
    state.setSystemTokenHidden('harbinger', 'koin-harbinger', true);
    state.setSystemTokenHidden('mainnet', 'koin-mainnet', false);

    expect(state.getHiddenSystemTokenIds('mainnet')).toEqual([]);
    expect(state.getHiddenSystemTokenIds('harbinger')).toEqual(['koin-harbinger']);
  });

  it('removes only custom tokens from the selected network', () => {
    const state = useCustomTokenStore.getState();

    state.addCustomToken('mainnet', alphaToken);
    state.addCustomToken('harbinger', betaToken);
    state.removeCustomToken('mainnet', alphaToken.contractId);

    expect(state.getCustomTokens('mainnet')).toEqual([]);
    expect(state.getCustomTokens('harbinger')).toEqual([betaToken]);
  });
});
