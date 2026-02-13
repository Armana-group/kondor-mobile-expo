# Security Remediation Plan: Kondor Mobile (Expo)

**Date:** 2026-02-13
**Scope:** Full source review of `src/` directory
**Based on:** SECURITY_AUDIT.md findings (21 vulnerabilities)

This document provides implementation-level remediation guidance for every security issue identified in the audit. Fixes are grouped into phases by priority, with each phase designed to be shippable independently.

---

## Phase 1: Critical — Transaction Safety (Ship immediately)

These fixes prevent active exploitation and are trivial to implement.

### 1.1 Move `provider:sendTransaction` and `provider:submitBlock` to APPROVAL_COMMANDS

**Finding:** #3 (Critical) — A dApp can broadcast pre-signed transactions without user approval.

**File:** `src/lib/kondorProvider.ts:231-250`

**Current code:**
```ts
export const BACKGROUND_COMMANDS = [
  // ... read-only commands ...
  'provider:sendTransaction',   // line 243 — NO APPROVAL
  'provider:submitBlock',       // line 244 — NO APPROVAL
  // ...
];
```

**Fix:** Remove both from `BACKGROUND_COMMANDS` and add to `APPROVAL_COMMANDS`:

```ts
// kondorProvider.ts — BACKGROUND_COMMANDS (remove these two lines)
export const BACKGROUND_COMMANDS = [
  'provider:call',
  'provider:getNonce',
  'provider:getNextNonce',
  'provider:getAccountRc',
  'provider:getTransactionsById',
  'provider:getBlocksById',
  'provider:getHeadInfo',
  'provider:getChainId',
  'provider:getBlocks',
  'provider:getBlock',
  'provider:wait',
  // REMOVED: 'provider:sendTransaction',
  // REMOVED: 'provider:submitBlock',
  'provider:readContract',
  'provider:getForkHeads',
  'provider:getResourceLimits',
  'provider:invokeGetContractMetadata',
  'signer:prepareTransaction',
];

// APPROVAL_COMMANDS (add these two)
export const APPROVAL_COMMANDS = [
  'getAccounts',
  'signer:signHash',
  'signer:signMessage',
  'signer:signTransaction',
  'signer:sendTransaction',
  'provider:sendTransaction',   // ADD
  'provider:submitBlock',       // ADD
];
```

**Verification:** After this change, any dApp calling `provider.sendTransaction()` will show the `TransactionApprovalModal` which requires biometric authentication.

**Risk if skipped:** A malicious dApp that obtains a pre-signed transaction (e.g., from a phishing flow or by tricking another signing request) can broadcast it silently.

---

### 1.2 Add biometric authentication for in-app sends

**Finding:** #8 (High) — In-app sends only show an `Alert.alert()` confirmation, no biometric check. The DApp flow correctly requires biometrics via `TransactionApprovalModal` (line 237), but the native send screen does not.

**File:** `src/screens/SendScreen.tsx:141-199`

**Current code (line 162):**
```ts
text: 'Send',
onPress: async () => {
  setIsSending(true);
  try {
    const txId = await transferToken(
      selectedToken.contractId,
      recipient,
      amount,
      selectedToken.decimals
    );
```

**Fix:** Add biometric auth before the transfer call:

```ts
import { requireBiometricAuth } from '../lib/biometrics';

// Inside handleSend, after Alert confirmation, before transferToken:
text: 'Send',
onPress: async () => {
  // Require biometric authentication before sending
  const authenticated = await requireBiometricAuth('send this transaction');
  if (!authenticated) {
    Alert.alert('Authentication Required', 'Biometric authentication is required to send transactions.');
    return;
  }

  setIsSending(true);
  try {
    const txId = await transferToken(
      selectedToken.contractId,
      recipient,
      amount,
      selectedToken.decimals
    );
```

**Verification:** Test send flow — biometric prompt should appear after tapping "Send" in the confirmation dialog. Canceling biometrics should abort the transaction.

---

### 1.3 Move WalletConnect project ID to environment config

**Finding:** #1 (Critical) — Project ID hardcoded in source and committed to git.

**File:** `src/stores/walletConnectStore.ts:58`

