import { utils } from 'koilib';

jest.mock('koilib', () => {
  const actual = jest.requireActual('koilib');

  class Signer {
    provider?: unknown;
    privateKey: string;

    constructor({ privateKey, provider }: { privateKey: string; provider?: unknown }) {
      this.privateKey = privateKey;
      this.provider = provider;
    }

    static fromWif(privateKey: string) {
      return new Signer({ privateKey });
    }

    getAddress() {
      if (this.privateKey.startsWith('a')) {
        return '1MockAddress';
      }
      if (this.privateKey.startsWith('b')) {
        return '1DifferentAddress';
      }
      return '1UnknownAddress';
    }

    async signMessage(_message: unknown) {
      return new Uint8Array([1, 2, 3]);
    }

    async signHash(_hash: Uint8Array) {
      return new Uint8Array([4, 5, 6]);
    }
  }

  class Provider {
    constructor(_rpcNodes: string[]) {}
  }

  return {
    ...actual,
    Provider,
    Signer,
  };
});

jest.mock('../../biometrics', () => ({
  requireBiometricAuth: jest.fn(async () => true),
}));

jest.mock('../../wallet', () => ({
  createWalletFromMnemonic: jest.fn(() => ({
    address: '1MockAddress',
    privateKey: 'a'.repeat(64),
  })),
}));

jest.mock('../../../stores/networkStore', () => ({
  getActiveNetworkConfig: () => ({
    rpcNodes: ['https://rpc.koinos.test'],
  }),
}));

const mockSecureStoreGetItemAsync = jest.fn();
let mockAccounts: Array<{
  id: string;
  address: string;
  derivationIndex: number;
  isImported: boolean;
}> = [];

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockSecureStoreGetItemAsync(...args),
}));

jest.mock('../../../stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      accounts: mockAccounts,
    }),
  },
}));

import {
  normalizeBytesInput,
  normalizeHashBytes,
  normalizeMessageForSigning,
  signMessageWithAuthenticatedAccount,
  withAuthenticatedAccountSigner,
} from '../messageSigning';

describe('messageSigning normalization', () => {
  const hashBytes = new Uint8Array(Array.from({ length: 32 }, (_, index) => index));

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccounts = [];
    mockSecureStoreGetItemAsync.mockReset();
    mockSecureStoreGetItemAsync.mockResolvedValue(null);
  });

  it('returns Uint8Array values unchanged', () => {
    expect(normalizeBytesInput(hashBytes)).toBe(hashBytes);
  });

  it('normalizes ArrayBuffer values into Uint8Array', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const normalized = normalizeBytesInput(bytes.buffer);

    expect(normalized).toBeInstanceOf(Uint8Array);
    expect(Array.from(normalized)).toEqual([1, 2, 3, 4]);
  });

  it('normalizes byte arrays, hex strings, base64url strings, and object-like byte maps', () => {
    expect(Array.from(normalizeBytesInput([4, 5, 6]))).toEqual([4, 5, 6]);
    expect(Array.from(normalizeBytesInput('0x0102ff'))).toEqual([1, 2, 255]);
    expect(Array.from(normalizeBytesInput(utils.encodeBase64url(new Uint8Array([7, 8, 9]))))).toEqual([7, 8, 9]);
    expect(Array.from(normalizeBytesInput({ 2: 9, 0: 7, 1: 8 }))).toEqual([7, 8, 9]);
  });

  it('rejects invalid byte-like inputs', () => {
    expect(() => normalizeBytesInput('not base64???')).toThrow(
      'Byte input must be a Uint8Array, byte array, hex string, or base64url string.'
    );
    expect(() => normalizeBytesInput({ foo: 'bar' })).toThrow(
      'Byte input must be a Uint8Array, byte array, hex string, or base64url string.'
    );
  });

  it('preserves plain string messages and normalizes byte-backed messages', () => {
    expect(normalizeMessageForSigning('hello world')).toBe('hello world');
    expect(Array.from(normalizeMessageForSigning([10, 11, 12]) as Uint8Array)).toEqual([10, 11, 12]);
  });

  it('treats bare and prefixed hex message strings as bytes', () => {
    expect(Array.from(normalizeMessageForSigning('0102ff') as Uint8Array)).toEqual([1, 2, 255]);
    expect(Array.from(normalizeMessageForSigning('0x0102ff') as Uint8Array)).toEqual([1, 2, 255]);
  });

  it('enforces exactly 32 bytes for raw hashes', () => {
    expect(Array.from(normalizeHashBytes(hashBytes))).toEqual(Array.from(hashBytes));
    expect(Array.from(normalizeHashBytes(utils.encodeBase64url(hashBytes)))).toEqual(Array.from(hashBytes));
    expect(
      Array.from(
        normalizeHashBytes(
          Array.from(hashBytes)
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('')
        )
      )
    ).toEqual(Array.from(hashBytes));
    expect(() => normalizeHashBytes(new Uint8Array([1, 2, 3]))).toThrow(
      'Raw hash requests must provide exactly 32 bytes.'
    );
  });

  it('derives HD account secrets on demand after authentication', async () => {
    const { requireBiometricAuth } = require('../../biometrics');
    const { createWalletFromMnemonic } = require('../../wallet');
    mockAccounts = [
      {
        id: 'account-1',
        address: '1MockAddress',
        derivationIndex: 4,
        isImported: false,
      },
    ];

    mockSecureStoreGetItemAsync.mockImplementation(async (key: string) => {
      if (key === 'kondor_wallet_mnemonic') {
        return 'test mnemonic words';
      }
      return null;
    });

    const callback = jest.fn(async ({ signer }: { signer: { getAddress: () => string } }) => signer.getAddress());

    await expect(
      withAuthenticatedAccountSigner(
        {
          signerAddress: '1MockAddress',
          authOperation: 'sign this transaction',
        },
        callback
      )
    ).resolves.toBe('1MockAddress');

    expect(requireBiometricAuth).toHaveBeenCalledWith('sign this transaction');
    expect(createWalletFromMnemonic).toHaveBeenCalledWith('test mnemonic words', 4);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('uses the message-specific authentication prompt by default', async () => {
    const { requireBiometricAuth } = require('../../biometrics');
    mockAccounts = [
      {
        id: 'account-1',
        address: '1MockAddress',
        derivationIndex: 0,
        isImported: false,
      },
    ];

    mockSecureStoreGetItemAsync.mockImplementation(async (key: string) =>
      key === 'kondor_wallet_mnemonic' ? 'test mnemonic words' : null
    );

    await signMessageWithAuthenticatedAccount({
      signerAddress: '1MockAddress',
      message: 'hello',
    });

    expect(requireBiometricAuth).toHaveBeenCalledWith('sign this message');
  });

  it('rejects mismatched derived signers before signing', async () => {
    const { createWalletFromMnemonic } = require('../../wallet');
    mockAccounts = [
      {
        id: 'account-1',
        address: '1ExpectedAddress',
        derivationIndex: 0,
        isImported: false,
      },
    ];

    mockSecureStoreGetItemAsync.mockImplementation(async (key: string) =>
      key === 'kondor_wallet_mnemonic' ? 'test mnemonic words' : null
    );

    createWalletFromMnemonic.mockReturnValueOnce({
      address: '1DifferentAddress',
      privateKey: 'b'.repeat(64),
    });

    await expect(
      withAuthenticatedAccountSigner(
        {
          signerAddress: '1ExpectedAddress',
        },
        async () => 'unreachable'
      )
    ).rejects.toThrow('Authenticated signer does not match the requested account.');
  });
});
