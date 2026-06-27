import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { NFT } from '../../lib/nftService';
import { useNFTs } from '../useNFTs';

type NetworkState = {
  mode: 'mainnet' | 'harbinger';
  hasHydrated: boolean;
};

type WalletState = {
  address: string;
};

type DeferredValue<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): DeferredValue<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

let mockNetworkState: NetworkState = {
  mode: 'mainnet',
  hasHydrated: true,
};

let mockWalletState: WalletState = {
  address: '1AccountA',
};

const mockInitialize = jest.fn(async () => undefined);
const mockFetchNFTsByOwner = jest.fn();
const mockGroupNFTsByCollection = jest.fn((nfts: NFT[]) => [
  {
    address: nfts[0]?.collection_address ?? 'collection',
    name: nfts[0]?.collection_name ?? 'Collection',
    nfts,
  },
]);

jest.mock('../../stores/networkStore', () => ({
  getActiveNetworkConfig: () => ({
    chainId: mockNetworkState.mode === 'mainnet' ? 'mainnet-chain' : 'harbinger-chain',
  }),
  useNetworkStore: (selector: (state: NetworkState) => unknown) => selector(mockNetworkState),
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: (selector: (state: WalletState) => unknown) => selector(mockWalletState),
}));

jest.mock('../../stores/koinosStore', () => {
  const useKoinosStore = () => ({
    provider: { rpc: 'provider' },
    isInitialized: true,
    initialize: mockInitialize,
    networkChainId: mockNetworkState.mode === 'mainnet' ? 'mainnet-chain' : 'harbinger-chain',
  });

  (useKoinosStore as unknown as { getState: () => unknown }).getState = () => ({
    provider: { rpc: 'provider' },
    isInitialized: true,
    initialize: mockInitialize,
    networkChainId: mockNetworkState.mode === 'mainnet' ? 'mainnet-chain' : 'harbinger-chain',
  });

  return { useKoinosStore };
});

jest.mock('../../lib/nftService', () => ({
  fetchNFTsByOwner: (...args: [string, 'mainnet' | 'harbinger', { provider: unknown }]) =>
    mockFetchNFTsByOwner(...args),
  groupNFTsByCollection: (...args: [NFT[]]) => mockGroupNFTsByCollection(...args),
}));

function HookHarness() {
  const { nfts, loading, error, isTestnet } = useNFTs();

  return (
    <>
      <Text testID="token-ids">{nfts.map((nft) => nft.token_id).join(',')}</Text>
      <Text testID="loading">{loading ? 'loading' : 'idle'}</Text>
      <Text testID="error">{error ?? ''}</Text>
      <Text testID="testnet">{isTestnet ? 'testnet' : 'mainnet'}</Text>
    </>
  );
}

function getTextById(renderer: TestRenderer.ReactTestRenderer, testID: string): string {
  const node = renderer.root.findByProps({ testID });
  const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
  return children.join('');
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useNFTs stale request handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNetworkState = { mode: 'mainnet', hasHydrated: true };
    mockWalletState = { address: '1AccountA' };
    mockGroupNFTsByCollection.mockImplementation((nfts: NFT[]) => [
      {
        address: nfts[0]?.collection_address ?? 'collection',
        name: nfts[0]?.collection_name ?? 'Collection',
        nfts,
      },
    ]);
  });

  it('ignores a stale mainnet response after switching to Harbinger', async () => {
    const deferred = createDeferred<NFT[]>();
    mockFetchNFTsByOwner.mockReturnValue(deferred.promise);

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<HookHarness />);
    });
    await flushEffects();

    expect(getTextById(renderer, 'loading')).toBe('loading');

    mockNetworkState = { mode: 'harbinger', hasHydrated: true };
    await act(async () => {
      renderer.update(<HookHarness />);
    });
    await flushEffects();

    expect(getTextById(renderer, 'token-ids')).toBe('');
    expect(getTextById(renderer, 'loading')).toBe('idle');
    expect(getTextById(renderer, 'testnet')).toBe('testnet');

    await act(async () => {
      deferred.resolve([
        {
          id: 'collection:0x31',
          token_id: '0x31',
          contract_id: 'collection',
          collection_address: 'collection',
          collection_name: 'Collection',
          owner: '1AccountA',
        },
      ]);
      await deferred.promise;
    });
    await flushEffects();

    expect(getTextById(renderer, 'token-ids')).toBe('');
    expect(getTextById(renderer, 'loading')).toBe('idle');
    expect(getTextById(renderer, 'error')).toBe('');
  });

  it('ignores a stale account response after switching accounts', async () => {
    const accountADeferred = createDeferred<NFT[]>();
    mockFetchNFTsByOwner.mockImplementation((address: string) => {
      if (address === '1AccountA') {
        return accountADeferred.promise;
      }

      return Promise.resolve([
        {
          id: 'collection:0x32',
          token_id: '0x32',
          contract_id: 'collection',
          collection_address: 'collection',
          collection_name: 'Collection',
          owner: address,
        },
      ]);
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<HookHarness />);
    });
    await flushEffects();

    mockWalletState = { address: '1AccountB' };
    await act(async () => {
      renderer.update(<HookHarness />);
    });
    await flushEffects();

    expect(getTextById(renderer, 'token-ids')).toBe('0x32');
    expect(getTextById(renderer, 'loading')).toBe('idle');

    await act(async () => {
      accountADeferred.resolve([
        {
          id: 'collection:0x31',
          token_id: '0x31',
          contract_id: 'collection',
          collection_address: 'collection',
          collection_name: 'Collection',
          owner: '1AccountA',
        },
      ]);
      await accountADeferred.promise;
    });
    await flushEffects();

    expect(getTextById(renderer, 'token-ids')).toBe('0x32');
    expect(getTextById(renderer, 'loading')).toBe('idle');
    expect(getTextById(renderer, 'error')).toBe('');
  });
});