**Current code:**
```ts
const WALLETCONNECT_PROJECT_ID = '1f1d0d8789bef28db46761b0c0facc6d';
```

**Fix:**

1. Install `react-native-dotenv` or use Expo's built-in `Constants.expoConfig.extra`:

```ts
// app.config.ts or app.json
export default {
  expo: {
    extra: {
      walletConnectProjectId: process.env.WALLETCONNECT_PROJECT_ID,
    },
  },
};
```

```ts
// walletConnectStore.ts
import Constants from 'expo-constants';

const WALLETCONNECT_PROJECT_ID = Constants.expoConfig?.extra?.walletConnectProjectId
  || (() => { throw new Error('WALLETCONNECT_PROJECT_ID not configured'); })();
```

2. Add to `.env` (and add `.env` to `.gitignore`):
```
WALLETCONNECT_PROJECT_ID=1f1d0d8789bef28db46761b0c0facc6d
```

3. **Rotate the project ID** — the current one is compromised (in git history). Generate a new one at https://cloud.walletconnect.com.

---

## Phase 2: High — App Lock & Physical Device Security

These fixes protect against physical device access and stolen/borrowed phones.

### 2.1 Add PIN / app lock system

**Finding:** #7 (High) — Zero app lock functionality. Anyone who picks up an unlocked phone has full wallet access.

**Files to create/modify:**
- Create `src/screens/LockScreen.tsx` — PIN entry screen
- Create `src/screens/SetupPinScreen.tsx` — PIN setup flow (reuse from koinos-wallet)
- Create `src/services/auth.ts` — PIN storage and verification service
- Modify `src/navigation/AppNavigator.tsx` — gate app behind lock screen
- Modify `App.tsx` — add app state listener for re-locking

**Implementation:**

**a) Auth service (`src/services/auth.ts`):**

```ts
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const PIN_HASH_KEY = 'kondor_pin_hash';
const PIN_SALT_KEY = 'kondor_pin_salt';
const LOCK_ENABLED_KEY = 'kondor_lock_enabled';
const BIOMETRICS_ENABLED_KEY = 'kondor_biometrics_enabled';
const FAILED_ATTEMPTS_KEY = 'kondor_failed_attempts';
const LOCKOUT_UNTIL_KEY = 'kondor_lockout_until';

// Hash PIN with salt using SHA-256 (PBKDF2 preferred if available)
async function hashPin(pin: string, salt: string): Promise<string> {
  const data = `${salt}:${pin}`;
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    data
  );
}

export async function setPin(pin: string): Promise<void> {
  const salt = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    Math.random().toString() + Date.now().toString()
  );
  const hash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(PIN_HASH_KEY, hash);
  await SecureStore.setItemAsync(PIN_SALT_KEY, salt);
  await SecureStore.setItemAsync(LOCK_ENABLED_KEY, 'true');
}

export async function verifyPin(pin: string): Promise<boolean> {
  const salt = await SecureStore.getItemAsync(PIN_SALT_KEY);
  const storedHash = await SecureStore.getItemAsync(PIN_HASH_KEY);
  if (!salt || !storedHash) return false;

  const hash = await hashPin(pin, salt);
  const isValid = hash === storedHash;

  if (!isValid) {
    await incrementFailedAttempts();
  } else {
    await resetFailedAttempts();
  }

  return isValid;
}

// Brute-force protection
async function incrementFailedAttempts(): Promise<void> {
  const current = parseInt(
    await SecureStore.getItemAsync(FAILED_ATTEMPTS_KEY) || '0'
  );
  const attempts = current + 1;
  await SecureStore.setItemAsync(FAILED_ATTEMPTS_KEY, attempts.toString());

  // Progressive lockout
  if (attempts >= 3) {
    const lockoutSeconds = Math.min(30 * Math.pow(2, attempts - 3), 3600);
    const lockoutUntil = Date.now() + lockoutSeconds * 1000;
    await SecureStore.setItemAsync(LOCKOUT_UNTIL_KEY, lockoutUntil.toString());
  }

  // Wipe after 10 failed attempts
  if (attempts >= 10) {
    // Clear wallet data (nuclear option)
    // Import and call clearWallet() from walletStore
  }
}
```

