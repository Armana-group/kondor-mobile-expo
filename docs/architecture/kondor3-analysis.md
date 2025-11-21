# Kondor3 Analysis

## Overview

**Kondor3** is a modern Chrome extension wallet for the Koinos blockchain, located at `/Users/ron/devstuff/projects/armana/apps/kondor3`. It represents a redesigned version of the Kondor wallet with improved architecture and UX.

**Project Type:** Chrome Browser Extension
**Tech Stack:** React 18 + TypeScript, Jotai state management, Tailwind CSS + Radix UI
**Build Tool:** Vite 5.4.20

## Architecture

### Frontend Framework
- **React 18.3** with TypeScript (strict mode)
- **Vite** for build tooling with multiple entry points
- **Tailwind CSS** for styling
- **Radix UI** components for accessible UI primitives

### State Management
- **Jotai** - Atomic state management (lighter alternative to Redux/Zustand)
- Dual-store architecture:
  - Wallet store (secure, encrypted private keys/mnemonics)
  - UI/transaction stores (public data)
- `jotai-persist` and `atomWithStorage` for persistence
- Chrome storage API for browser extension storage

### Blockchain Integration
- **Koilib v9.1.0** - Koinos blockchain JavaScript SDK
- **Ethers.js v5.6.2** - HD wallet derivation and mnemonic generation
- Custom `HDKoinos` class for BIP44 derivation (m/44'/659'/accountIndex'/0/0)

### Security
- PIN-based encryption using native crypto
- Chrome storage API for persisted data
- Secure atoms for sensitive data encryption
- Session-based locking (30 min timeout)

## Transaction History Implementation

### API Integration
```typescript
// Primary API (Kondor Mobile uses correct endpoint)
https://rest.koinos.io/v1/account/{address}/history

// Parameters
limit=50&ascending=false

// Token List API
https://raw.githubusercontent.com/koindx/token-list/main/src/tokens/mainnet.json

// Note: Kondor3 documentation referenced koinoscollective.org but the working endpoint is rest.koinos.io
```

### Hook: `useTransactionHistory`
**Location:** `src/hooks/useTransactionHistory.ts`

**Features:**
- Auto-refreshes every 30 seconds in background
- Caches transactions in persistent storage
- Provides loading/error/refreshing states
- Calculates stats (incoming/outgoing/total count)
- Uses Jotai atoms for state management

**Returns:**
```typescript
{
  transactions: ParsedTransaction[],
  loading: boolean,
  error: string | null,
  refreshing: boolean,
  stats: { incoming, outgoing, total },
  refetch: () => Promise<void>
}
```

**Transaction Structure:**
```typescript
interface ParsedTransaction {
  id: string;
  type: 'send' | 'receive';
  amount: string;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenIcon?: string;
  from: string;
  to: string;
  timestamp: number;
  status: 'confirmed';
  blockHeight?: number;
  fee: string;  // In mana (RC converted to decimals)
  payer: string;
  seqNum?: string;
}
```

## Mana/RC Handling

### Current Implementation
**Location:** `src/hooks/useTransaction.ts`

```typescript
// Current approach (marked with TODOs for optimization)
const contract = new Contract({
  options: {
    payer: "162GhJwsciDiKsgwzj2t6VoFHt3RMzGKdG",  // Fixed payer account
    payee: activeAccount.address,
    rcLimit: "10000000000"  // 100 mana (hardcoded)
  }
});
```

**RC Display:**
- Shows in Dashboard: `Fee: {tx.fee} mana`
- Fee calculated from receipt: `utils.formatUnits(tx.trx.receipt.rc_used, 8)`
- 1 mana = 100,000,000 RC (8 decimal places)

**Current Limitations (with TODOs):**
1. ❌ Hardcoded RC limit (100 mana)
2. ❌ Hardcoded payer address
3. ❌ No dynamic mana estimation
4. ❌ No mana balance checking before transactions
5. ❌ No user mana visibility

**Kondor Mobile Advantage:**
- ✅ Dynamic RC estimation via dry-run
- ✅ Mana checking with reserved RC from mempool
- ✅ Available mana display with progress bar
- ✅ Pre-send mana validation
- **Our mana implementation is MORE advanced than kondor3!**

## Backup & Recovery System

### Implementation
**Location:** `src/utils/backup.ts` and `src/store/backup.ts`

**Features:**
- Encrypted backup files (JSON format)
- PIN-protected restoration
- SHA-256 checksum verification
- Backup reminders (7-day interval)
- Required backup after 30 days
- Backup history tracking
- Dismiss reminder for custom periods

**Backup Data Structure:**
```typescript
{
  version: 1,
  timestamp: number,
  walletData: WalletState,
  metadata: {
    accountCount: number,
    lastBackup: number,
    checksum: string
  }
}
```

**Use for Kondor Mobile:**
- Can adapt the encryption/decryption logic
- Use Expo FileSystem for backup files
- Implement similar reminder system
- Add share functionality for backups

## Multi-Account Support

**Location:** `src/store/wallet.ts`

**Features:**
- HD wallet derivation (BIP44 path: m/44'/659'/accountIndex'/0/0)
- Each account has encrypted private key stored separately
- Account switching interface
- Account renaming capability
- Stored in Chrome secure storage

**Pattern:**
```typescript
class HDKoinos {
  // Derives child accounts from master seed
  deriveAccount(accountIndex: number): Account

  // BIP44 path: m/44'/659'/accountIndex'/0/0
  static readonly COIN_TYPE = 659; // Koinos
}
```

**Reusable for Kondor Mobile:**
- HDKoinos class can be copied directly
- Account derivation logic is platform-agnostic
- Just need to replace Chrome storage with Expo SecureStore

## Token Management

**Location:** `src/lib/storage.ts` and `src/services/prices.ts`

**Smart Token Discovery:**
- Fetches from KoinDX token list
- Supports unknown token contract metadata discovery
- Caches token list for 5 minutes
- Handles special tokens (KOIN, VHP)
- Blacklist for non-standard contracts
- Fallback to token symbol lookup

**Token List Integration:**
```typescript
// Fetches from KoinDX
const tokenList = await fetch(
  'https://raw.githubusercontent.com/koindx/token-list/main/src/tokens/mainnet.json'
);

// Token structure
interface Token {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  icon?: string;
}
```

**Price Tracking:**
- KOIN price from MEXC exchange API
- Other tokens from KoinDX
- Token price caching
- Change percentage tracking

## UI Patterns & Components

### Component Architecture
```
src/components/
├── WalletPanel.tsx          # Main UI hub (popup/sidepanel)
├── dashboard/Dashboard.tsx   # Portfolio display
├── transaction/
│   ├── SendDialog.tsx        # Send transaction UI
│   ├── ReceiveDialog.tsx     # Receive/QR code
│   └── TransactionList.tsx   # Transaction history
├── backup/                   # Backup/restore UI
├── settings/                 # Settings and security
├── ui/                       # Reusable components
└── views/                    # Different app views
```

### Key UI Patterns

**1. Skeleton Loaders:**
```typescript
<PortfolioHeaderSkeleton /> - Shows while loading balances
<AssetListSkeleton /> - Shows while loading assets
```

**2. Dialog-based Interactions:**
- Send/Receive in modal dialogs
- Settings in expandable panel
- Radix Dialog for accessible modals

**3. Asset Display:**
```typescript
interface AssetBalance {
  symbol: string;
  balance: string;
  value: string;      // USD value
  icon: string;
  loading?: boolean;
  error?: string;
}
```

**4. Tab/View Navigation:**
- Views: home, collectibles, swap, history, apps, settings
- Sidebar toggle for expanded view

## Security Architecture

**Location:** `src/store/security.ts`

**Features:**
- Session-based locking (30 min timeout)
- PIN-based verification
- Custom error types:
  - `SecuritySetupError`
  - `SecurityVerificationError`
  - `BackupError`
  - `BackupVerificationError`
- Encrypted verification tokens
- Version-aware for future upgrades

**Pattern:**
```typescript
// Better than generic Error for debugging
throw new SecurityVerificationError('Invalid PIN');
```

## Notable Implementation Details

### Contract Addresses
- **KOIN:** `19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK`
- **VHP:** `18tWNU7E4yuQzz7hMVpceb9ixmaWLVyQsr`

### Chrome Storage Keys
- `kondor:security` - PIN and verification tokens
- `kondor:tokens` - Token balances
- `kondor:wallet` - Wallet data (encrypted)
- `kondor:backup` - Backup state

### API Endpoints
- Transaction history: `https://koinoscollective.org/api/`
- Token list: `https://raw.githubusercontent.com/koindx/token-list/main/`
- Price data: MEXC and KoinDX APIs

## Reusable Code for Kondor Mobile

### 1. HDKoinos Class ⭐
**High Priority** - Can be copied directly
- Platform-agnostic HD wallet implementation
- BIP44 derivation for multiple accounts
- Works with ethers.js and koilib

### 2. Transaction History Hook ⭐
**High Priority** - Adapt for React Native
- API integration pattern
- Transaction parsing logic
- Auto-refresh mechanism
- Caching strategy

### 3. Token List Integration ⭐
**Medium Priority**
- KoinDX token list fetching
- Token metadata discovery
- Icon/symbol resolution

### 4. Backup Utilities ⭐
**Medium Priority** - Adapt for mobile
- Encryption/decryption functions
- Checksum verification
- Backup format structure

### 5. Custom Error Types
**Low Priority** - Easy to implement
- Better debugging
- User-friendly error messages

## Comparison: Kondor Mobile vs Kondor3

| Feature | Kondor Mobile | Kondor3 |
|---------|---------------|---------|
| **Platform** | React Native (iOS/Android) | Chrome Extension |
| **State Management** | Zustand | Jotai |
| **Mana Checking** | ✅ Dynamic with dry-run | ❌ Hardcoded 100 mana |
| **RC Estimation** | ✅ Yes, via dry-run | ❌ No |
| **Mana Display** | ✅ Progress bar with % | ❌ Only fees after tx |
| **Reserved RC Check** | ✅ Yes, from mempool | ❌ No |
| **Transaction History** | ✅ Yes, auto-refresh | ✅ Yes, auto-refresh |
| **Multi-Account** | ❌ Not yet | ✅ Yes, HD wallet |
| **Backup System** | ❌ Not yet | ✅ Yes, encrypted |
| **Multi-Token** | ❌ KOIN only | ✅ All tokens |
| **Token Discovery** | ❌ Not yet | ✅ Yes, KoinDX |
| **QR Scanner** | ❌ Not yet | ✅ Yes, receive dialog |

## Recommendations for Kondor Mobile

### Immediate (High Value, Low Effort)
1. **Copy HDKoinos class** - Enables multi-account support
2. **Integrate transaction history API** - Users need to see history
3. **Add token list from KoinDX** - Easy multi-token support

### Short Term (High Value, Medium Effort)
4. **Implement backup system** - Critical for user security
5. **Add token discovery** - Better UX for unknown tokens
6. **Implement custom error types** - Better debugging

### Long Term (High Value, High Effort)
7. **Multi-account UI** - Account switcher and management
8. **Token portfolio view** - Display all token balances
9. **QR code scanner** - For addresses and receive functionality

### Not Needed (Kondor Mobile is Better)
- ❌ Mana checking - **Our implementation is more advanced**
- ❌ RC estimation - **We already have dry-run estimation**
- ❌ Reserved RC checking - **We already check mempool**

## Key Takeaways

1. **Kondor3 has excellent patterns** for transaction history, backup, and multi-account
2. **Kondor Mobile has better mana handling** than kondor3 (they use hardcoded limits)
3. **HDKoinos class is immediately reusable** for mobile
4. **Transaction history API is well-documented** and ready to integrate
5. **Backup system is production-ready** and can be adapted
6. **Token discovery pattern is valuable** for better UX
7. **Both projects can learn from each other** - kondor3 needs better mana handling, mobile needs transaction history

## Next Steps

Based on kondor3 analysis, recommended implementation order:

1. ✅ **Transaction History** - Copy API pattern, implement UI
2. ✅ **Multi-Account Support** - Copy HDKoinos class, build account switcher
3. ✅ **Backup System** - Adapt encryption logic, use Expo FileSystem
4. ✅ **Token Support** - Integrate KoinDX token list
5. ✅ **Token Discovery** - Unknown contract metadata fetching

## Reference Files in Kondor3

For implementation reference:

- **Transaction History:** `src/hooks/useTransactionHistory.ts`
- **HD Wallet:** `src/lib/HDKoinos.ts`
- **Backup System:** `src/utils/backup.ts`, `src/store/backup.ts`
- **Token Management:** `src/lib/storage.ts`
- **Security:** `src/store/security.ts`
- **Transaction Parsing:** `src/services/transaction.ts`
