// Expo crypto setup with all necessary polyfills
// This file MUST be imported at the very top of App.tsx
import * as Crypto from 'expo-crypto';

// Polyfills for ethers.js and koilib - ORDER MATTERS!
import 'react-native-get-random-values';
import '@ethersproject/shims';
import 'text-encoding-polyfill';  // Critical for protobuf handling in koilib

// Override global crypto if needed
if (typeof global.crypto !== 'object') {
  global.crypto = {
    getRandomValues: (array: Uint8Array) => {
      const randomBytes = Crypto.getRandomBytes(array.length);
      array.set(randomBytes);
      return array;
    },
    randomUUID: () => Crypto.randomUUID()
  } as any;
}

export const setupCrypto = () => {
  console.log('Expo crypto initialized with all polyfills');
  console.log('TextEncoder available:', typeof TextEncoder !== 'undefined');
  console.log('TextDecoder available:', typeof TextDecoder !== 'undefined');
};