**b) Lock screen gate in `AppNavigator.tsx`:**

```ts
// Add state for lock
const [isLocked, setIsLocked] = useState(true);
const [lockEnabled, setLockEnabled] = useState(false);

useEffect(() => {
  checkLockStatus();
}, []);

// Re-lock when app backgrounds
useEffect(() => {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'background' && lockEnabled) {
      setIsLocked(true);
    }
  });
  return () => sub.remove();
}, [lockEnabled]);

// In the navigator:
if (isLocked && lockEnabled) {
  return <LockScreen onUnlock={() => setIsLocked(false)} />;
}
```

**c) Make PIN setup mandatory during wallet creation:**

In `CreateWalletScreen.tsx` and `ImportWalletScreen.tsx`, after wallet creation succeeds, navigate to `SetupPinScreen` before allowing access to the main app.

---

### 2.2 Clear signer from memory after use

**Finding:** #6 (High) — The `signer` object (containing the private key) lives in the zustand store forever.

**File:** `src/stores/koinosStore.ts:93-98`

**Current code:**
```ts
set({
  provider,
  signer,        // Persists for entire app lifecycle
  isInitialized: true,
  isLoading: false,
  error: null
});
```

**Fix:** Instead of caching the signer, derive it on-demand for each transaction and clear it immediately after:

```ts
// koinosStore.ts — replace cached signer pattern

// Remove signer from state entirely
// Replace with a function that creates a temporary signer per operation:

async function getTemporarySigner(): Promise<Signer> {
  const { useWalletStore } = await import('./walletStore');
  const { activeAccountId } = useWalletStore.getState();

  let privateKey: string | null = null;
  if (activeAccountId) {
    privateKey = await SecureStore.getItemAsync(`kondor_pk_${activeAccountId}`);
  }
  if (!privateKey) {
    privateKey = await SecureStore.getItemAsync('kondor_wallet_private_key');
  }
  if (!privateKey) throw new Error('No private key found');

  const provider = get().provider;
  const signer = privateKey.length === 64
    ? new Signer({ privateKey, provider })
    : (() => { const s = Signer.fromWif(privateKey); s.provider = provider; return s; })();

  return signer;
}

// In transfer():
const signer = await getTemporarySigner();
try {
  // ... do the transfer ...
} finally {
  // Signer goes out of scope and can be GC'd
}
```

**Note:** This pairs with Phase 2.1 — once app lock exists, the signer derivation should also require PIN/biometric re-auth.

---

### 2.3 Auto-clear clipboard after copying secrets

**Finding:** #9 (High) — Seed phrase and private key copied to clipboard with no expiry.

**Files:**
- `src/screens/SettingsScreen.tsx:45` (mnemonic copy)
- `src/screens/SettingsScreen.tsx:87` (private key copy)
- `src/screens/CreateWalletScreen.tsx:32` (mnemonic copy)

**Current code:**
```ts
await Clipboard.setStringAsync(mnemonic);
```

**Fix:** Create a utility and use it everywhere:

```ts
// src/lib/clipboard.ts
import * as Clipboard from 'expo-clipboard';

const CLIPBOARD_CLEAR_DELAY_MS = 30_000; // 30 seconds

export async function copyWithAutoClear(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);

  setTimeout(async () => {
    // Only clear if the clipboard still contains our text
    const current = await Clipboard.getStringAsync();
    if (current === text) {
      await Clipboard.setStringAsync('');
    }
  }, CLIPBOARD_CLEAR_DELAY_MS);
}
```

Then replace all `Clipboard.setStringAsync(secret)` calls:

```ts
import { copyWithAutoClear } from '../lib/clipboard';

// SettingsScreen.tsx:45
await copyWithAutoClear(mnemonic);
Alert.alert('Copied', 'Recovery phrase copied to clipboard. It will be cleared in 30 seconds.');

// SettingsScreen.tsx:87
await copyWithAutoClear(privateKey);
Alert.alert('Copied', 'Private key copied to clipboard. It will be cleared in 30 seconds.');

// CreateWalletScreen.tsx:32
await copyWithAutoClear(mnemonic);
Alert.alert('Copied', 'Recovery phrase copied to clipboard. It will be cleared in 30 seconds.');
```

