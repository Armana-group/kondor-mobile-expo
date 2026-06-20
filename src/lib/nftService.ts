import { Contract, Provider, utils } from 'koilib';
import { MAINNET } from './constants';
import type { NetworkMode } from '../stores/networkStore';

export interface NFTAttribute {
  trait_type: string;
  value: string | number;
}

export interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: NFTAttribute[];
}

export interface NFT {
  id: string;
  token_id: string;
  contract_id: string;
  collection_name?: string;
  collection_address?: string;
  owner: string;
  metadata?: NFTMetadata;
  image_url?: string;
  name?: string;
}

export interface NFTCollection {
  address: string;
  name: string;
  nfts: NFT[];
}

export interface KnownCollection {
  address: string;
  name: string;
}

export interface NFTServiceContract {
  getTokensByOwner(args: { owner: string; limit: number }): Promise<string[]>;
  getUri(): Promise<string>;
}

export interface FetchNFTsOptions {
  provider?: Provider;
  collections?: KnownCollection[];
  createContract?: (collection: KnownCollection, provider: Provider) => NFTServiceContract;
  fetchJson?: (url: string) => Promise<unknown>;
}

const MAX_TOKENS_PER_COLLECTION = 50;

export const KNOWN_COLLECTIONS: KnownCollection[] = [
  { address: '1BPyuZC8dAcLptDDkxj2RqXPgkVLc7xZKM', name: 'KoinDX Orbs' },
  { address: '13tmzDmfqCsbYT26C4CmKxq86d33senqH3', name: 'KAP Domains' },
  { address: '1N2AhqGGticZ8hYmwNPWoroEBvTp3YGsLW', name: 'OG-Rex' },
  { address: '1MDyZtgrmBbH63FuGd7JXT4mSQfgBAUzWk', name: 'Koin Press Badges' },
  { address: '19g4oTs39Lg3ZCjKs9w9B6NjQzswB69QwU', name: 'Koinos Punks' },
  { address: '1QKECm99uzA3GmpC9JVY8YTRHwLYiVVSwU', name: 'Koinos Puppies' },
  { address: '17SvQYVtXLb4cKLQWpmZ2yWeQ2ACFAhgZW', name: 'Koinos CyborgPunks' },
  { address: '1KyZyhNwiDo6a93f3FvK8pxspKdgEtQDwa', name: 'Kondor NFTs' },
  { address: '15ouFhmcE2wcK5poiSa2T8U9EoqzqMC6Qw', name: 'Koinos Eve' },
  { address: '1AhGbSHUVaTWV1oqJRSTihsi2ofEvvYevg', name: 'KoinCity Moon Boys' },
  { address: '1BiETH1WgXZTGW9yT72NWqEv2dgTKtpjBg', name: 'Koinos Garden' },
  { address: '17H1HS7SHR76JpqhpkRVgfEQHanq9vh8rF', name: 'BitKoin NFTs' },
  { address: '1Bz14B1LkAQyvvqGKDxBe8ER6eb3RYMmuu', name: 'Koinos Army NFTs' },
  { address: '1KgWLvTzQvJgodE6qUzMQDrpE6v4sSFRSA', name: 'Konio Ancient NFTs' },
  { address: '1FB7geE8MN1ViG91rkBE5iu27s2Khuo257', name: 'KoinCrew NFTs' },
  { address: '1KANGodsBD74xBuoBVoJE2x2PiRyDbfM2i', name: 'Kanvas Gods' },
  { address: '1EwJUW4BFbA4EGmSyB9bgdhB3gk2f3shRN', name: 'Kondor Elementus' },
  { address: '1DDrWPzWZF92sxvX2FuXyKdy4XHXMFaqht', name: 'RWA Real World Assets' },
  { address: '1E6EKDGSeXsZKhX4DPTNxY8FWvCQnTBbU6', name: 'Chess Gambit Club' },
  { address: '1NxweGyS8pzR84xUY4AZrChhUC4pdGEpQk', name: 'Koinos World' },
  { address: '1HCbbw7sbE6FNfzezs49AzFUSGezUEj3dC', name: 'Koinos Raffles Gamblers Genesis' },
  { address: '1CXSeGtcUTXH6pSCCF5FpPC5HgYJSbJEvs', name: 'Trans.ex NFTs' },
  { address: '1DzG86fM4TMRgFhZ94Me4EKzXdJtN1L4NH', name: 'Physical Koin Raffle' },
  { address: '1EwYTYLrxN8iyXTh1Acso9LgV5TGP9e1ey', name: 'Imaginary World' },
  { address: '1B7qbYg5TuHULf2Q5LjHLUEMRR8ofCFUS2', name: 'Mutant Boys' },
  { address: '1E13mrsSJW4LAHCHavS8CNurTM1Z9367dX', name: 'Koinos Agents' },
  { address: '1NGmGtQZ2HEjzsVr16FX7Tab7jM98FWmEy', name: 'KuKu Games' },
  { address: '16hJzEnEuaeUV3FbBpYaGewLG4dhqk8efY', name: 'Nube' },
  { address: '18diYyRE3XkkjdM3XgZQPVDGNJnPXEHyNT', name: 'Chicken Blaze' },
  { address: '1Cs4tVzdRZZ4DPYEHpiULe4VMemjiK6p1Y', name: 'Koinos Astronauts KAMP' },
  { address: '1GW3Nni75gFxwqLUpbzhkY6dYgdaEiRv7T', name: 'Maine Koon' },
  { address: '19BvLYMcXFqT382obiedcmXBuMkSY5xBfv', name: 'Goal Day of the Dead' },
  { address: '1H3S7vB73KVBACSBAHEosCqSoJJb1t8Ahk', name: 'Koinos Wolf' },
  { address: '1CKDdmrQqzqdEZRpLJYt4V1XJXBpoGGWZP', name: 'Koinos Samurai' },
  { address: '1DE1PJt2mMoJ5FHiz4cNL3Fq2iETx5jXHA', name: 'Koinos 2nd Anniversary' },
  { address: '1ALZxd38zos3RFPz3ehVpH6TPKmwBHiHcv', name: 'TaskOn ManaMages' },
  { address: '1KEfvtos9DwNt9TtDe4Tv5wd5tBRs4MfnF', name: 'Postcard Girls' },
  { address: '1HUQuGsxs4CPcCdLLtXsGrMYJfRNU92cvt', name: 'SAIArt' },
  { address: '1SmMXNP9qboGaTpYfxYc9GEkBSrhiCR2e', name: 'Real Estate Run' },
  { address: '19HMY2dnxZmzAMDkqw7VcEQUvs9FQYek93', name: 'Stealth Run' },
  { address: '1Fb72o9sPoppusEJZ1vY8TBBfPQ6ZQVkft', name: 'KoinCrew Helmets' },
  { address: '1P5pAfJT36rHRjWwCMk1iCC27wVBk7iZ6h', name: 'Pulse' },
  { address: '1BHnZrZnFTo17TnqiWnP7iLDHtnDgBSgQr', name: 'KoinCity Ninja Boys' },
  { address: '1EnaBDVTA5hqXokC2dDzt2JT5eHv1y7ff1', name: 'koinos.fun' },
  { address: '121eg6YiaC5JiqupYcSUAeKAC5aNvmSsve', name: 'Mini Marvels' },
];

