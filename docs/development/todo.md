# Development TODO

## Status: Phase 7 Complete - Multi-Token Support

### ✅ Completed (Phase 7)
- ✅ Token store with KoinDX integration
- ✅ Multi-token balance display (31 tokens)
- ✅ Token detail screen with filtered transactions
- ✅ Token picker in SendScreen
- ✅ Transaction history multi-token support
- ✅ Token icons in Activity screen
- ✅ Explorer links (koiner.app)

### ✅ Completed (Phase 6)
- ✅ Bottom tab navigation
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

## Phase 8: Apps/dApps Browser

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

## Phase 9: Multi-Token Transfers

### Tasks
1. **Generic token transfer**
   - Update manualTokenContract for any token
   - Test with VHP, KOINDX, etc.
2. **Token-specific validation**
   - Check token balance before send
   - Handle tokens with different decimals

---

## Phase 10: Advanced Features

### Multi-Account Support
- HD wallet with multiple derived accounts
- Account switcher in HomeScreen
- Per-account balances and history

### QR Code Scanner
- Scan addresses for sending
- Scan WalletConnect QR codes

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
2. **Copy address button** - Dedicated button on HomeScreen
3. **Better loading states** - Skeleton loaders instead of spinners
4. **Transaction success animation** - Confetti or checkmark animation
5. **Keyboard improvements** - Fix input field keyboard delay

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
- [ ] Test transaction history accuracy
- [ ] Test contact add/edit/delete
- [ ] Test settings seed phrase export
- [ ] Test on iOS device
- [ ] Test on Android device