---

### 2.4 Stop caching individual private keys in SecureStore

**Finding:** #5 (High) — Every account's private key is stored individually, expanding the attack surface.

**File:** `src/stores/walletStore.ts:90,93,225`

**Current code:**
```ts
// Line 90 — stores per-account key on wallet creation
await SecureStore.setItemAsync(`${PRIVATE_KEY_PREFIX}${accountId}`, privateKey);

// Line 93 — also stores in legacy key
await SecureStore.setItemAsync(LEGACY_PRIVATE_KEY, privateKey);

// Line 225 — caches derived key after first biometric access
await SecureStore.setItemAsync(`${PRIVATE_KEY_PREFIX}${activeAccountId}`, privateKey);
```

**Fix:** Only store the mnemonic. Derive keys on-demand:

```ts
// walletStore.ts — createWallet
// REMOVE lines 90 and 93:
// await SecureStore.setItemAsync(`${PRIVATE_KEY_PREFIX}${accountId}`, privateKey);
// await SecureStore.setItemAsync(LEGACY_PRIVATE_KEY, privateKey);

// Only store mnemonic:
await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic);

// walletStore.ts — getPrivateKey (line 199-234)
// REMOVE the caching at line 225:
// await SecureStore.setItemAsync(`${PRIVATE_KEY_PREFIX}${activeAccountId}`, privateKey);
// Instead, just return the derived key without caching it
```

For imported accounts (WIF-only, no mnemonic), continue storing the single private key since it can't be re-derived.

**Migration:** On next app version, add a one-time migration that deletes all `kondor_pk_*` keys and `kondor_wallet_private_key` from SecureStore, keeping only the mnemonic.

---

## Phase 3: High — DApp Browser Hardening

These fixes reduce the attack surface of the WebView-based dApp browser.

### 3.1 Add origin warnings for custom URLs

**Finding:** #2 (Critical) — The Kondor provider is injected into every WebView page. Any website gets `window.kondor.getAccounts()` and can request transaction signing.

**Files:**
- `src/screens/BrowserScreen.tsx:136-178`
- `src/screens/DAppWebViewScreen.tsx:492`

**Fix (multi-layered):**

**a) Show a prominent warning when opening custom URLs:**

```ts
// BrowserScreen.tsx — handleOpenCustomUrl
const handleOpenCustomUrl = () => {
  let url = customUrl.trim();
  if (!url) return;

  if (!url.startsWith('https://')) {
    if (url.startsWith('http://')) {
      Alert.alert(
        'Insecure Connection',
        'This URL uses HTTP which is not encrypted. Your wallet interactions could be intercepted. Use HTTPS instead.',
        [{ text: 'Cancel', style: 'cancel' }]
      );
      return;
    }
    url = 'https://' + url;
  }

  // Warn about custom URLs
  Alert.alert(
    'Untrusted Site',
    'You are opening a custom URL. This site will be able to request wallet interactions including transaction signing.\n\nOnly continue if you trust this website.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'I understand, continue',
        style: 'destructive',
        onPress: () => {
          // Navigate to DApp WebView
        }
      }
    ]
  );
};
```

**b) Block `http://` entirely:**

```ts
// BrowserScreen.tsx — replace line 146
if (url.startsWith('http://')) {
  Alert.alert('Insecure Connection', 'HTTP URLs are not supported. Please use HTTPS.');
  return;
}
if (!url.startsWith('https://')) {
  url = 'https://' + url;
}
```

**c) Add visual indicator in DApp WebView for untrusted origins:**

In `DAppWebViewScreen.tsx`, show a red banner for non-curated URLs:

```tsx
{!isCuratedApp && (
  <View style={styles.untrustedBanner}>
    <Ionicons name="warning" size={16} color="#ff6b6b" />
    <Text style={styles.untrustedText}>Untrusted site — verify before signing</Text>
  </View>
)}
```

**d) Consider an allowlist for wallet injection:**

Only inject the Kondor provider script for curated dApps. For custom URLs, inject a limited version that only exposes `getAccounts()` and requires explicit user confirmation before each subsequent wallet method call.

---

### 3.2 Replace wildcard `postMessage` origin

