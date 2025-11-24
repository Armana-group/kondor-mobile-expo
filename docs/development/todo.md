# Development TODO

## Status: ✅ Transfers Working! ✅ Transaction History Live!

### ✅ Completed
- ✅ Mana checker implementation
- ✅ Reserved RC checking from mempool
- ✅ Dynamic RC estimation via dry-run
- ✅ Mana display in HomeScreen
- ✅ Pre-send mana validation
- ✅ Successful KOIN transfers
- ✅ Transaction history with auto-refresh
- ✅ Transaction list UI with send/receive indicators
- ✅ Pull-to-refresh functionality

## Next Priority Tasks

### 1. Error Handling Improvements (HIGH)
**Why:** Better user experience for error scenarios
**Tasks:**
- Parse and display user-friendly error messages
- Distinguish error types:
  - Network errors → "Connection failed, please try again"
  - Insufficient mana → Show time estimate with mana info
  - Invalid address → "Invalid recipient address"
  - Insufficient balance → "Not enough KOIN for this transfer"
- Add retry logic for network errors
- Show error details in a dismissible modal

### 2. Address Book / QR Scanner (MEDIUM)
**Why:** Easier address entry
**Tasks:**
- Implement QR code scanner for addresses
- Add address book to save frequent recipients
- Validate scanned addresses before use
- Add "Scan QR" button in SendScreen

**Libraries:**
- `expo-camera` for QR scanning
- AsyncStorage for address book persistence

### 3. Multi-Account Support (LOW)
**Why:** Users may want multiple wallets
**Tasks:**
- Support creating/importing multiple accounts
- Add account switcher in HomeScreen
- Store multiple private keys (separate SecureStore keys)
- Show all account balances in account list
- Allow naming accounts

### 4. Token Support Beyond KOIN (LOW)
**Why:** Support other Koinos tokens
**Tasks:**
- Add token contract addresses
- Fetch token balances
- Display token list with balances
- Support token transfers
- Add token icons/metadata

**Reference:** `../kondor` handles multiple tokens

### 5. UI/UX Polish (LOW)
**Tasks:**
- Add loading states for all async operations
- Improve transaction confirmation modal
- Add haptic feedback for button presses
- Better success/failure animations
- Add "Copy Address" button with feedback
- Improve mana bar styling
- Add transaction pending indicators

### 6. Testing & Quality (ONGOING)
**Tasks:**
- Test on physical iOS device
- Test on physical Android device
- Test with different account balances
- Test with low/no mana scenarios
- Test network error handling
- Test with very large balances
- Add unit tests for core utilities
- Add integration tests for transfers

## Quick Wins

These can be done quickly for immediate value:

1. **Copy Address Button**: Add dedicated button to copy wallet address
2. **Better Loading States**: Show spinners during all network requests
3. **Transaction Success Animation**: Celebratory animation on successful transfer
4. **Mana Refresh Button**: Allow manual mana refresh without full balance refresh
5. **Amount Shortcuts**: Add buttons for "25%", "50%", "75%", "Max" amounts

## Known Issues

### None Currently! 🎉

All blocking issues have been resolved:
- ✅ Protobuf extensions → Using ManualTokenContract
- ✅ Crypto compatibility → Configured polyfills correctly
- ✅ Mana insufficient errors → Implemented mana checker
- ✅ RC limit too high → Using dynamic estimation

## Testing Account

**Current Test Account:**
- Address: `13jqmvK2NF9yGCqUWSKjVH4msTqhRM96ac`
- Balance: ~4.7 KOIN
- Mana: 100% (fully regenerated)
- Status: ✅ Working perfectly

## Development Commands

```bash
# Start development
npm start

# Build and run iOS
npm run ios

# Build and run Android
npm run android

# Clear cache and restart
npm start -- --clear

# Build for production
eas build --platform ios --profile production
eas build --platform android --profile production
```

## Reference Implementations

- **Kondor Extension** (`../kondor`): Primary reference for blockchain operations
- **Kondor Mobile** (`../kondor-mobile`): Secondary reference for mobile patterns

Always check the Kondor extension for up-to-date Koinos integration patterns.
