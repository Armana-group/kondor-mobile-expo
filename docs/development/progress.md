# Development Progress Summary

## Session Date: 2025-11-21

## Starting Problem
Transfer functionality was not working - could receive KOIN but not send it out.

## Issues Identified and Fixed

### 1. Incorrect Transfer Flow
**Problem:** Code was calling `koin.functions.transfer()` and expecting immediate result
**Solution:** Changed to proper koilib pattern:
```typescript
const { transaction } = await koin.functions.transfer({...});
const receipt = await transaction.send();
await transaction.wait();
```
**File:** `src/stores/koinosStore.ts`

### 2. Protobuf Extension Errors
**Problem:** `utils.tokenAbi` caused "unresolvable extensions" error in React Native
**Solution:** Created `ManualTokenContract` class that manually encodes/decodes protobuf without extensions
**Files:**
- `src/lib/manualTokenContract.ts` - Manual implementation for balance and transfer
- `src/stores/koinosStore.ts` - Updated to use ManualTokenContract

### 3. Expo Go Limitation
**Problem:** `react-native-quick-crypto` (needed for signing) doesn't work in Expo Go
**Solution:** Converted project from Expo managed to bare React Native using `expo prebuild`
**Files:**
- Generated `ios/` and `android/` native folders
- Updated `.gitignore` to commit native folders
- Updated `src/lib/crypto.ts` to conditionally load quick-crypto

### 4. @noble/secp256k1 Crypto Compatibility
**Problem:** `@noble/secp256k1` tried to use `crypto.subtle.sign()` with incompatible algorithm format
**Solution:** Configured `@noble/secp256k1` to use pure JS crypto from `@noble/hashes`
**File:** `src/lib/crypto.ts` - Override `hmacSha256` and `hmacSha256Sync`

## Current Status

### ✅ Working Features
- Wallet creation and import
- Balance fetching (using ManualTokenContract)
- Transaction preparation and signing
- Transaction submission to blockchain
- Balance display and refresh

### ✅ Technical Setup
- Bare React Native project (has ios/ and android/ folders)
- Native crypto modules compiled and working
- All polyfills configured correctly:
  - `react-native-quick-crypto` (native signing)
  - `@noble/secp256k1` (configured for pure JS HMAC)
  - `@ethersproject/shims` (ethers.js support)
  - `text-encoding-polyfill` (TextEncoder/TextDecoder)

### 🚧 Current Issue
**Mana Insufficient Error:**
```
{"error":"insufficient pending account resources","code":104}
```

**What this means:**
- Transfer code is working correctly ✅
- Transaction reaches the blockchain ✅
- Account has depleted mana (needs to regenerate)

**Mana in Koinos:**
- Mana = resource credits used for transactions
- Regenerates over time based on KOIN balance
- With 4.7 KOIN, full regeneration takes ~5 days
- Current account: `13jqmvK2NF9yGCqUWSKjVH4msTqhRM96ac`

## Code Architecture

### Stores (Zustand)
- **walletStore** (`src/stores/walletStore.ts`)
  - Manages wallet creation/import
  - Secure storage of private keys (Expo SecureStore)
  - Public data persistence (AsyncStorage)
  - Biometric authentication for sensitive operations

- **koinosStore** (`src/stores/koinosStore.ts`)
  - Blockchain operations (balance, transfer)
  - Provider and Signer management
  - Uses ManualTokenContract to avoid protobuf issues

### Core Libraries
- **manualTokenContract** (`src/lib/manualTokenContract.ts`)
  - Manual protobuf encoding/decoding
  - Methods: `getBalance()`, `transfer()`
  - Bypasses koilib's ABI system to avoid extensions errors

- **crypto** (`src/lib/crypto.ts`)
  - All crypto polyfills configuration
  - Loads react-native-quick-crypto
  - Configures @noble/secp256k1 for pure JS crypto
  - Must be imported first in App.tsx

### Screens
- **WelcomeScreen** → **CreateWalletScreen** / **ImportWalletScreen**
- **HomeScreen** → Shows balance, refresh button, send button
- **SendScreen** → Transfer form with validation

## Next Steps

### 1. Add Mana Checker (High Priority)
**What:** Display current mana before allowing transfers
**Why:** Prevents "insufficient resources" errors
**How:**
- Add `getMana()` method to koinosStore
- Use Koinos RPC: `chain.get_account_rc`
- Display mana as percentage or absolute value
- Show in HomeScreen and SendScreen
- Disable send button if mana insufficient

