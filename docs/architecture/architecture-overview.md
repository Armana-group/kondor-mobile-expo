# Architecture Overview

## Project Type

**Bare React Native with Expo**
- Started as Expo managed, converted to bare workflow via `expo prebuild`
- Has native `ios/` and `android/` folders
- Uses Expo modules for cross-platform APIs
- Native modules (like react-native-quick-crypto) work natively

## Tech Stack

### Core
- **React Native** 0.81.5
- **Expo SDK** 54
- **TypeScript** with strict mode
- **Zustand** for state management

### Blockchain
- **koilib** 9.1.0 - Koinos blockchain library
- **ethers.js** 5.8.0 - Mnemonic generation and HD wallets
- **@noble/secp256k1** - Elliptic curve cryptography
- **@noble/hashes** - Cryptographic hash functions

### Crypto & Polyfills
- **react-native-quick-crypto** - Native crypto.subtle implementation
- **@ethersproject/shims** - Ethereum library polyfills
- **react-native-get-random-values** - Crypto.getRandomValues
- **text-encoding-polyfill** - TextEncoder/TextDecoder
- **protobufjs** - Protocol buffers (manual encoding)

### Storage & Security
- **Expo SecureStore** - Encrypted storage for private keys
- **AsyncStorage** - Public data persistence
- **Expo Local Authentication** - Biometric authentication

### Navigation
- **React Navigation** - Native stack navigator
- Conditional navigation based on wallet state

## Directory Structure

```
src/
├── components/         # Reusable UI components
│   ├── Button.tsx
│   ├── Input.tsx
│   └── Screen.tsx
├── lib/               # Core utilities and helpers
│   ├── crypto.ts              # Crypto polyfills setup
│   ├── manualTokenContract.ts # Custom contract implementation
│   ├── wallet.ts              # Wallet creation/import
│   ├── biometrics.ts          # Biometric auth helpers
│   ├── haptics.ts             # Haptic feedback
│   ├── constants.ts           # Network config & constants
│   └── utils.ts               # General utilities
├── navigation/        # Navigation configuration
│   └── AppNavigator.tsx       # Main navigation stack
├── screens/           # Screen components
│   ├── WelcomeScreen.tsx
│   ├── CreateWalletScreen.tsx
│   ├── ImportWalletScreen.tsx
│   ├── HomeScreen.tsx
│   └── SendScreen.tsx
└── stores/            # Zustand state management
    ├── walletStore.ts         # Wallet & key management
    └── koinosStore.ts         # Blockchain operations
```

## Key Architectural Patterns

### 1. Dual-Store Architecture

**walletStore** (Secure Data)
- Manages wallet creation/import
- Stores private keys in SecureStore
- Handles biometric authentication
- Persists public data (address, balance)

**koinosStore** (Blockchain Operations)
- Manages Provider and Signer
- Handles balance queries
- Executes transactions
- Uses ManualTokenContract

**Why separated?**
- Clear separation of concerns
- Security isolation
- Different persistence strategies

### 2. Manual Protobuf Encoding

**Problem:** koilib's `utils.tokenAbi` uses protobuf extensions that don't work in React Native

**Solution:** ManualTokenContract class
- Manually encodes arguments using protobufjs
- Bypasses ABI system entirely
- Direct RPC calls with manual encoding/decoding

```typescript
class ManualTokenContract {
  // Balance: Manual protobuf encoding
  private encodeBalanceOfArgs(address: string): Uint8Array

  // Balance: Manual protobuf decoding
  private decodeBalanceOfResult(data: Uint8Array): string

  // Transfer: Manual protobuf encoding
  private encodeTransferArgs(from, to, value): Uint8Array

  // Public methods
  async getBalance(address: string): Promise<string>
  async transfer(signer, to, amount, options): Promise<{ transactionId }>
}
```

### 3. Security Architecture

**Private Key Storage:**
```
Mnemonic → HD Wallet Derivation → Private Key
    ↓             ↓                    ↓
SecureStore   SecureStore         SecureStore
(encrypted)   (encrypted)         (encrypted)
    ↓             ↓                    ↓
Biometric    Biometric           Biometric
Required     Required            Required
```

**Public Data Storage:**
```
Address, Balance → AsyncStorage → Zustand Persistence
(not sensitive)     (unencrypted)  (fast access)
```

### 4. Transaction Flow

```
User Action (SendScreen)
    ↓
Validate Form
    ↓
Confirm (Alert.alert)
    ↓
koinosStore.transfer()
    ↓
ManualTokenContract.transfer()
    ↓
1. Encode transfer args (protobuf)
2. Create Transaction
3. Add operation
4. Sign (uses Signer with private key)
5. Send to network
6. Wait for confirmation
    ↓
Update Balance
    ↓
Show Success/Failure
```

### 5. Crypto Polyfills Setup