**Finding:** #11 (Medium) — Responses posted with `'*'` origin can be intercepted by iframes.

**File:** `src/screens/DAppWebViewScreen.tsx:82`

**Current code:**
```ts
window.postMessage(${JSON.stringify(response)}, '*');
```

**Fix:** Use the `__kondorMobileResponse` callback exclusively and remove the wildcard postMessage:

```ts
// DAppWebViewScreen.tsx — sendResponse callback (line 75-87)
const script = `
  (function() {
    if (window.__kondorMobileResponse) {
      window.__kondorMobileResponse(${JSON.stringify(response)});
    }
    // REMOVED: window.postMessage(${JSON.stringify(response)}, '*');
  })();
  true;
`;
```

**Impact check:** Verify that no dApp relies on the `postMessage` path for responses. The `__kondorMobileResponse` callback was specifically added for the React Native bridge, so this should be the primary path.

---

### 3.3 Replace `Math.random()` with crypto-secure UUID

**Finding:** #21 (Low) — `Math.random()` in injected script for message correlation IDs.

**File:** `src/lib/kondorProvider.ts:24-29`

**Current code:**
```ts
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
```

**Fix:** Use `crypto.getRandomValues` (available in WebView context):

```ts
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    var buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    var hex = '';
    for (var i = 0; i < 16; i++) {
      var h = buf[i].toString(16);
      hex += h.length === 1 ? '0' + h : h;
    }
    return hex.slice(0,8) + '-' + hex.slice(8,12) + '-' + hex.slice(12,16) + '-' + hex.slice(16,20) + '-' + hex.slice(20);
  }
  // Fallback (should not happen in modern WebViews)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
```

---

## Phase 4: Medium — Data Protection & Logging

### 4.1 Suppress error logging in production

**Finding:** #10 (Medium) — Error logs are never suppressed, leaking transaction details on rooted devices.

**File:** `src/lib/logger.ts:48-51`

**Current code:**
```ts
error(...args: any[]) {
  // Always log errors, even in production
  console.error(...this.formatMessage('error', ...args));
}
```

**Fix:** Gate error logging behind `__DEV__` or use a crash reporting service:

```ts
error(...args: any[]) {
  if (this.enabled) {
    console.error(...this.formatMessage('error', ...args));
  }
  // In production, send sanitized errors to crash reporting (e.g., Sentry)
  // Never log raw error objects that may contain keys/addresses
}
```

### 4.2 Remove crypto capability logging

**File:** `src/lib/crypto.ts:16,18,40,46-51`

**Fix:** Wrap all console.log/error calls in `__DEV__` checks:

```ts
if (__DEV__) {
  console.log('[Crypto] react-native-quick-crypto installed successfully');
}
```

Or better — use the Logger class instead of bare `console.log`:

```ts
import { cryptoLogger as log } from './logger';

// Replace console.log('[Crypto] ...') with:
log.debug('react-native-quick-crypto installed successfully');
```

This way all crypto logs automatically respect the dev/prod flag.

### 4.3 Sanitize sensitive data in koinosStore logs

**File:** `src/stores/koinosStore.ts` — multiple lines

**Current problematic logs:**
```ts
log.debug(' Private key found, length:', privateKey.length);    // line 72
log.debug(' Signer created, address:', signer.getAddress());    // line 91
log.error(' Error stack:', error.stack);                         // line 103
```

**Fix:** Remove private key length logging entirely. For address logging, only log in dev:

```ts
// Line 72 — REMOVE (never log private key metadata)
// log.debug(' Private key found, length:', privateKey.length);
log.debug(' Private key found');  // Boolean only

// Line 91 — OK to keep (address is public), but ensure logger respects __DEV__

// Line 103 — Sanitize stack traces
log.error(' Initialization error:', error.message);
// REMOVE: log.error(' Error stack:', error.stack);
```

### 4.4 Encrypt wallet metadata in AsyncStorage

**Finding:** #12 (Medium) — Account names, addresses, derivation indices stored unencrypted.

**File:** `src/stores/walletStore.ts:397-408`

