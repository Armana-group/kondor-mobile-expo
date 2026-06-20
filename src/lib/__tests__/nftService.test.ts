jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import type { NetworkMode } from '../../stores/networkStore';
import {
  KNOWN_COLLECTIONS,
  convertIPFSUrl,
  decodeTokenId,
  fetchNFTsByOwner,
  getNFTName,
  groupNFTsByCollection,
  type NFT,
  type NFTServiceContract,
} from '../nftService';

const OWNER = '1A6T7vmfwyGx2LD11RREwtcoXrLxG6q2rz';

interface MockCollectionState {
  tokens?: string[];
  uri?: string;
}

interface MockContractCall {
  collectionAddress: string;
  owner: string;
}

function createMockContract(state: MockCollectionState, calls: MockContractCall[], collectionAddress: string): NFTServiceContract {
  return {
    getTokensByOwner: jest.fn(async ({ owner }: { owner: string; limit: number }) => {
      calls.push({ collectionAddress, owner });
      if (!state.tokens) {
        throw new Error('collection does not support enumeration');
      }

      return state.tokens;
    }),
    getUri: jest.fn(async () => state.uri ?? ''),
  };
}

describe('decodeTokenId', () => {
  it('decodes printable ascii token ids', () => {
    expect(decodeTokenId('0x3537')).toBe('57');
    expect(decodeTokenId('0x6b6f6e646f72')).toBe('kondor');
  });

  it('returns the original token id for non-printable values', () => {
    expect(decodeTokenId('0x00ff')).toBe('0x00ff');
    expect(decodeTokenId('plain-text')).toBe('plain-text');
  });
});

describe('convertIPFSUrl', () => {
  it('converts ipfs protocol urls to a gateway url', () => {
    expect(convertIPFSUrl('ipfs://Qm123/asset.png')).toBe('https://ipfs.io/ipfs/Qm123/asset.png');
  });

  it('converts /ipfs paths to a gateway url', () => {
    expect(convertIPFSUrl('/ipfs/Qm123/asset.png')).toBe('https://ipfs.io/ipfs/Qm123/asset.png');
  });

  it('passes through http urls unchanged', () => {
    expect(convertIPFSUrl('https://example.com/asset.png')).toBe('https://example.com/asset.png');
  });
});

describe('getNFTName', () => {
  it('prefers the explicit name, then metadata name, then token id', () => {
    const named = {
      token_id: '0x3537',
      name: 'Token 57',
      metadata: { name: 'Metadata 57' },
    } as NFT;

    expect(getNFTName(named)).toBe('Token 57');
    expect(getNFTName({ ...named, name: undefined })).toBe('Metadata 57');
    expect(getNFTName({ token_id: '0x3537' } as NFT)).toBe('#57');
  });
});

describe('fetchNFTsByOwner', () => {
  it('returns an empty list without network calls when the owner is empty', async () => {
    const createContract = jest.fn();
    const fetchJson = jest.fn();

    const result = await fetchNFTsByOwner('', 'mainnet', {
      createContract,
      fetchJson,
    });

    expect(result).toEqual([]);
    expect(createContract).not.toHaveBeenCalled();
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('returns an empty list without network calls on Harbinger', async () => {
    const createContract = jest.fn();
    const fetchJson = jest.fn();

    const result = await fetchNFTsByOwner(OWNER, 'harbinger', {
      createContract,
      fetchJson,
    });

    expect(result).toEqual([]);
    expect(createContract).not.toHaveBeenCalled();
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('queries known collections with the owner address and normalizes metadata', async () => {
    const collection = KNOWN_COLLECTIONS[0];
    const contractCalls: MockContractCall[] = [];
    const fetchJson = jest.fn(async (url: string) => {
      if (url === 'https://metadata.example.com/nfts/0x3537') {
        return {
          name: 'Token 57',
          description: 'A collectible',
          image: 'ipfs://Qm123/57.png',
          attributes: [{ trait_type: 'rarity', value: 'rare' }],
        };
      }

      throw new Error(`Unexpected url: ${url}`);
    });

    const result = await fetchNFTsByOwner(OWNER, 'mainnet', {
      fetchJson,
      collections: [collection],
      createContract: () =>
        createMockContract(
          { tokens: ['0x3537'], uri: 'https://metadata.example.com/nfts/' },
          contractCalls,
          collection.address
        ),
    });

    expect(contractCalls).toEqual([{ collectionAddress: collection.address, owner: OWNER }]);
    expect(result).toEqual([
      {
        id: `${collection.address}:0x3537`,
        token_id: '0x3537',
        contract_id: collection.address,
        collection_name: collection.name,
        collection_address: collection.address,
        owner: OWNER,
        name: 'Token 57',
        image_url: 'https://ipfs.io/ipfs/Qm123/57.png',
        metadata: {
          name: 'Token 57',
          description: 'A collectible',
          image: 'https://ipfs.io/ipfs/Qm123/57.png',
          attributes: [{ trait_type: 'rarity', value: 'rare' }],
        },
      },
    ]);
  });

  it('returns tokens without metadata when the metadata request fails', async () => {
    const collection = KNOWN_COLLECTIONS[0];

    const result = await fetchNFTsByOwner(OWNER, 'mainnet', {
      collections: [collection],
      fetchJson: jest.fn(async () => {
        throw new Error('metadata unavailable');
      }),
      createContract: () =>
        createMockContract(
          { tokens: ['0x3537'], uri: 'https://metadata.example.com/nfts/' },
          [],
          collection.address
        ),
    });

    expect(result).toEqual([
      {
        id: `${collection.address}:0x3537`,
        token_id: '0x3537',
        contract_id: collection.address,
        collection_name: collection.name,
        collection_address: collection.address,
        owner: OWNER,
        name: undefined,
        image_url: undefined,
        metadata: undefined,
      },
    ]);
    expect(getNFTName(result[0])).toBe('#57');
  });
});

describe('groupNFTsByCollection', () => {
  it('groups tokens by collection address', () => {
    const nfts: NFT[] = [
      {
        id: 'a:0x31',
        token_id: '0x31',
        contract_id: 'a',
        collection_name: 'Alpha',
        owner: OWNER,
      },
      {
        id: 'a:0x32',
        token_id: '0x32',
        contract_id: 'a',
        collection_name: 'Alpha',
        owner: OWNER,
      },
      {
        id: 'b:0x31',
        token_id: '0x31',
        contract_id: 'b',
        collection_name: 'Beta',
        owner: OWNER,
      },
    ];

    expect(groupNFTsByCollection(nfts)).toEqual([
      {
        address: 'a',
        name: 'Alpha',
        nfts: [nfts[0], nfts[1]],
      },
      {
        address: 'b',
        name: 'Beta',
        nfts: [nfts[2]],
      },
    ]);
  });
});
