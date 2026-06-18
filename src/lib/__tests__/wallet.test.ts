/**
 * Golden-master / characterization tests for HD wallet derivation.
 *
 * These lock the EXACT derived address / private key / public key produced by
 * the current implementation for a known mnemonic. They exist to make the
 * ethers v5 -> v6 migration safe: if the new ethers API derives even slightly
 * different keys, these tests fail loudly. A silent change here would lock
 * users out of their funds, so do NOT update the snapshots to make a failing
 * migration pass — investigate instead.
 *
 * Mnemonic is the canonical zero-entropy BIP39 test vector, safe to hardcode.
 */
import {
  generateMnemonic,
  createWalletFromMnemonic,
  validateMnemonic,
  createWalletFromPrivateKey,
} from '../wallet';

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('HD wallet derivation (golden master)', () => {
  it('derives a stable wallet for index 0 from a known mnemonic', () => {
    const wallet = createWalletFromMnemonic(TEST_MNEMONIC, 0);
    expect(wallet).toMatchInlineSnapshot(`
{
  "address": "1DFF1akeStY8SfomzFsSYsZPesQcbnF1vR",
  "privateKey": "8ea6ae17116de6f1ff624ca6ac3556c5efa587243a3abe0138e495932b24b310",
  "publicKey": Uint8Array [
    2,
    213,
    199,
    6,
    55,
    233,
    39,
    190,
    131,
    142,
    31,
    27,
    12,
    237,
    62,
    169,
    116,
    164,
    251,
    39,
    231,
    158,
    39,
    53,
    237,
    100,
    152,
    107,
    24,
    7,
    254,
    110,
    7,
  ],
}
`);
  });

  it('derives a stable wallet for index 1 from a known mnemonic', () => {
    const wallet = createWalletFromMnemonic(TEST_MNEMONIC, 1);
    expect(wallet).toMatchInlineSnapshot(`
{
  "address": "15n9ZbL3xmLBCUFtVQUzXKox5WhFnyAba3",
  "privateKey": "de8f15499b49db732f959ea84573d071de3fa04ae18529dca5893e2b9b25bf36",
  "publicKey": Uint8Array [
    3,
    162,
    160,
    227,
    158,
    150,
    142,
    98,
    206,
    156,
    205,
    63,
    1,
    50,
    8,
    201,
    55,
    66,
    199,
    249,
    227,
    7,
    242,
    101,
    89,
    214,
    48,
    38,
    66,
    1,
    138,
    40,
    194,
  ],
}
`);
  });

  it('derives the same wallet on repeated calls (deterministic)', () => {
    const a = createWalletFromMnemonic(TEST_MNEMONIC, 0);
    const b = createWalletFromMnemonic(TEST_MNEMONIC, 0);
    expect(a).toEqual(b);
  });
});

describe('validateMnemonic', () => {
  it('accepts a valid mnemonic', () => {
    expect(validateMnemonic(TEST_MNEMONIC)).toBe(true);
  });

  it('rejects an invalid mnemonic', () => {
    expect(validateMnemonic('not a real mnemonic phrase at all')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(validateMnemonic('')).toBe(false);
  });
});

describe('generateMnemonic', () => {
  it('produces a valid 12-word mnemonic', () => {
    const phrase = generateMnemonic();
    expect(phrase.split(' ')).toHaveLength(12);
    expect(validateMnemonic(phrase)).toBe(true);
  });

  it('produces a different mnemonic each call', () => {
    expect(generateMnemonic()).not.toBe(generateMnemonic());
  });
});

describe('createWalletFromPrivateKey', () => {
  it('round-trips the private key derived from a mnemonic', () => {
    const fromMnemonic = createWalletFromMnemonic(TEST_MNEMONIC, 0);
    const fromKey = createWalletFromPrivateKey(fromMnemonic.privateKey);
    expect(fromKey.address).toBe(fromMnemonic.address);
    // publicKey is a Uint8Array — compare by value, not reference
    expect(fromKey.publicKey).toEqual(fromMnemonic.publicKey);
  });

  it('throws on an invalid private key', () => {
    // 64 chars routes to new Signer(), which validates hex and rejects non-hex
    expect(() => createWalletFromPrivateKey('g'.repeat(64))).toThrow('Invalid private key');
  });
});