**Current code:**
```ts
{
  name: 'wallet-storage',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (state) => ({
    accounts: state.accounts,         // Contains addresses, names
    activeAccountId: state.activeAccountId,
    nextDerivationIndex: state.nextDerivationIndex,
    address: state.address,
    balance: state.balance,
    isWalletCreated: state.isWalletCreated,
  }),
}
```

**Fix:** Use `expo-secure-store` for the persisted state, or encrypt before writing to AsyncStorage:

```ts
import * as SecureStore from 'expo-secure-store';

// Option A: Use SecureStore-backed storage adapter
const secureStorage = {
  getItem: async (name: string) => {
    return await SecureStore.getItemAsync(name);
  },
  setItem: async (name: string, value: string) => {
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name: string) => {
    await SecureStore.deleteItemAsync(name);
  },
};

// In persist config:
storage: createJSONStorage(() => secureStorage),
```

**Note:** SecureStore has a 2048-byte value limit on some platforms. If the serialized state exceeds this, use an encryption layer over AsyncStorage instead (AES-256 with a key stored in SecureStore).

Apply the same pattern to `tokenStore.ts` and `walletConnectStore.ts` persistence configs.

---

## Phase 5: Medium — Input Validation & UX Safety

### 5.1 Add base58check address validation

**Finding:** #13 (Medium) — Only regex validation, no checksum check.

**File:** `src/lib/utils.ts:46-50`

**Current code:**
```ts
export const isValidAddress = (address: string): boolean => {
  const addressRegex = /^[1-9A-HJ-NP-Za-km-z]{33,35}$/;
  return addressRegex.test(address);
};
```

**Fix:** Add proper base58check validation using `bs58check` or koilib utilities:

```ts
import { utils } from 'koilib';

export const isValidAddress = (address: string): boolean => {
  if (!address || address.length < 25 || address.length > 35) return false;

  try {
    // koilib's decodeBase58 will throw if checksum is invalid
    const decoded = utils.decodeBase58(address);
    // Valid Koinos address has specific byte length after decoding
    return decoded.length >= 20;
  } catch {
    return false;
  }
};
```

If `koilib` doesn't expose checksum validation, use `bs58check`:

```ts
import bs58check from 'bs58check';

export const isValidAddress = (address: string): boolean => {
  try {
    bs58check.decode(address);
    return true;
  } catch {
    return false;
  }
};
```

### 5.2 Mask mnemonic input on import

**Finding:** #14 (Medium) — Mnemonic input is a plain multiline `TextInput`.

**File:** `src/screens/ImportWalletScreen.tsx:76-90`

**Current code:**
```tsx
<Input
  label="Recovery Phrase"
  placeholder="Enter your 12 words separated by spaces"
  value={mnemonic}
  multiline
  numberOfLines={4}
  autoCapitalize="none"
  autoCorrect={false}
/>
```

**Fix:** Add a toggle to show/hide the mnemonic, defaulting to hidden:

```tsx
const [showMnemonic, setShowMnemonic] = useState(false);

<View>
  <Input
    label="Recovery Phrase"
    placeholder="Enter your 12 words separated by spaces"
    value={mnemonic}
    onChangeText={(text) => { setMnemonic(text); setError(''); }}
    multiline={showMnemonic}
    numberOfLines={showMnemonic ? 4 : 1}
    secureTextEntry={!showMnemonic}
    autoCapitalize="none"
    autoCorrect={false}
    autoComplete="off"
    textContentType="none"  // Prevents iOS autofill suggestions
  />
  <TouchableOpacity onPress={() => setShowMnemonic(!showMnemonic)}>
    <Ionicons name={showMnemonic ? 'eye-off' : 'eye'} size={20} />
    <Text>{showMnemonic ? 'Hide' : 'Show'}</Text>
  </TouchableOpacity>
</View>
```

**Note:** `secureTextEntry` doesn't work with `multiline` on all platforms. Alternative: render each word as a dot/bullet and only show the word being actively edited.

### 5.3 Add background privacy screen

**Finding:** #15 (Medium) — App content visible in app switcher thumbnail.

**File:** `App.tsx` or `src/navigation/AppNavigator.tsx`

**Fix:** Use `react-native-screens` privacy mode or listen for AppState changes:

```ts
// Option A: expo-screen-capture (prevents screenshots + hides in switcher)
import * as ScreenCapture from 'expo-screen-capture';

useEffect(() => {
  // Activate screen security (hides content in app switcher)
  ScreenCapture.preventScreenCaptureAsync();
  return () => ScreenCapture.allowScreenCaptureAsync();
}, []);

// Option B: Manual overlay on background
import { AppState, View } from 'react-native';

const [isBackground, setIsBackground] = useState(false);

useEffect(() => {
  const sub = AppState.addEventListener('change', (state) => {
    setIsBackground(state !== 'active');
  });
  return () => sub.remove();
}, []);

// In render:
{isBackground && (
  <View style={StyleSheet.absoluteFill}>
    <View style={{ flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' }}>
      <Image source={require('./assets/logo.png')} />
    </View>
  </View>
)}
```

---

## Phase 6: Medium — External Data Integrity

### 6.1 Add token list integrity verification

**Finding:** #16 (Medium) — Token list fetched from GitHub with no signature or hash check.

**File:** `src/stores/tokenStore.ts:78,154-172`

**Fix (pragmatic approach):**

```ts
// Known-good token contract addresses (hardcoded safety check)
const KNOWN_TOKEN_CONTRACTS: Record<string, string> = {
  'KOIN': '15DJN4a8SgrbGxAgelBhnZh88EnKoiVKai',
  'VHP': '18tWNU7E4yuQzz7hMVpceb9ixmaWLVyQsr',
  // ... other verified tokens
};

async function fetchKoinDXTokenList(): Promise<KoinDXToken[]> {
  const response = await fetch(KOINDX_TOKEN_LIST_URL);
  if (!response.ok) throw new Error(`Failed: ${response.status}`);

  const data = await response.json();
  const tokens = data.tokens || [];

  // Validate known tokens haven't been tampered with
  for (const token of tokens) {
    const expectedAddress = KNOWN_TOKEN_CONTRACTS[token.symbol];
    if (expectedAddress && token.address !== expectedAddress) {
      throw new Error(
        `Token list integrity check failed: ${token.symbol} contract address mismatch`
      );
    }
  }

  return tokens;
}
```

For a more robust approach, pin a SHA-256 hash of the expected token list response, or use a backend that signs the token list.

### 6.2 Enforce HTTPS for DApp browser

**Finding:** #17 (Medium) — `http://` URLs explicitly allowed.

Already covered in Phase 3.1 fix (b). Ensure the check is:

```ts
if (url.startsWith('http://')) {
  Alert.alert('Insecure Connection', 'Only HTTPS URLs are supported for security.');
  return;
}
```

---

## Phase 7: Low — Defense in Depth

### 7.1 Add jailbreak / root detection

**Finding:** #18 (Low)

**Fix:** Install `jail-monkey` or `expo-device`:

```ts
import JailMonkey from 'jail-monkey';

if (JailMonkey.isJailBroken()) {
  Alert.alert(
    'Security Warning',
    'This device appears to be jailbroken/rooted. Wallet security may be compromised. Proceed with caution.',
    [{ text: 'I understand' }]
  );
}
```

### 7.2 Show granular WalletConnect permissions

**Finding:** #19 (Low) — Session approval auto-grants all methods.

**File:** `src/stores/walletConnectStore.ts:340-350`

**Fix:** Show the requested methods in the approval dialog so users understand what they're granting:

```ts
// In the session approval alert, list the requested methods:
Alert.alert(
  `Connect to ${peerMeta.name}?`,
  `This app is requesting:\n\n` +
  requestedMethods.map(m => `• ${formatMethodName(m)}`).join('\n') +
  '\n\nAllow connection?',
  [
    { text: 'Deny', style: 'cancel' },
    { text: 'Allow', onPress: approveSession }
  ]
);
```

---

## Phase 8: Recommended — Encrypt Mnemonic at App Level

**Finding:** #4 (High) — Mnemonic stored raw in SecureStore. Best practice is to also encrypt with a user-derived key.

This is the most impactful long-term security improvement but also the most complex. It should be done after Phase 2.1 (PIN system) since the PIN is needed as the encryption key source.

**Implementation outline:**