function createDefaultContract(collection: KnownCollection, provider: Provider): NFTServiceContract {
  const contract = new Contract({
    id: collection.address,
    abi: utils.nftAbi,
    provider,
  });

  return {
    getTokensByOwner: async ({ owner, limit }) => {
      const { result } = await contract.functions.getTokensByOwner({ owner, limit });
      return (result?.token_ids ?? []) as string[];
    },
    getUri: async () => {
      const { result } = await contract.functions.uri();
      return (result?.value as string | undefined) ?? '';
    },
  };
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch metadata: ${response.status}`);
  }

  return response.json();
}

function normalizeAttributes(value: unknown): NFTAttribute[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const attributes = value.filter(
    (item): item is NFTAttribute =>
      Boolean(
        item &&
        typeof item === 'object' &&
        typeof (item as NFTAttribute).trait_type === 'string' &&
        (typeof (item as NFTAttribute).value === 'string' || typeof (item as NFTAttribute).value === 'number')
      )
  );

  return attributes.length > 0 ? attributes : undefined;
}

function normalizeMetadata(value: unknown): NFTMetadata | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const metadata = value as Record<string, unknown>;
  const image = typeof metadata.image === 'string' ? convertIPFSUrl(metadata.image) : undefined;

  return {
    name: typeof metadata.name === 'string' ? metadata.name : undefined,
    description: typeof metadata.description === 'string' ? metadata.description : undefined,
    image,
    attributes: normalizeAttributes(metadata.attributes),
  };
}

async function fetchMetadata(
  baseUri: string,
  tokenId: string,
  fetchJson: (url: string) => Promise<unknown>
): Promise<NFTMetadata | undefined> {
  const normalizedBaseUri = convertIPFSUrl(baseUri).replace(/\/+$/, '');
  if (!normalizedBaseUri || !/^https?:\/\//.test(normalizedBaseUri)) {
    return undefined;
  }

  try {
    const rawMetadata = await fetchJson(`${normalizedBaseUri}/${tokenId}`);
    return normalizeMetadata(rawMetadata);
  } catch {
    return undefined;
  }
}

export function convertIPFSUrl(url: string | undefined): string {
  if (!url) {
    return '';
  }

  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }

  if (url.startsWith('/ipfs/')) {
    return `https://ipfs.io${url}`;
  }

  return url;
}

