# Security Audit: Kondor Mobile (Expo)

**Date:** 2026-02-13
**Scope:** Full source review of `src/` directory

---

## CRITICAL

### 1. WalletConnect Project ID hardcoded in source

**`src/stores/walletConnectStore.ts:58`**:

```ts
const WALLETCONNECT_PROJECT_ID = '1f1d0d8789bef28db46761b0c0facc6d';
```

This is committed to the repo. Anyone can use this project ID to impersonate the app, burn through WalletConnect rate limits, or associate malicious activity with your project. Should be in an environment variable or build-time config not committed to git.

### 2. WebView dApp browser injects signing capabilities with no origin restriction

**`src/screens/DAppWebViewScreen.tsx:492`** — the Kondor provider script is injected into **every WebView page** via `injectedJavaScriptBeforeContentLoaded`:

```ts
<WebView
  injectedJavaScriptBeforeContentLoaded={KONDOR_PROVIDER_SCRIPT}
  javaScriptEnabled={true}
  domStorageEnabled={true}
/>
```

**`src/screens/BrowserScreen.tsx:136-178`** — users can open **any arbitrary URL** in the DApp browser. Combined with the injected provider, **any website** gets access to `window.kondor.getAccounts()` and can request transaction signing. A phishing site could request signing of a malicious contract call.

The account-connect dialog shows the app name from the curated list, but for custom URLs it shows the hostname — which can be spoofed (e.g., `koindx-app.evil.com`). There's no allowlist, no origin validation, and no warning that custom URLs get full wallet interaction.

### 3. `provider:sendTransaction` is in BACKGROUND_COMMANDS (no approval)

**`src/lib/kondorProvider.ts:243`**:

```ts
export const BACKGROUND_COMMANDS = [
  ...
  'provider:sendTransaction',
  ...
];
```

`provider:sendTransaction` is classified as a **background command** (no user approval). This means a malicious dApp could craft a pre-signed transaction and submit it via `provider.sendTransaction()` **without any approval modal**. While the dApp can't sign on behalf of the user, if it can trick another flow into pre-signing, this is the escape hatch. `sendTransaction` and `submitBlock` should be in `APPROVAL_COMMANDS`.

---

## HIGH

### 4. Mnemonic not encrypted at application level

**`src/stores/walletStore.ts:87`**:

```ts
await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic);
```

The mnemonic is stored raw in SecureStore (same as koinos-wallet). SecureStore provides OS-level encryption, but best practice is to also encrypt with a user-derived key (PIN → PBKDF2 → AES) so that even if SecureStore is compromised (jailbreak, backup extraction), the seed is still protected.

### 5. Private keys cached in SecureStore for every account

**`walletStore.ts:90`**:

```ts
await SecureStore.setItemAsync(`${PRIVATE_KEY_PREFIX}${accountId}`, privateKey);
```

Every account's private key is stored individually in SecureStore in hex format. This expands the attack surface vs. only storing the mnemonic and deriving keys on demand. If an attacker gets SecureStore access, they get every account key individually.

### 6. Signer persists in zustand store indefinitely

**`src/stores/koinosStore.ts:93-98`**:

```ts
set({
  provider,
  signer,
  isInitialized: true,
  ...
});
```

The `signer` (containing the private key) lives in the zustand store for the entire app lifecycle. It's never cleared after use. The `reset()` function exists but is never called.

### 7. No PIN / app lock system at all

Unlike the koinos-wallet app (which at least has an optional PIN), Kondor Mobile has **zero app lock functionality**. No PIN, no lock screen, no re-authentication. Anyone who picks up an unlocked phone has full wallet access.

### 8. No re-authentication for sending transactions

**`src/screens/SendScreen.tsx:141-199`** — the send flow shows a confirmation `Alert.alert()` but does not require biometric/PIN authentication. Only the DApp WebView transaction flow (`TransactionApprovalModal.tsx:237`) requires biometric auth.

### 9. Clipboard exposure without auto-clear

**`src/screens/SettingsScreen.tsx:45`** and **`src/screens/CreateWalletScreen.tsx:32`**:

```ts
await Clipboard.setStringAsync(mnemonic);
```

Seed phrase and private key are copied to clipboard with no auto-clear timer. On both iOS and Android, other apps can read clipboard contents.

---

## MEDIUM

### 10. Logger leaks error details in production

**`src/lib/logger.ts:49-51`**:

```ts
error(...args: any[]) {
  // Always log errors, even in production
  console.error(...this.formatMessage('error', ...args));
}
```

Error logs are **never suppressed**, even in production. Combined with 153 `console.log/error` calls across 19 files (many outside the logger), this leaks transaction details, private key lengths, addresses, and error stacks to system logs. On rooted/jailbroken devices, these are readable.

Specific concerns in `koinosStore.ts`:
- Line 54: `log.debug(' Tried account-specific key:', privateKey ? 'found' : 'not found');`
- Line 72: `log.debug(' Private key found, length:', privateKey.length);`
- Line 91: `log.debug(' Signer created, address:', signer.getAddress());`
- Line 103: `log.error(' Error stack:', error.stack);`

### 11. DApp WebView response uses `postMessage` with wildcard origin

**`src/screens/DAppWebViewScreen.tsx:82`**:

```ts
window.postMessage(${JSON.stringify(response)}, '*');
```

The injected script posts messages with `'*'` origin. While this is inside a WebView (not a browser context), it's still poor practice and could leak data to iframes loaded within the dApp page.

### 12. Wallet state persisted to unencrypted AsyncStorage

**`src/stores/walletStore.ts:397-408`**:

```ts
persist(
  ...
  {
    name: 'wallet-storage',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) => ({
      accounts: state.accounts,
      activeAccountId: state.activeAccountId,
      ...
    }),
  }
)
```

Account metadata (addresses, names, derivation indices) is persisted in **unencrypted AsyncStorage**. While this doesn't include private keys, it reveals wallet structure and addresses. Same issue in `walletConnectStore.ts` (session data) and `tokenStore.ts` (token balances).

### 13. Address validation missing checksum verification

**`src/lib/utils.ts:48`**:

```ts
const addressRegex = /^[1-9A-HJ-NP-Za-km-z]{33,35}$/;
return addressRegex.test(address);
```

Only checks length (33-35) and base58 charset. No base58check checksum verification. Typos that pass the regex lead to permanent loss of funds.

### 14. Mnemonic input not masked

**`src/screens/ImportWalletScreen.tsx:76-90`** — the mnemonic input is a regular `TextInput` with `multiline` and no `secureTextEntry`. Vulnerable to shoulder surfing, keyboard caching, and screen recording.

### 15. No background screen protection

When the app goes to the background, screen content (balances, addresses, seed phrase displayed in Alert) remains visible in the app switcher thumbnail.

### 16. Token list fetched over HTTP from GitHub without integrity check

**`src/stores/tokenStore.ts:78`**:

```ts
const KOINDX_TOKEN_LIST_URL = 'https://raw.githubusercontent.com/koindx/token-list/main/src/tokens/mainnet.json';
```

The token list is fetched from GitHub with no signature verification or hash check. A MITM attack or GitHub compromise could inject a malicious token contract that, when interacted with, drains funds (e.g., a token whose `transfer` function calls `approve` for the attacker).

### 17. DApp browser allows `http://` URLs

**`src/screens/BrowserScreen.tsx:146`**:

```ts
if (!url.startsWith('http://') && !url.startsWith('https://')) {
  url = 'https://' + url;
}
```

While it defaults to HTTPS, it explicitly allows `http://` URLs. Combined with the injected Kondor provider, this means the wallet interacts with dApps over unencrypted connections where a MITM could modify dApp JavaScript to request malicious transactions.

---

## LOW

### 18. No jailbreak / root detection

The app doesn't detect compromised devices where SecureStore guarantees are weakened.

### 19. WalletConnect session approval doesn't show full dApp details

**`src/stores/walletConnectStore.ts:329-365`** — session approval automatically uses `buildApprovedNamespaces` without giving the user granular control over which methods they're granting.

### 20. `crypto.ts` logs crypto availability details

**`src/lib/crypto.ts:46-51`**:

```ts
console.log('[Crypto] Quick Crypto:', quickCryptoAvailable ? 'ENABLED' : 'DISABLED (Expo Go)');
console.log('[Crypto] getRandomValues available:', typeof global.crypto?.getRandomValues !== 'undefined');
console.log('[Crypto] crypto.subtle available:', typeof global.crypto?.subtle !== 'undefined');
```

Logs crypto capability fingerprint unconditionally — aids attackers in understanding available attack surface on the device.

### 21. `Math.random()` used for UUID generation in injected script

**`src/lib/kondorProvider.ts:25-29`**:

```ts
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, ...
  });
}
```

`Math.random()` is not cryptographically secure. While these IDs are for message correlation (not security tokens), a predictable ID could allow a malicious iframe in the dApp to intercept responses meant for the dApp.

---

## Summary

| Severity     | Count | Key Themes                                                                                            |
| ------------ | ----- | ----------------------------------------------------------------------------------------------------- |
| **Critical** | 3     | Hardcoded WC project ID, unrestricted WebView signing, sendTransaction needs no approval              |
| **High**     | 6     | Unencrypted mnemonic, cached private keys, signer in memory, no app lock, no send auth, clipboard     |
| **Medium**   | 8     | Production logging, wildcard postMessage, unencrypted AsyncStorage, weak address validation, token list |
| **Low**      | 4     | No root detection, WC granularity, crypto logging, Math.random UUIDs                                  |

## Comparison with koinos-wallet

| Feature                         | koinos-wallet        | kondor-mobile-expo     |
| ------------------------------- | -------------------- | ---------------------- |
| App lock (PIN)                  | Optional             | **None**               |
| Biometric for view seed/key     | No                   | **Yes** (good)         |
| Biometric for DApp transactions | N/A                  | **Yes** (good)         |
| Biometric for in-app sends      | No                   | **No**                 |
| Web/localStorage fallback       | Yes (critical)       | No (good)              |
| DApp browser                    | No                   | Yes (new attack surface) |
| WalletConnect                   | No                   | Yes (new attack surface) |
| Seed encryption                 | Raw in SecureStore   | Raw in SecureStore     |
| Logger discipline               | Mixed (__DEV__ some) | Logger class, but errors always log |

## Recommended Fix Order

1. **Move `provider:sendTransaction` to APPROVAL_COMMANDS** (#3) — trivial fix, prevents unsigned tx submission without approval
2. **Add PIN/app lock system** (#7) — critical for physical device security
3. **Require biometric auth for in-app sends** (#8) — currently only DApp transactions require it
4. **Restrict DApp browser origins or add warning** (#2) — warn users before injecting wallet into untrusted sites
5. **Move WC project ID to env/build config** (#1)
6. **Encrypt mnemonic with user-derived key** (#4)
7. **Suppress error logging in production** (#10)
8. **Add clipboard auto-clear** (#9)
9. **Validate token list integrity** (#16)
10. **Add background privacy screen** (#15)