**Load Order (CRITICAL):**
```typescript
// 1. FIRST - crypto.ts imported at top of App.tsx
import './src/lib/crypto';

// 2. Inside crypto.ts (ORDER MATTERS):
import 'react-native-get-random-values';  // First
import '@ethersproject/shims';            // Second
import 'text-encoding-polyfill';          // Third
require('react-native-quick-crypto').install();  // Fourth

// 3. Configure @noble/secp256k1
secp.utils.hmacSha256 = (custom pure JS implementation)
```

**Why this order?**
- get-random-values must be first (other libs depend on it)
- @ethersproject/shims needs random values
- text-encoding needed by protobuf
- quick-crypto provides crypto.subtle
- @noble config must happen before koilib loads

## State Management

### walletStore State
```typescript
{
  // Persisted in AsyncStorage
  address: string
  balance: string
  isWalletCreated: boolean

  // Not persisted (in SecureStore)
  // privateKey: accessed via getPrivateKey()
  // mnemonic: accessed via getMnemonic()
}
```

### koinosStore State
```typescript
{
  provider: Provider | null        // Koinos RPC provider
  signer: Signer | null           // Transaction signer
  isInitialized: boolean
  isLoading: boolean
  error: string | null
}
```

## Network Configuration

```typescript
// src/lib/constants.ts
export const MAINNET = {
  chainId: 'EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==',
  name: 'Mainnet',
  rpcNodes: [
    'https://api.koinos.io',
    'https://api.koinosblocks.com'
  ],
  koinContract: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK'
}

export const DEFAULT_NETWORK = MAINNET;
export const DEFAULT_RC_LIMIT = 1000000000; // Mana limit
```

## HD Wallet Derivation

```typescript
// BIP44 path for Koinos: m/44'/659'/0'/0/0
const KOINOS_PATH = "m/44'/659'/";

// Derivation flow:
Mnemonic (12/24 words)
    ↓ (ethers.js)
HDNode
    ↓ (derivePath)
Child at m/44'/659'/0'/0/0
    ↓
Private Key (hex)
    ↓ (koilib Signer)
Address + Public Key
```

## Error Handling Strategy

### Network Errors
- Try multiple RPC nodes
- Show user-friendly messages
- Retry logic for transient failures

### Blockchain Errors
- Parse error codes (e.g., code 104 = insufficient mana)
- Show specific error messages
- Guide user to resolution

### Crypto Errors
- Validate mnemonics before use
- Handle signing failures gracefully
- Clear error messages for key issues

## Performance Considerations

### Balance Queries
- Manual protobuf encoding (faster than ABI)
- Direct RPC calls
- Cached in state

### Transaction Signing
- Native crypto (react-native-quick-crypto)
- Async operations don't block UI
- Loading states throughout

### State Persistence
- Public data: AsyncStorage (fast)
- Private data: SecureStore (secure)
- Only persist necessary data

## Security Best Practices

1. **Private keys never leave SecureStore** except for signing
2. **Biometric auth required** for key access
3. **No logging** of sensitive data
4. **WIF format never displayed** to user
5. **Mnemonic shown only once** during creation
6. **No network transmission** of keys

## Testing Strategy

### Manual Testing
- Create wallet flow
- Import wallet flow
- Balance display
- Transfer execution
- Error handling

### Test Accounts
- Maintain test account on mainnet/testnet
- Document test addresses
- Track mana levels

## Future Improvements

### Planned
1. Mana checker (HIGH PRIORITY)
2. Transaction history
3. Multiple accounts
4. Token support (beyond KOIN)
5. QR code scanning

### Possible
- Hardware wallet support
- WalletConnect integration
- dApp browser
- Staking interface
- Governance participation

## Dependencies on Reference Projects

### kondor-mobile (../kondor-mobile)
- Transfer implementation pattern
- Store architecture
- Screen layouts

### kondor (../kondor)
- Blockchain operations
- Contract interactions
- Network configuration

## Build Configuration

### iOS (ios/KondorMobile.xcworkspace)
- CocoaPods for dependencies
- react-native-quick-crypto compiled natively
- Expo modules linked

### Android (android/)
- Gradle build system
- Native modules linked
- Proper permissions configured

## Common Issues & Solutions

### Issue: Protobuf extensions error
**Solution:** Use ManualTokenContract

### Issue: crypto.subtle undefined
**Solution:** Use bare React Native (not Expo Go)

### Issue: Signature algorithm error
**Solution:** Configure @noble/secp256k1 for pure JS crypto

### Issue: Insufficient mana
**Solution:** Wait for regeneration or implement mana checker

## Resources

- [Koinos Docs](https://docs.koinos.io/)
- [koilib GitHub](https://github.com/joticajulian/koilib)
- [React Native Docs](https://reactnative.dev/)
- [Expo Docs](https://docs.expo.dev/)