export function decodeTokenId(tokenId: string): string {
  if (!tokenId.startsWith('0x')) {
    return tokenId;
  }

  const hex = tokenId.slice(2);
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return tokenId;
  }

  let decoded = '';
  for (let index = 0; index < hex.length; index += 2) {
    const characterCode = Number.parseInt(hex.slice(index, index + 2), 16);
    if (characterCode < 0x20 || characterCode > 0x7e) {
      return tokenId;
    }

    decoded += String.fromCharCode(characterCode);
  }

  return decoded;
}

export function getNFTName(nft: NFT): string {
  return nft.name || nft.metadata?.name || `#${decodeTokenId(nft.token_id)}`;
}

export function getNFTImageUrl(nft: NFT): string {
  return nft.image_url || nft.metadata?.image || '';
}

export function getNFTDescription(nft: NFT): string {
  return nft.metadata?.description || 'No description';
}

export async function fetchNFTsByOwner(
  owner: string,
  networkMode: NetworkMode = 'mainnet',
  options: FetchNFTsOptions = {}
): Promise<NFT[]> {
  const trimmedOwner = owner.trim();
  if (!trimmedOwner || networkMode !== 'mainnet') {
    return [];
  }

  const provider = options.provider ?? new Provider(MAINNET.rpcNodes);
  const collections = options.collections ?? KNOWN_COLLECTIONS;
  const createContract = options.createContract ?? createDefaultContract;
  const fetchJson = options.fetchJson ?? defaultFetchJson;

  const settledResults = await Promise.allSettled(
    collections.map(async (collection) => {
      const contract = createContract(collection, provider);
      const tokenIds = await contract.getTokensByOwner({
        owner: trimmedOwner,
        limit: MAX_TOKENS_PER_COLLECTION,
      });

      if (tokenIds.length === 0) {
        return [] as NFT[];
      }

      const baseUri = await contract.getUri().catch(() => '');

      return Promise.all(
        tokenIds.map(async (tokenId) => {
          const metadata = baseUri ? await fetchMetadata(baseUri, tokenId, fetchJson) : undefined;
          const normalizedImageUrl = metadata?.image ? convertIPFSUrl(metadata.image) : undefined;

          return {
            id: `${collection.address}:${tokenId}`,
            token_id: tokenId,
            contract_id: collection.address,
            collection_name: collection.name,
            collection_address: collection.address,
            owner: trimmedOwner,
            name: metadata?.name,
            image_url: normalizedImageUrl,
            metadata,
          } satisfies NFT;
        })
      );
    })
  );

  const fulfilledResults = settledResults.filter(
    (result): result is PromiseFulfilledResult<NFT[]> => result.status === 'fulfilled'
  );

  if (fulfilledResults.length === 0 && collections.length > 0) {
    throw new Error('Could not reach the Koinos network to load NFTs');
  }

  return fulfilledResults.flatMap((result) => result.value);
}

export function groupNFTsByCollection(nfts: NFT[]): NFTCollection[] {
  const groupedCollections = new Map<string, NFTCollection>();

  for (const nft of nfts) {
    const address = nft.collection_address || nft.contract_id;
    const name = nft.collection_name || 'Unknown Collection';

    if (!groupedCollections.has(address)) {
      groupedCollections.set(address, {
        address,
        name,
        nfts: [],
      });
    }

    groupedCollections.get(address)?.nfts.push(nft);
  }

  return Array.from(groupedCollections.values());
}