1. When user sets PIN, derive an encryption key: `PIN → PBKDF2(100,000 iterations) → AES-256-GCM key`
2. Encrypt mnemonic with this key before storing in SecureStore
3. On unlock, decrypt mnemonic with PIN-derived key
4. If biometrics are enabled, also store the encryption key in SecureStore (biometric-protected)

```ts
import * as Crypto from 'expo-crypto';

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  // Use PBKDF2 with high iteration count
  // Note: This may require a native module for proper PBKDF2
  // expo-crypto provides basic hashing; for PBKDF2, consider
  // react-native-quick-crypto or a JS implementation
}

async function encryptMnemonic(mnemonic: string, pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // AES-GCM encryption
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(mnemonic)
  );

  // Store: salt + iv + ciphertext (base64 encoded)
  return btoa(String.fromCharCode(...salt, ...iv, ...new Uint8Array(encrypted)));
}
```

**Migration path:** On app update, prompt user to set a PIN. Use the PIN to encrypt the existing raw mnemonic, then delete the raw version from SecureStore.

---

## Verification Checklist

After implementing all fixes, verify:

- [ ] `provider:sendTransaction` shows approval modal (Phase 1.1)
- [ ] In-app sends require biometric auth (Phase 1.2)
- [ ] WalletConnect project ID not in source code (Phase 1.3)
- [ ] App shows lock screen on launch and after backgrounding (Phase 2.1)
- [ ] PIN entry has progressive lockout after 3 failures (Phase 2.1)
- [ ] Signer is not cached in store between transactions (Phase 2.2)
- [ ] Clipboard auto-clears 30s after copying secrets (Phase 2.3)
- [ ] Only mnemonic stored in SecureStore (no per-account keys) (Phase 2.4)
- [ ] Custom URLs show untrusted site warning (Phase 3.1)
- [ ] HTTP URLs rejected in DApp browser (Phase 3.1)
- [ ] No wildcard `postMessage` in WebView responses (Phase 3.2)
- [ ] No `console.log`/`console.error` output in production build (Phase 4.1-4.3)
- [ ] Address validation catches checksum-invalid addresses (Phase 5.1)
- [ ] Mnemonic input has show/hide toggle (Phase 5.2)
- [ ] App switcher shows privacy screen, not wallet content (Phase 5.3)
- [ ] Tampered token list is detected and rejected (Phase 6.1)
- [ ] Jailbreak warning shown on compromised devices (Phase 7.1)
- [ ] WalletConnect shows requested permissions (Phase 7.2)

---

## File Change Summary

| File | Changes |
|------|---------|
| `src/lib/kondorProvider.ts` | Move `sendTransaction`/`submitBlock` to APPROVAL_COMMANDS, replace Math.random UUID |
| `src/screens/SendScreen.tsx` | Add biometric auth before transfer |
| `src/stores/walletConnectStore.ts` | Move project ID to env config |
| `src/navigation/AppNavigator.tsx` | Add lock screen gate, AppState listener |
| `src/stores/koinosStore.ts` | Remove cached signer, derive on-demand, sanitize logs |
| `src/stores/walletStore.ts` | Remove per-account key caching, remove legacy key storage |
| `src/screens/SettingsScreen.tsx` | Use clipboard auto-clear utility |
| `src/screens/CreateWalletScreen.tsx` | Use clipboard auto-clear utility |
| `src/screens/BrowserScreen.tsx` | Block HTTP, add untrusted site warning |
| `src/screens/DAppWebViewScreen.tsx` | Remove wildcard postMessage, add untrusted banner |
| `src/lib/logger.ts` | Gate error logging behind `__DEV__` |
| `src/lib/crypto.ts` | Use logger instead of console.log |
| `src/lib/utils.ts` | Add base58check validation |
| `src/screens/ImportWalletScreen.tsx` | Add mnemonic show/hide toggle |
| `src/lib/biometrics.ts` | No changes (already solid) |
| `App.tsx` | Add privacy screen overlay |
| **New files:** | |
| `src/services/auth.ts` | PIN hashing, verification, brute-force protection |
| `src/screens/LockScreen.tsx` | PIN entry lock screen |
| `src/screens/SetupPinScreen.tsx` | PIN setup flow |
| `src/lib/clipboard.ts` | Auto-clearing clipboard utility |
