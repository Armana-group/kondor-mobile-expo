// Expo crypto setup with polyfills
// This file MUST be imported at the very top of App.tsx

// Polyfills for ethers.js and koilib - ORDER MATTERS!
import 'react-native-get-random-values';
import '@ethersproject/shims';
import 'text-encoding-polyfill';  // Critical for protobuf handling in koilib

import { cryptoLogger } from './logger';

// Try to import react-native-quick-crypto if available (not in Expo Go)
// This will work in development builds and bare workflow
let quickCryptoAvailable = false;
try {
  const { install } = require('react-native-quick-crypto');
  install();
  quickCryptoAvailable = true;
  cryptoLogger.debug('react-native-quick-crypto installed successfully');
} catch (error) {
  cryptoLogger.debug('Running in Expo Go - quick-crypto not available');
}

// Configure @noble/secp256k1 to use pure JS crypto instead of crypto.subtle
// This avoids compatibility issues with react-native-quick-crypto's subtle implementation
try {
  const secp = require('@noble/secp256k1');
  const { hmac } = require('@noble/hashes/hmac');
  const { sha256 } = require('@noble/hashes/sha256');

  // Provide pure JS HMAC implementation to @noble/secp256k1 (both sync and async)
  const hmacSha256Implementation = (key: Uint8Array, ...messages: Uint8Array[]) => {
    return hmac(sha256, key, secp.utils.concatBytes(...messages));
  };

  // Override both sync and async versions
  secp.utils.hmacSha256Sync = hmacSha256Implementation;
  secp.utils.hmacSha256 = async (key: Uint8Array, ...messages: Uint8Array[]) => {
    return hmacSha256Implementation(key, ...messages);
  };

  cryptoLogger.debug('Configured @noble/secp256k1 to use pure JS crypto');
} catch (error) {
  cryptoLogger.warn('Could not configure @noble/secp256k1:', error);
}

export const setupCrypto = () => {
  cryptoLogger.debug('Polyfills initialized');
  cryptoLogger.debug('Quick Crypto:', quickCryptoAvailable ? 'ENABLED' : 'DISABLED (Expo Go)');
  cryptoLogger.debug('getRandomValues available:', typeof global.crypto?.getRandomValues !== 'undefined');
  cryptoLogger.debug('crypto.subtle available:', typeof global.crypto?.subtle !== 'undefined');

  if (typeof global.crypto?.subtle === 'undefined') {
    cryptoLogger.warn('crypto.subtle not available — transfers require a development build');
  }
};
