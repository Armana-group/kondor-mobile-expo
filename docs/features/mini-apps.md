# Kondor Mini Apps

## Overview

Kondor Mini Apps is a platform for running tightly-integrated dApps inside the Kondor Mobile wallet. Unlike traditional WebView-based dApp browsers that require users to "connect" their wallet, Mini Apps have pre-authorized access to wallet context and can leverage native UI components.

### Vision

Make Kondor the "super app" for the Koinos ecosystem - where users can seamlessly interact with dApps without friction, and developers can build rich experiences with deep wallet integration.

### Key Benefits

**For Users:**
- No "connect wallet" flow - already authenticated
- Consistent, native-feeling UI
- Trusted apps (curated/reviewed)
- Faster loading (optional offline support)

**For Developers:**
- Richer SDK than `window.kondor`
- Access to native UI components
- Pre-authenticated wallet context
- Distribution through Kondor app gallery

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Kondor Mobile                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │                 App Gallery                       │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐            │   │
│  │  │ KoinDX  │ │ Fogata  │ │KoinScan │  ...       │   │
│  │  │ (mini)  │ │ (mini)  │ │ (mini)  │            │   │
│  │  └─────────┘ └─────────┘ └─────────┘            │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│                          ▼                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Mini App Runtime                     │   │
│  │                                                   │   │
│  │  ┌─────────────────┐  ┌─────────────────────┐   │   │
│  │  │    WebView      │  │   Native Bridge     │   │   │
│  │  │                 │◄─►│                     │   │   │
│  │  │  Mini App Code  │  │ • Wallet Context    │   │   │
│  │  │  + Kondor SDK   │  │ • UI Components     │   │   │
│  │  │                 │  │ • Signing           │   │   │
│  │  └─────────────────┘  └─────────────────────┘   │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│                          ▼                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Kondor Wallet Core                   │   │
│  │  • Account Management                             │   │
│  │  • Transaction Signing                            │   │
│  │  • Balance Queries                                │   │
│  │  • Secure Storage                                 │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Two Operating Modes

### Mode 1: Legacy Browser Mode

Traditional dApp browser with `window.kondor` injection. Backwards compatible with all existing Koinos dApps.

```javascript
// dApp code (existing pattern)
if (window.kondor) {
  const accounts = await window.kondor.getAccounts();
  const signer = window.kondor.getSigner(accounts[0].address);
  // ...
}
```

**Use case:** Any existing Koinos dApp without modifications.

### Mode 2: Mini App Mode

Enhanced integration with KondorMiniApp SDK. Pre-authenticated, richer API.

```javascript
// Mini App code (new pattern)
const { wallet, ui, storage } = KondorMiniApp;

// Already authenticated - no connect needed!
console.log(wallet.address); // "1ABC..."
console.log(wallet.name);    // "Account 1"

// Rich wallet interactions
const balance = await wallet.getBalance("KOIN");
const tx = await wallet.signAndSend(transaction);

// Native UI components
ui.haptic("success");
ui.toast("Transaction sent!");
```

**Use case:** dApps optimized for Kondor with enhanced UX.

---

## Mini App Manifest

Every Mini App must include a manifest file that defines its metadata and permissions.

### Manifest Schema

```typescript
interface MiniAppManifest {
  // Required
  id: string;              // Unique identifier (e.g., "koinscan")
  name: string;            // Display name
  version: string;         // Semver version
  entry: string;           // Entry URL or bundle path
  icon: string;            // App icon URL (512x512 recommended)

  // Optional
  description?: string;    // Short description
  author?: string;         // Developer/team name
  website?: string;        // Official website
  category?: MiniAppCategory;

  // Permissions
  permissions: Permission[];

  // Display
  theme?: {
    primaryColor?: string;
    darkMode?: boolean;
  };

  // Advanced
  offline?: boolean;       // Support offline mode
  bundle?: string;         // Optional bundled assets URL
}

type MiniAppCategory =
  | "defi"
  | "nft"
  | "tools"
  | "social"
  | "gaming";

type Permission =
  | "read_address"         // Read wallet address
  | "read_balance"         // Read token balances
  | "read_accounts"        // Read all accounts
  | "sign_message"         // Sign arbitrary messages
  | "sign_transaction"     // Sign transactions
  | "send_transaction";    // Sign and broadcast transactions
```

### Example Manifest

```json
{
  "id": "koinscan",
  "name": "KoinScan",
  "version": "1.0.0",
  "description": "Block explorer and analytics for Koinos",
  "entry": "https://koinscan.io/kondor",
  "icon": "https://koinscan.io/assets/icon-512.png",
  "author": "KoinScan Team",
  "website": "https://koinscan.io",
  "category": "tools",
  "permissions": [
    "read_address",
    "read_balance"
  ],
  "theme": {
    "primaryColor": "#8B5CF6"
  }
}
```

