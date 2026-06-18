import { Wallet, Mnemonic, HDNodeWallet } from 'ethers';
import { Signer } from 'koilib';
import { KOINOS_PATH } from './constants';

/**
 * Generate a new random mnemonic phrase (12 words)
 */
export const generateMnemonic = (): string => {
  const wallet = Wallet.createRandom();
  // createRandom() always produces a mnemonic; assert for the type checker
  return wallet.mnemonic!.phrase;
};

/**
 * Create a wallet from a mnemonic phrase
 * @param mnemonic - The 12-word mnemonic phrase
 * @param index - The account index (default: 0)
 * @returns Object containing address, private key, and public key
 */
export const createWalletFromMnemonic = (mnemonic: string, index: number = 0) => {
  // BIP44 path for Koinos (SLIP44: 659)
  // Build the master node at "m" so derivePath() can take an absolute path,
  // matching the ethers v5 HDNode.fromMnemonic(...).derivePath(...) behavior.
  const root = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), 'm');
  const path = `${KOINOS_PATH}${index}'/0/0`;
  const child = root.derivePath(path);

  // Create Koinos signer
  const signer = new Signer({
    privateKey: child.privateKey.slice(2) // Remove 0x prefix
  });

  // For some reason getPrivateKey('wif', false) might return hex
  // So we'll store the hex and handle conversion in koinosStore
  const privateKeyHex = child.privateKey.slice(2);

  return {
    address: signer.getAddress(),
    privateKey: privateKeyHex, // Store as hex, will be converted as needed
    publicKey: signer.publicKey
  };
};

/**
 * Validate a mnemonic phrase
 * @param mnemonic - The mnemonic phrase to validate
 * @returns true if valid, false otherwise
 */
export const validateMnemonic = (mnemonic: string): boolean => {
  try {
    Mnemonic.fromPhrase(mnemonic);
    return true;
  } catch {
    return false;
  }
};

/**
 * Create a wallet from a private key (WIF format)
 * @param privateKey - The private key in WIF format
 * @returns Object containing address and public key
 */
export const createWalletFromPrivateKey = (privateKey: string) => {
  try {
    // Handle both WIF and hex input formats
    const signer = privateKey.length === 64
      ? new Signer({ privateKey })
      : Signer.fromWif(privateKey);

    // Always store as hex for consistency
    const hexKey = signer.getPrivateKey(); // Default is hex

    return {
      address: signer.getAddress(),
      privateKey: hexKey, // Store as hex
      publicKey: signer.publicKey
    };
  } catch (error) {
    throw new Error('Invalid private key');
  }
};