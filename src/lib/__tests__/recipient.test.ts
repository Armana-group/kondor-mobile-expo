const mockFetchAbi = jest.fn(async () => ({}));
const mockGetAddress = jest.fn();
const mockOwnerOf = jest.fn();
const mockContract = jest.fn(function MockContract(this: any, config: any) {
  this.config = config;
  this.fetchAbi = mockFetchAbi;
  this.functions = {
    get_address: mockGetAddress,
    owner_of: mockOwnerOf,
  };
});
const mockProvider = jest.fn(function MockProvider(this: any, rpcNodes: string[]) {
  this.rpcNodes = rpcNodes;
});

jest.mock('koilib', () => ({
  Provider: mockProvider,
  Contract: mockContract,
  utils: {
    isChecksumAddress: jest.fn((value: string) => /^1[1-9A-HJ-NP-Za-km-z]{32,34}$/.test(value)),
  },
}));

describe('recipient resolution', () => {
  const address = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockFetchAbi.mockResolvedValue({});
    mockGetAddress.mockReset();
    mockOwnerOf.mockReset();
  });

  it('accepts a raw Koinos address without loading name contracts', async () => {
    const { resolveRecipient } = require('../recipient');

    await expect(resolveRecipient(`  ${address}  `, 'mainnet')).resolves.toEqual({
      input: address,
      address,
      source: 'address',
      label: 'Valid Koinos address',
    });
    expect(mockContract).not.toHaveBeenCalled();
  });

  it('resolves @nickname through the mainnet nickname contract', async () => {
    mockGetAddress.mockResolvedValue({ result: { value: address } });
    const { resolveRecipient } = require('../recipient');

    await expect(resolveRecipient('@alice', 'mainnet')).resolves.toEqual({
      input: 'alice',
      address,
      source: 'nickname',
      label: `@alice resolves to ${address}`,
    });

    expect(mockContract).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '1KD9Es7LBBjA1FY3ViCgQJ7e6WH1ipKbhz',
      })
    );
    expect(mockGetAddress).toHaveBeenCalledWith({ value: 'alice' });
  });

  it('falls back from nickname to kap:// name ownership on mainnet', async () => {
    mockGetAddress.mockResolvedValue({ result: { value: null } });
    mockOwnerOf.mockResolvedValue({ result: { value: address } });
    const { resolveRecipient } = require('../recipient');

    await expect(resolveRecipient('kap://alice', 'mainnet')).resolves.toEqual({
      input: 'alice',
      address,
      source: 'kap',
      label: `kap://alice resolves to ${address}`,
    });

    expect(mockContract).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: '13tmzDmfqCsbYT26C4CmKxq86d33senqH3',
      })
    );
    expect(mockOwnerOf).toHaveBeenCalledWith({
      token_id: '0x616c696365',
    });
  });

  it('fails closed when the active network has no recipient resolver contract', async () => {
    const { resolveRecipient } = require('../recipient');

    await expect(resolveRecipient('@alice', 'harbinger')).resolves.toBeNull();
    await expect(resolveRecipient('kap://alice', 'harbinger')).resolves.toBeNull();
    expect(mockGetAddress).not.toHaveBeenCalled();
    expect(mockOwnerOf).not.toHaveBeenCalled();
  });
});
