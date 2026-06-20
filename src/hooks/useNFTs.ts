import { useCallback, useEffect, useState } from 'react';
import { Provider } from 'koilib';
import { getActiveNetworkConfig, useNetworkStore } from '../stores/networkStore';
import { useWalletStore } from '../stores/walletStore';
import { useKoinosStore } from '../stores/koinosStore';
import {
  fetchNFTsByOwner,
  groupNFTsByCollection,
  type NFT,
  type NFTCollection,
} from '../lib/nftService';

interface UseNFTsResult {
  nfts: NFT[];
  collections: NFTCollection[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isTestnet: boolean;
}

async function ensureProviderForActiveNetwork(): Promise<Provider> {
  const activeNetwork = getActiveNetworkConfig();
  let { provider, isInitialized, initialize, networkChainId } = useKoinosStore.getState();

  if (!provider || !isInitialized || networkChainId !== activeNetwork.chainId) {
    await initialize();
    ({ provider, networkChainId } = useKoinosStore.getState());
  }

  if (!provider || networkChainId !== activeNetwork.chainId) {
    throw new Error('Provider not initialized');
  }

  return provider;
}

export function useNFTs(): UseNFTsResult {
  const address = useWalletStore((state) => state.address);
  const networkMode = useNetworkStore((state) => state.mode);
  const hasHydrated = useNetworkStore((state) => state.hasHydrated);
  const isTestnet = hasHydrated && networkMode === 'harbinger';
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [collections, setCollections] = useState<NFTCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNFTs = useCallback(async () => {
    if (!hasHydrated || !address) {
      setNfts([]);
      setCollections([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (isTestnet) {
      setNfts([]);
      setCollections([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const provider = await ensureProviderForActiveNetwork();
      const fetchedNFTs = await fetchNFTsByOwner(address, networkMode, { provider });
      setNfts(fetchedNFTs);
      setCollections(groupNFTsByCollection(fetchedNFTs));
    } catch (fetchError) {
      setNfts([]);
      setCollections([]);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load NFTs');
    } finally {
      setLoading(false);
    }
  }, [address, hasHydrated, isTestnet, networkMode]);

  useEffect(() => {
    void fetchNFTs();
  }, [fetchNFTs]);

  return {
    nfts,
    collections,
    loading,
    error,
    refetch: fetchNFTs,
    isTestnet,
  };
}