---

## KondorMiniApp SDK

The SDK is automatically injected into Mini Apps and provides the following APIs:

### Wallet API

```typescript
interface KondorMiniApp {
  wallet: {
    // Pre-populated (no async needed)
    address: string;
    name: string;

    // Async methods
    getBalance(symbol?: string): Promise<TokenBalance[]>;
    getAccounts(): Promise<Account[]>;

    // Signing (shows native approval UI)
    signMessage(message: string): Promise<SignedMessage>;
    signTransaction(tx: Transaction): Promise<SignedTransaction>;
    signAndSend(tx: Transaction): Promise<TransactionReceipt>;
  };
}
```

### UI API

```typescript
interface KondorMiniApp {
  ui: {
    // Haptic feedback
    haptic(type: "light" | "medium" | "heavy" | "success" | "error"): void;

    // Toasts
    toast(message: string, type?: "info" | "success" | "error"): void;

    // Native alerts
    alert(title: string, message: string): Promise<void>;
    confirm(title: string, message: string): Promise<boolean>;

    // Theme
    theme: {
      isDark: boolean;
      colors: ThemeColors;
    };

    // Navigation
    close(): void;
    openExternal(url: string): void;
  };
}
```

### Storage API

```typescript
interface KondorMiniApp {
  storage: {
    // Persistent storage (per-app, per-account)
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
    clear(): Promise<void>;
  };
}
```

### Events API

```typescript
interface KondorMiniApp {
  events: {
    // Listen for wallet changes
    on(event: "accountChanged", handler: (account: Account) => void): void;
    on(event: "networkChanged", handler: (network: Network) => void): void;

    // Cleanup
    off(event: string, handler: Function): void;
  };
}
```

---

## Permission System

Mini Apps must declare required permissions in their manifest. Users see permissions before first launch.

### Permission Levels

| Permission | Description | Risk Level |
|------------|-------------|------------|
| `read_address` | Read current wallet address | Low |
| `read_balance` | Read token balances | Low |
| `read_accounts` | Read all account addresses | Medium |
| `sign_message` | Sign arbitrary messages | Medium |
| `sign_transaction` | Sign transactions (requires approval) | High |
| `send_transaction` | Sign and broadcast (requires approval) | High |

### Approval Flow

```
┌─────────────────────────────────────────┐
│  KoinScan wants to:                     │
│                                         │
│  ✓ Read your wallet address             │
│  ✓ Read your token balances             │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │   Deny      │  │   Allow     │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

For `sign_transaction` and `send_transaction`, each transaction still requires explicit approval:

```
┌─────────────────────────────────────────┐
│  KoinScan requests signature            │
│                                         │
│  Transfer 100 KOIN                      │
│  To: 1ABC...XYZ                         │
│                                         │
│  Estimated Mana: 0.5%                   │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │   Reject    │  │   Approve   │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

---

## App Submission Process

### Tiers

1. **Curated Apps** - Pre-installed, verified by Kondor team
2. **Community Apps** - Submitted by developers, reviewed
3. **Custom URLs** - User-added, shows warning

### Submission Requirements

For Community Apps:

1. **Manifest file** at `/.well-known/kondor-miniapp.json`
2. **Icon** (512x512 PNG)
3. **Description** and screenshots
4. **Privacy policy** (if storing data)
5. **Source code** (optional, for verification)

### Review Criteria

- [ ] Manifest is valid
- [ ] Permissions are appropriate for functionality
- [ ] No malicious code
- [ ] Works correctly in Mini App runtime
- [ ] Follows UI/UX guidelines
- [ ] Handles errors gracefully

---

## Implementation Phases

### Phase 1: Foundation (Current)
- [x] App gallery with curated apps
- [x] External browser fallback
- [ ] Basic WebView browser
- [ ] `window.kondor` injection (legacy mode)

### Phase 2: Mini App Runtime
- [ ] WebView with native bridge
- [ ] KondorMiniApp SDK injection
- [ ] Basic wallet API (address, balance)
- [ ] UI API (haptics, toasts)

### Phase 3: Transaction Signing
- [ ] Sign message support
- [ ] Sign transaction support
- [ ] Native approval modal
- [ ] Send transaction support

### Phase 4: Advanced Features
- [ ] Storage API
- [ ] Events API
- [ ] Offline support
- [ ] App submission portal

### Phase 5: Ecosystem
- [ ] Developer documentation site
- [ ] Mini App starter template
- [ ] Community app gallery
- [ ] Analytics for developers

---

## Security Considerations

### WebView Isolation
- Each Mini App runs in its own WebView instance
- No cross-app data access
- Clear data on app removal

