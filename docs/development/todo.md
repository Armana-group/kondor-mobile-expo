# Development TODO

## Status: Phase 8 Complete - Ready for Phase 9 (dApps Browser)

### ✅ Completed (2025-12-07 - Build & Bug Fixes)
- ✅ iOS build pipeline fixed (prebuild, pods, signing, local network)
- ✅ QR Scanner CameraView warning fix (sibling positioning)
- ✅ HomeScreen auto-refresh bug fix (silent vs manual refresh)

### ✅ Completed (UI Polish)
- ✅ Status bar fix (light content on dark background)
- ✅ Header layout fix (icons no longer cut off)
- ✅ Navigation restructure (Activity moved to HomeScreen actions)
- ✅ Bottom tabs reduced to 4: Home, Collectibles, Swap, Browser
- ✅ TokenDetailScreen horizontal layout (icon left of name)
- ✅ AccountSwitcher inline editing with confirm button

### ✅ Completed (Phase 7.5)
- ✅ Multi-token transfers (all 31 tokens, not just KOIN)
- ✅ Receive screen with QR code
- ✅ Multi-account support (HD derivation + private key import)
- ✅ Account switcher with rename/remove
- ✅ Copy address and share functionality

### ✅ Completed (Phase 7)
- ✅ Token store with KoinDX integration
- ✅ Multi-token balance display (31 tokens)
- ✅ Token detail screen with filtered transactions
- ✅ Token picker in SendScreen
- ✅ Transaction history multi-token support
- ✅ Token icons in Activity screen
- ✅ Explorer links (koiner.app)

### ✅ Completed (Phase 6)
- ✅ Bottom tab navigation (4 tabs)
- ✅ Contact management (add/edit/delete)
- ✅ Settings screen with seed/key export
- ✅ Real device testing (iOS mainnet transfer)

### ✅ Completed (Phase 1-5)
- ✅ Wallet creation and import
- ✅ Mana checking with reserved RC
- ✅ Dynamic RC estimation via dry-run
- ✅ KOIN transfers working
- ✅ Transaction history with auto-refresh

---

## ✅ Phase 8: QR Scanner & Camera Integration (COMPLETE)

### Completed Tasks
1. **QR code scanner for sending** ✅
   - Camera permission handling
   - Scan Koinos addresses
   - Auto-fill recipient in SendScreen
   - Support for `koinos:` URI scheme with amount/token params
2. **CameraView fix** ✅ (2025-12-07)
   - Restructured overlay as sibling with absolute positioning

---

## Phase 9: Mini Apps Platform

### Overview
Kondor Mini Apps - tightly integrated dApps with pre-authenticated wallet access and native UI components. Inspired by Telegram Mini Apps.

**Full Spec:** See `/docs/features/mini-apps.md`

### Completed
- [x] Rename Browser tab to "Apps"
- [x] Create curated app list (8 Koinos dApps)
- [x] Grid layout matching Kondor extension design
- [x] Search functionality
- [x] "Add App" placeholder

### Phase 9.1: Basic WebView Browser
1. **WebView screen** for loading dApps
2. **Navigation** (back, forward, refresh, close)
3. **URL bar** with current URL display
4. **Loading states** and error handling

### Phase 9.2: Legacy Provider Injection
1. **`window.kondor`** injection (backwards compatible)
2. **getAccounts()** - return connected account
3. **getSigner()** - return signer interface
4. **Provider methods** - call, getNonce, etc.

### Phase 9.3: Transaction Signing
1. **Native approval modal** for transactions
2. **Operation decoding** (transfer, contract calls)
3. **Biometric confirmation** before signing
4. **Sign and broadcast** flow

### Phase 9.4: Mini App SDK
1. **KondorMiniApp** SDK injection
2. **Pre-authenticated** wallet context
3. **UI API** (haptics, toasts, theme)
4. **Storage API** (per-app persistence)

### Phase 9.5: Ecosystem
1. **Mini App manifest** spec
2. **Developer documentation**
3. **App submission** process
4. **Community apps** gallery

### Reference
- `/docs/features/mini-apps.md` - Full specification
- Telegram Mini Apps
- Kondor3 browser implementation

---

## Phase 10: Advanced Features

### WalletConnect v2
- Connect to desktop dApps
- Transaction approval flow

### NFT Support (Collectibles Tab)
- Fetch NFTs from Kollection API
- Display NFT gallery
- NFT transfers

---

## Quick Wins (Can Do Anytime)

1. **Amount shortcuts** - "25%", "50%", "Max" buttons in SendScreen
2. **Better loading states** - Skeleton loaders instead of spinners
3. **Transaction success animation** - Confetti or checkmark animation
4. **Keyboard improvements** - Fix input field keyboard delay

---

## Known Issues

### Minor
- Input field keyboard shows with slight delay on iOS device
- Token list shows loading state on each refresh (could use stale-while-revalidate)

### None Blocking

---

## Development Commands

```bash
# Start development
npm start

# Run on iOS simulator
npm run ios

# Run on iOS device
npx expo run:ios --device

# Clear cache
npm start -- --clear

# Build for TestFlight
eas build --platform ios --profile production
```

---

## Testing Checklist

### Before Release
- [ ] Test wallet creation on fresh install
- [ ] Test wallet import with seed phrase
- [ ] Test KOIN transfer on mainnet
- [ ] Test all 31 tokens load correctly
- [ ] Test token detail screen navigation
- [ ] Test multi-token transfers (VHP, etc.)
- [ ] Test receive screen QR code
- [ ] Test account creation (HD derivation)
- [ ] Test account import (private key)
- [ ] Test account switching
- [ ] Test account rename/remove
- [ ] Test transaction history accuracy
- [ ] Test contact add/edit/delete
- [ ] Test settings seed phrase export
- [ ] Test on iOS device
- [ ] Test on Android device
