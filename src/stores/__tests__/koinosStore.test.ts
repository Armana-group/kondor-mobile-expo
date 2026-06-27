const mockProviderConstructor = jest.fn();
const mockSignerFromWif = jest.fn();
const mockManualTokenContractConstructor = jest.fn();
const mockManualGetBalance = jest.fn();
const mockManualTransfer = jest.fn();

jest.mock('koilib', () => ({
  Provider: jest.fn(function MockProvider(this: any, rpcNodes: string[]) {
    this.rpcNodes = rpcNodes;
    this.call = jest.fn();
    mockProviderConstructor(rpcNodes);
  }),
  Signer: Object.assign(
    jest.fn(function MockSigner(this: any, options: any) {
      this.privateKey = options.privateKey;
      this.provider = options.provider;
      this.getAddress = jest.fn(() => '1MockSignerAddress');
    }),
    {
      fromWif: mockSignerFromWif,
    }
  ),
  Contract: jest.fn(),
  utils: {
    parseUnits: jest.fn((value: string) => value),
  },
}));

jest.mock('../../lib/manualTokenContract', () => ({
  ManualTokenContract: jest.fn(function MockManualTokenContract(
    this: any,
    contractId: string,
    provider: unknown
  ) {
    this.contractId = contractId;
    this.provider = provider;
    this.getBalance = mockManualGetBalance;
    this.transfer = mockManualTransfer;
    mockManualTokenContractConstructor(contractId, provider);
  }),
}));

const mockWalletState = {
  activeAccountId: 'account-1',
  accounts: [
    {
      id: 'account-1',
      name: 'Account 1',
      address: '1HWXa4xwwf5B2csdkiUgpCZZjjGA8q6HUy',
      derivationIndex: 0,
      isImported: false,
    },
  ],
};

jest.mock('../walletStore', () => ({
  useWalletStore: {
    getState: jest.fn(() => mockWalletState),
  },
}));

jest.mock('../networkStore', () => ({
  getActiveNetworkConfig: jest.fn(() => ({
    chainId: 'EiBZK_G98e6wv7EXHtkHB4-wW7nxD4vX34t9JKD9P52OlA==',
    rpcNodes: ['https://api.koinos.io'],
    koinContract: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
    isTestnet: false,
  })),
}));

describe('koinosStore provider initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const secureStore = require('expo-secure-store');
    secureStore.__store.clear();
    mockManualGetBalance.mockResolvedValue('42.00000000');
    mockManualTransfer.mockResolvedValue({ transactionId: '0xsend' });
    mockSignerFromWif.mockReturnValue({
      provider: null,
      getAddress: jest.fn(() => '1MockSignerAddress'),
    });

    const { useKoinosStore } = require('../koinosStore');
    useKoinosStore.getState().reset();
  });

  it('allows public balance reads when the active account secret is missing', async () => {
    const { useKoinosStore } = require('../koinosStore');

    await expect(
      useKoinosStore.getState().getBalance('1HWXa4xwwf5B2csdkiUgpCZZjjGA8q6HUy')
    ).resolves.toBe('42.00000000');

    expect(mockProviderConstructor).toHaveBeenCalledWith(['https://api.koinos.io']);
    expect(mockManualTokenContractConstructor).toHaveBeenCalledWith(
      '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
      expect.objectContaining({ rpcNodes: ['https://api.koinos.io'] })
    );
    expect(mockManualGetBalance).toHaveBeenCalledWith(
      '1HWXa4xwwf5B2csdkiUgpCZZjjGA8q6HUy'
    );
  });

  it('still requires a private key for transfers', async () => {
    const { useKoinosStore } = require('../koinosStore');

    await expect(
      useKoinosStore.getState().transfer('14eKAYooeMEPi2G1hYxof7Ud8r7cRk67Q6', '1')
    ).rejects.toThrow('No private key found');
  });

  it('passes memo through token transfers without caching the signer', async () => {
    const secureStore = require('expo-secure-store');
    secureStore.__store.set('kondor_pk_account-1', 'test-wif');
    const { useKoinosStore } = require('../koinosStore');

    await expect(
      useKoinosStore.getState().transferToken(
        'token-contract',
        '14eKAYooeMEPi2G1hYxof7Ud8r7cRk67Q6',
        '1',
        8,
        {
          memo: 'Invoice 42',
        }
      )
    ).resolves.toBe('0xsend');

    expect(mockManualTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({ rpcNodes: ['https://api.koinos.io'] }),
      }),
      '14eKAYooeMEPi2G1hYxof7Ud8r7cRk67Q6',
      '1',
      expect.objectContaining({
        decimals: 8,
        memo: 'Invoice 42',
      })
    );
  });
});