### Content Security
- HTTPS required for all Mini Apps
- CSP headers enforced
- No inline script execution from untrusted sources

### Signing Security
- All signing operations require biometric/PIN
- Transaction details shown in native UI (not WebView)
- Rate limiting on signing requests

### Storage Security
- Per-app, per-account isolation
- Encrypted storage
- Clear on wallet reset

---

## Developer Guide

### Getting Started

1. **Create a manifest** at `/.well-known/kondor-miniapp.json`
2. **Build your mini app** using the KondorMiniApp SDK
3. **Test locally** using Kondor development mode
4. **Submit for review** via the Kondor developer portal

### Example Mini App

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Mini App</title>
  <script src="https://cdn.kondor.app/miniapp-sdk.js"></script>
</head>
<body>
  <div id="app">
    <h1>Welcome, <span id="address"></span></h1>
    <p>Balance: <span id="balance"></span> KOIN</p>
    <button id="send">Send KOIN</button>
  </div>

  <script>
    // SDK is automatically available
    const { wallet, ui } = KondorMiniApp;

    // Display wallet info (already available)
    document.getElementById("address").textContent =
      wallet.address.slice(0, 8) + "...";

    // Fetch balance
    wallet.getBalance("KOIN").then(balance => {
      document.getElementById("balance").textContent = balance;
    });

    // Send button
    document.getElementById("send").onclick = async () => {
      try {
        const result = await wallet.signAndSend({
          to: "1RecipientAddress...",
          amount: "10",
          token: "KOIN"
        });
        ui.toast("Sent!", "success");
        ui.haptic("success");
      } catch (err) {
        ui.toast(err.message, "error");
      }
    };
  </script>
</body>
</html>
```

### Migrating from window.kondor

```javascript
// Before (traditional dApp)
if (window.kondor) {
  const accounts = await window.kondor.getAccounts();
  const address = accounts[0].address;
  const signer = window.kondor.getSigner(address);
  const signed = await signer.signTransaction(tx);
}

// After (Mini App)
const { wallet } = KondorMiniApp;
const address = wallet.address; // Already available!
const result = await wallet.signAndSend(tx);
```

---

## References

- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [WeChat Mini Programs](https://developers.weixin.qq.com/miniprogram/en/dev/)
- [Phantom Wallet Docs](https://docs.phantom.app/)
- [Kondor Extension](https://github.com/pwa-builder/pwa-starter)

---

## Appendix: Full SDK Type Definitions

```typescript
declare global {
  const KondorMiniApp: {
    // Version
    version: string;

    // Wallet
    wallet: {
      address: string;
      name: string;
      network: "mainnet" | "harbinger";

      getBalance(symbol?: string): Promise<TokenBalance[]>;
      getAccounts(): Promise<Account[]>;
      getMana(): Promise<ManaInfo>;

      signMessage(message: string): Promise<SignedMessage>;
      signTransaction(tx: Transaction): Promise<SignedTransaction>;
      signAndSend(tx: Transaction): Promise<TransactionReceipt>;
    };

    // UI
    ui: {
      haptic(type: HapticType): void;
      toast(message: string, type?: ToastType): void;
      alert(title: string, message: string): Promise<void>;
      confirm(title: string, message: string): Promise<boolean>;
      prompt(title: string, message: string, defaultValue?: string): Promise<string | null>;

      theme: Theme;

      close(): void;
      openExternal(url: string): void;
      share(data: ShareData): Promise<void>;
    };

    // Storage
    storage: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<void>;
      remove(key: string): Promise<void>;
      clear(): Promise<void>;
      keys(): Promise<string[]>;
    };

    // Events
    events: {
      on(event: EventType, handler: EventHandler): void;
      off(event: EventType, handler: EventHandler): void;
      once(event: EventType, handler: EventHandler): void;
    };

    // Utils
    utils: {
      formatAddress(address: string, chars?: number): string;
      formatBalance(amount: string, decimals?: number): string;
      parseAmount(amount: string, decimals?: number): string;
    };
  };
}

interface TokenBalance {
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  contractId: string;
}

interface Account {
  address: string;
  name: string;
}

interface ManaInfo {
  mana: string;
  maxMana: string;
  percentage: number;
}

interface Transaction {
  to: string;
  amount: string;
  token?: string;
  memo?: string;
  // Or raw transaction
  operations?: Operation[];
}

interface SignedMessage {
  message: string;
  signature: string;
  address: string;
}

interface SignedTransaction {
  transaction: any;
  signatures: string[];
}

interface TransactionReceipt {
  id: string;
  blockNumber: number;
  success: boolean;
}

type HapticType = "light" | "medium" | "heavy" | "success" | "warning" | "error";
type ToastType = "info" | "success" | "warning" | "error";
type EventType = "accountChanged" | "networkChanged" | "themeChanged";
```
