import { utils } from 'koilib';

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

jest.mock('../../../stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      accounts: [],
    }),
  },
}));

import {
  normalizeBytesInput,
  normalizeHashBytes,
  normalizeMessageForSigning,
} from '../messageSigning';

describe('messageSigning normalization', () => {
  const hashBytes = new Uint8Array(Array.from({ length: 32 }, (_, index) => index));

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
});