**Reference Implementation:**
Check `../kondor` or `../kondor-mobile` for mana checking patterns

### 2. Improve Error Handling
- Show user-friendly error messages
- Distinguish between different error types:
  - Network errors
  - Insufficient mana
  - Invalid address
  - Insufficient balance

### 3. Transaction History
- Fetch and display recent transactions
- Use Koinos account history API

### 4. Testing
- Test with different amounts
- Test with insufficient balance
- Test network error scenarios
- Test on physical device

### 5. UI/UX Improvements
- Loading states during balance refresh
- Better transaction confirmation UI
- Transaction success/failure feedback
- Copy address functionality

## Running the App

### Development
```bash
# Terminal 1 - Metro bundler
npm start

# Terminal 2 - Build and run
npm run ios        # iOS
npm run android    # Android
```

### Clean Build
```bash
npm start -- --reset-cache
npm run ios
```

## Reference Projects

### kondor-mobile (../kondor-mobile)
- Bare React Native (same structure now)
- Working transfer implementation
- Reference for patterns and implementations

### kondor (../kondor)
- Chrome extension version
- Working Koinos integration
- Reference for blockchain operations

## Key Files Modified

```
src/
├── lib/
│   ├── crypto.ts                    # ✅ Fixed - crypto polyfills config
│   ├── manualTokenContract.ts       # ✅ New - manual protobuf handling
│   └── constants.ts                 # ✅ Correct KOIN contract address
├── stores/
│   ├── koinosStore.ts              # ✅ Fixed - uses ManualTokenContract
│   └── walletStore.ts              # ✅ Working - secure key storage
└── screens/
    ├── HomeScreen.tsx              # ✅ Working - balance display
    └── SendScreen.tsx              # ✅ Working - transfer UI

ios/                                 # ✅ New - native iOS project
android/                             # ✅ New - native Android project
```

## Important Notes

1. **Never commit private keys** - They're in SecureStore only
2. **Native folders are now tracked** - Unlike managed Expo projects
3. **Metro cache may need clearing** - Use `--reset-cache` if issues
4. **Crypto polyfills must load first** - crypto.ts imported before anything else
5. **Testnet vs Mainnet** - Currently on mainnet, can switch in constants.ts

## Mana Checker Implementation Plan

### API to Use
```typescript
// Get account resource credits (mana)
await provider.call('chain.get_account_rc', {
  account: address
});

// Response format:
{
  rc: "1234567890"  // Current mana in smallest unit
}
```

### Where to Add

1. **koinosStore.ts** - Add method:
```typescript
getMana: async (address: string) => Promise<string>
```

2. **HomeScreen.tsx** - Display mana with balance:
```
Balance: 4.7 KOIN
Mana: 85% (1,234,567 / 1,450,000)
```

3. **SendScreen.tsx** - Check before send:
```typescript
// Disable send button if mana < required amount
// Show warning: "Insufficient mana, please wait X minutes"
```

### Mana Calculation
- Max mana = balance * 10^8 (KOIN has 8 decimals)
- Mana regenerates linearly over ~5 days (432,000 seconds)
- Typical transfer costs ~0.2-0.5 million mana

## Test Accounts

**Current Test Account:**
- Address: `13jqmvK2NF9yGCqUWSKjVH4msTqhRM96ac`
- Balance: 4.7 KOIN
- Status: Mana depleted (needs regeneration)

**Test Transfer Target:**
- Address: `1DTstq47k9v5dwyw8LrvZRxRX1qU5CBNJd`

## Success Criteria for Next Session

- [ ] Implement getMana() function
- [ ] Display mana in HomeScreen
- [ ] Check mana before allowing transfers
- [ ] Show estimated time until sufficient mana
- [ ] Test successful transfer with adequate mana
- [ ] Add mana regeneration info to UI

## Additional Documentation Created

- `QUICK_START.md` - How to run the app
- `RUN_INSTRUCTIONS.md` - Detailed run commands
- `EXPO_GO_LIMITATION.md` - Why we needed prebuild
- `COMPARISON.md` - Differences from kondor-mobile
- `PROGRESS.md` - This file

## Git Commits to Make

```bash
# Commit the current working state
git add -A
git commit -m "Fix transfers: prebuild + crypto config + ManualTokenContract

- Ran expo prebuild to enable react-native-quick-crypto
- Fixed transfer flow: prepare → send → wait
- Created ManualTokenContract to bypass protobuf issues
- Configured @noble/secp256k1 for pure JS crypto
- Transfer code working, blocked only by mana regeneration
- Next: Add mana checker before allowing sends"
```
