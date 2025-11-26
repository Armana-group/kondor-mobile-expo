# Development TODO

## Status: UI Polish Complete - Ready for Phase 8

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

## Phase 8: QR Scanner & Camera Integration

### Tasks
1. **QR code scanner for sending**
   - Camera permission handling
   - Scan Koinos addresses
   - Auto-fill recipient in SendScreen
2. **Optional: Scan WalletConnect QR codes**
   - For future WalletConnect integration

### Reference
- expo-camera or expo-barcode-scanner

---

## Phase 9: Apps/dApps Browser

### Overview
Phantom-style dApp integration where users can browse and use Koinos dApps via WebView.

### Tasks
1. **Rename Browser tab to "Apps"**
2. **Create curated app list**
   - KoinDX (DEX)
   - Fogata (Mining pool)
   - KoinScan (Explorer)
   - Kollection (NFTs)
3. **WebView integration**
   - Load dApps in WebView
   - Inject wallet provider
   - Handle transaction signing requests
4. **Trust system**
   - Curated apps: No warning
   - User-saved apps: First-time warning for custom URLs
   - One-off URLs: Always show warning
5. **URL bar + search**
   - Enter arbitrary URLs
   - Search curated apps

### Reference
- Kondor3 browser implementation
- Phantom wallet dApp browser

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
