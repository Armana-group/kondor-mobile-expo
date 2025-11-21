// Expo crypto setup with polyfills
// This file MUST be imported at the very top of App.tsx

// Polyfills for ethers.js and koilib - ORDER MATTERS!
import 'react-native-get-random-values';
import '@ethersproject/shims';
import 'text-encoding-polyfill';  // Critical for protobuf handling in koilib

// Try to import react-native-quick-crypto if available (not in Expo Go)
// This will work in development builds and bare workflow
let quickCryptoAvailable = false;
try {
  const { install } = require('react-native-quick-crypto');
  install();
  quickCryptoAvailable = true;
  console.log('[Crypto] react-native-quick-crypto installed successfully');
} catch (error) {
  console.log('[Crypto] Running in Expo Go - quick-crypto not available');
  console.log('[Crypto] See EXPO_GO_LIMITATION.md for instructions to enable transfers');
}

export const setupCrypto = () => {
  console.log('[Crypto] Polyfills initialized');
  console.log('[Crypto] Quick Crypto:', quickCryptoAvailable ? 'ENABLED' : 'DISABLED (Expo Go)');
  console.log('[Crypto] getRandomValues available:', typeof global.crypto?.getRandomValues !== 'undefined');
  console.log('[Crypto] crypto.subtle available:', typeof global.crypto?.subtle !== 'undefined');
  console.log('[Crypto] TextEncoder available:', typeof TextEncoder !== 'undefined');
  console.log('[Crypto] TextDecoder available:', typeof TextDecoder !== 'undefined');

  // Log warning if crypto.subtle is not available
  if (typeof global.crypto?.subtle === 'undefined') {
    console.error('');
    console.error('═══════════════════════════════════════════════════════');
    console.error('  ⚠️  CRYPTO.SUBTLE NOT AVAILABLE');
    console.error('═══════════════════════════════════════════════════════');
    console.error('  Transfers will NOT work in Expo Go!');
    console.error('  ');
    console.error('  To enable transfers, build a development build:');
    console.error('  1. npm install -g eas-cli');
    console.error('  2. eas build --profile development --platform ios');
    console.error('  3. Install the build on your device');
    console.error('  4. npm start --dev-client');
    console.error('  ');
    console.error('  See EXPO_GO_LIMITATION.md for details');
    console.error('═══════════════════════════════════════════════════════');
    console.error('');
  }
};