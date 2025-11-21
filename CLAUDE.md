# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kondor Mobile is a React Native Expo application for the Koinos blockchain ecosystem. It's a non-custodial cryptocurrency wallet that allows users to manage their Koinos (KOIN) assets on mobile devices.

## Documentation

**All project documentation is in the `/docs` directory:**
- **Current Status:** See `/docs/development/progress.md` for latest work and current state
- **Next Tasks:** See `/docs/development/todo.md` for priority tasks
- **Architecture:** See `/docs/architecture/architecture-overview.md` for system design
- **Getting Started:** See `/docs/getting-started/` for setup instructions

**Before starting work, always read:**
1. `/docs/development/progress.md` - Understand current state
2. `/docs/development/todo.md` - Know what needs to be done
3. `/docs/architecture/architecture-overview.md` - Understand the codebase

## Reference Codebases

When developing features, reference these existing implementations:

### Primary Reference: Kondor Chrome Extension
- **Location**: `../kondor`
- **Status**: Currently functioning on Koinos network
- **Usage**: This is the primary reference for implementation patterns, as it's a working Kondor wallet
- **Key Areas to Reference**:
  - Transaction signing and broadcasting logic
  - Wallet management patterns
  - Network interaction patterns
  - Security implementations

### Secondary Reference: Kondor3 Chrome Extension
- **Location**: `/Users/ron/devstuff/projects/armana/apps/kondor3`
- **Status**: Modern, actively developed Chrome extension
- **Usage**: Excellent reference for transaction history, backup systems, and multi-account support
- **Analysis**: See `/docs/architecture/kondor3-analysis.md` for detailed breakdown
- **Key Areas to Reference**:
  - Transaction history API integration
  - HDKoinos class for multi-account HD wallet
  - Backup/recovery system with encryption
  - Token management and KoinDX integration
  - Custom error types and security patterns
- **Note**: Kondor Mobile has MORE ADVANCED mana handling than kondor3 (they use hardcoded RC limits)

### Tertiary Reference: Kondor Mobile (Old)
- **Location**: `../kondor-mobile`
- **Status**: Abandoned project (not updated)
- **Usage**: Tertiary reference for mobile-specific patterns
- **Note**: While outdated, it may contain useful mobile UI/UX patterns and React Native implementations

**Important**: Priority order for references:
1. **Kondor Extension** (`../kondor`) - Primary for blockchain operations and patterns
2. **Kondor3** (`../armana/apps/kondor3`) - Secondary for transaction history, backup, multi-account
3. **Old Kondor Mobile** (`../kondor-mobile`) - Tertiary for React Native mobile patterns only

## Development Commands

### Local Development
- `npm start` or `npx expo start` - Start the Expo development server
- `npx expo start --clear` - Start with cache cleared
- `npm run ios` - Open in iOS simulator
- `npm run android` - Open in Android emulator
- `npm run web` - Open in web browser

### Build Commands (using EAS)
- `eas build --platform ios --profile development` - Build development version for iOS
- `eas build --platform android --profile development` - Build development APK
- `eas build --platform ios --profile preview` - Build preview version for iOS
- `eas build --platform android --profile preview` - Build preview APK
- `eas build --platform ios --profile production` - Build production version for iOS
- `eas build --platform android --profile production` - Build production app bundle

### Testing
No test commands configured yet. Tests should be added as the project grows.

## Architecture Overview

### Core Technologies
- **React Native** with **Expo SDK 54** - Mobile app framework
- **TypeScript** - Type safety with strict mode enabled
- **Koilib** - Koinos blockchain JavaScript library for wallet operations
- **Ethers.js v5** - For mnemonic generation and HD wallet derivation
- **Zustand** - State management with persistence
- **React Navigation** - Navigation with native stack navigator

### Project Structure

```
src/
├── navigation/       # Navigation configuration
│   └── AppNavigator.tsx - Main navigation stack (auth flow vs main app)
├── screens/          # Screen components
│   ├── WelcomeScreen.tsx
│   ├── CreateWalletScreen.tsx
│   ├── ImportWalletScreen.tsx
│   ├── HomeScreen.tsx
│   └── SendScreen.tsx
├── components/       # Reusable UI components
│   ├── Button.tsx
│   ├── Input.tsx
│   └── Screen.tsx
├── stores/           # Zustand state stores
│   ├── walletStore.ts - Wallet management & secure storage
│   └── koinosStore.ts - Koinos blockchain interactions
└── lib/              # Core utilities
    ├── wallet.ts - Wallet creation/import logic
    ├── crypto.ts - Cryptographic polyfills setup
    ├── biometrics.ts - Biometric authentication
    ├── haptics.ts - Haptic feedback utilities
    ├── constants.ts - App constants & network config
    └── utils.ts - General utilities
```

### Key Architectural Patterns

#### 1. Dual-Store Architecture
The app separates concerns between wallet management and blockchain operations:
- **walletStore**: Handles secure storage of private keys/mnemonics, wallet creation/import, and biometric-protected access to sensitive data
- **koinosStore**: Manages blockchain connections, balance queries, and transaction sending

#### 2. Security Architecture
- Private keys and mnemonics stored in **Expo SecureStore** (encrypted storage)
- Public data (address, balance) stored in **AsyncStorage** via Zustand persistence
- Biometric authentication required before accessing private keys or mnemonics
- HD wallet derivation using BIP44 path for Koinos (m/44'/659'/0'/0/0)

#### 3. Navigation Flow
- Conditional navigation based on wallet existence
- Auth stack (Welcome → Create/Import) for new users
- Main stack (Home → Send) for returning users
- Modal presentation for the Send screen

#### 4. Koinos Integration
- Uses **koilib** for all blockchain operations
- Multi-node provider configuration for reliability
- Default network points to Koinos mainnet
- Transaction signing handled via Signer class with secure key retrieval

### Important Implementation Details

1. **Crypto Polyfills**: The app imports polyfills in `src/lib/crypto.ts` early in App.tsx to enable crypto operations in React Native environment

2. **Private Key Storage**: Private keys are stored as hex format (64 chars) in SecureStore but the app can handle both hex and WIF formats for compatibility

3. **Mnemonic Handling**: Uses ethers.js for BIP39 mnemonic generation and validation, then derives Koinos keys using the correct derivation path

4. **Biometric Protection**: Access to sensitive data (private keys, mnemonics) always requires biometric authentication via `requireBiometricAuth()`

5. **Network Configuration**: Default RPC nodes and contract addresses are defined in `src/lib/constants.ts` - modify these for testnet development

## Dependencies to Note

- **react-native-quick-crypto**: Provides native crypto implementations
- **expo-secure-store**: Encrypted storage for sensitive data
- **expo-local-authentication**: Biometric authentication support
- **expo-haptics**: Native haptic feedback
- **@ethersproject/shims**: Ethereum library polyfills for React Native