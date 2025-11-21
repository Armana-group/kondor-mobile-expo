// Expo crypto setup with all necessary polyfills
// This file MUST be imported at the very top of App.tsx

// CRITICAL: Import react-native-quick-crypto FIRST before anything else
// This provides full crypto.subtle API needed for koilib signatures
import { install } from 'react-native-quick-crypto';
install();

// Polyfills for ethers.js and koilib - ORDER MATTERS!
import 'react-native-get-random-values';
import '@ethersproject/shims';
import 'text-encoding-polyfill';  // Critical for protobuf handling in koilib

export const setupCrypto = () => {
  console.log('[Crypto] Polyfills initialized');
  console.log('[Crypto] crypto.subtle available:', typeof global.crypto?.subtle !== 'undefined');
  console.log('[Crypto] crypto.getRandomValues available:', typeof global.crypto?.getRandomValues !== 'undefined');
  console.log('[Crypto] TextEncoder available:', typeof TextEncoder !== 'undefined');
  console.log('[Crypto] TextDecoder available:', typeof TextDecoder !== 'undefined');
};