# Kondor3 Mobile Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Kondor Mobile to user-visible feature parity with Kondor3's Chrome extension, adapted to Expo/React Native platform constraints.

**Architecture:** Treat Kondor3 as the feature and domain-logic reference, not as a platform blueprint. Mobile parity is implemented through Expo screens, Zustand stores, WebView provider injection, and WalletConnect instead of Chrome background/content/inpage scripts. Each parity area is isolated behind mobile-native stores and services so network, dApp permissions, token management, NFTs, backup, and history can ship independently.

**Tech Stack:** Expo SDK 54, React Native 0.81, React 19, TypeScript, Zustand, AsyncStorage, Expo SecureStore, Expo LocalAuthentication, koilib, protobufjs/minimal, react-native-webview, WalletConnect/Reown, Jest.

## Global Constraints

- Work on branch `feature/kondor3-mobile-parity`.
- Default branch remains `master`; never create or use `main`.
- Parity means mobile equivalents of Kondor3 user-visible features, not literal Chrome extension background/content/side-panel mechanics.
- Chrome-only UI such as extension side panel, popup resize, browser toolbar, and content-script injection outside the in-app WebView is out of scope.
- Existing native swap behavior on this branch is treated as the baseline and must not regress.
- Automated tests must not broadcast real mainnet transactions.
- Every signing path requires biometric or PIN-gated wallet authentication.
- Private keys and signer instances must not be cached beyond one signing action.
- `getAccounts` grants may be remembered per origin; signing, message signing, hash signing, and transaction broadcasting must never be auto-approved.
- Network selection must be app-wide and affect balances, history, swap, dApp provider calls, WalletConnect namespaces, explorer links, and NFT support.
- Mainnet and Harbinger are the only supported networks for this parity pass.
- User-facing copy should stay mobile-native and concise; do not copy browser-extension wording when it references extension concepts.

---

## Current Parity Baseline

Mobile already has:

- Wallet create/import, PIN setup, lock flow, biometric authentication.
- Multi-account switch/add/import/rename/remove basics.
- Home, Collectibles, Swap, Apps tab shell.
- Send, receive, token balances, native KoinDX swap, activity history.
- In-app WebView dApp provider injection.
- WalletConnect scanner/session plumbing.
- Contacts/address book, which Kondor3 does not fully expose yet.

The largest missing areas are:

- DApp grants, connected sites, origin security, message/hash signing.
- Real mainnet/Harbinger app-wide network selection.
- Token management, custom/hidden tokens, price/value display.
- Real NFT collectibles.
- Backup/export/import recovery.
- History tab/scoped pending transaction reconciliation.
- Settings consolidation.

---

## File Structure

### Network Foundation

- Create `src/stores/networkStore.ts`
  - Owns current network mode, network config, persistence, and selectors.
- Create `src/stores/__tests__/networkStore.test.ts`
  - Verifies default mainnet, Harbinger switching, persistence hydration, and config shape.
- Modify `src/lib/constants.ts`
  - Moves current static network constants behind typed configs without breaking existing imports.
- Modify `src/stores/koinosStore.ts`
  - Uses current network config for providers, KOIN contract, mana, and chain ID.
- Modify `src/stores/tokenStore.ts`
  - Scopes token list and balances by `network:address`.
- Modify `src/hooks/useTransactionHistory.ts`
  - Fetches network-scoped history.
- Modify `src/lib/txHistory.ts`
  - Accepts network-specific REST endpoints.
- Modify `src/components/WalletConnectHandler.tsx`
  - Uses current network for generic provider requests.
- Modify `src/stores/walletConnectStore.ts`
  - Advertises only the active network namespace during session approval.
- Modify `src/screens/DAppWebViewScreen.tsx`
  - Uses current network for injected provider commands.

### DApp Permission And Security

- Create `src/lib/dapp/originSecurity.ts`
  - Mobile-safe port of Kondor3 origin risk inspection.
- Create `src/lib/dapp/permissions.ts`
  - Pure permission grant model for `getAccounts` only.
- Create `src/stores/dappPermissionStore.ts`
  - AsyncStorage persistence for per-origin grants.
- Create `src/lib/dapp/__tests__/originSecurity.test.ts`
  - Covers trusted, warning, danger, insecure, and malformed origins.
- Create `src/lib/dapp/__tests__/permissions.test.ts`
  - Covers grant creation, malformed grant rejection, risk escalation, stale account pruning, and revocation.
- Create `src/screens/ConnectedSitesScreen.tsx`
  - Lets users review and revoke remembered dApp grants.
- Modify `src/screens/SettingsScreen.tsx`
  - Adds entry to connected sites.
- Modify `src/screens/DAppWebViewScreen.tsx`
  - Replaces one-off `Alert.alert` connection prompt with grant-aware account approval UI.

### DApp Signing Parity

- Create `src/lib/dapp/messageSigning.ts`
  - Normalizes string, byte-array, hex, and base64url inputs for `signMessage` and `signHash`.
- Create `src/lib/dapp/__tests__/messageSigning.test.ts`
  - Covers byte normalization, 32-byte hash validation, output encoding, and invalid inputs.
- Create `src/components/DAppAccountApprovalModal.tsx`
  - Multi-account connect approval with remember-site toggle and origin notice.
- Create `src/components/DAppMessageSigningModal.tsx`
  - Message/hash signing approval with origin notice, raw hash acknowledgement, and authentication.
- Modify `src/screens/DAppWebViewScreen.tsx`
  - Implements `signer:signMessage` and `signer:signHash`.
- Modify `src/components/WalletConnectHandler.tsx`
  - Implements `koinos_signMessage` and `koinos_signHash`.
- Modify `src/stores/walletConnectStore.ts`
  - Separates pending message/hash requests from pending transaction requests.

### Transaction Approval Parity

- Modify `src/components/TransactionApprovalModal.tsx`
  - Adds origin security notice, network mismatch handling, richer decoded operations, and free-mana incompatibility display.
- Modify `src/lib/transactionDecoder.ts`
  - Expands dApp operation labels for transfer, approve, KoinDX swap, and unknown calls.
- Modify `src/lib/__tests__/transactionDecoder.test.ts`
  - Covers known operations, KoinDX swap decode, and unknown fallback.
- Create `src/components/__tests__/TransactionApprovalModal.test.tsx`
  - Verifies free-mana handling, KoinDX dApp swap blocking, signer mismatch, and decoded operation rendering.

### Token Management And Prices

- Create `src/stores/customTokenStore.ts`
  - Persists custom tokens and hidden system token IDs by network.
- Create `src/stores/__tests__/customTokenStore.test.ts`
  - Covers add, remove, hide, show, duplicate prevention, and network scoping.
- Create `src/lib/tokenPrices.ts`
  - Fetches KOIN price and derives token USD values through KoinDX where available.
- Create `src/lib/__tests__/tokenPrices.test.ts`
  - Covers price success, unavailable pairs, zero balances, and API failure fallback.
- Create `src/screens/TokenManagementScreen.tsx`
  - Mobile token list management with add custom token, hide/show, and remove custom token.
- Modify `src/stores/tokenStore.ts`
  - Merges system, custom, and hidden tokens into the visible asset list.
- Modify `src/screens/HomeScreen.tsx`
  - Displays portfolio value and token value where price data exists.
- Modify `src/screens/SettingsScreen.tsx`
  - Adds Manage Tokens entry.

### NFT Collectibles

- Create `src/lib/nftService.ts`
  - Mobile-safe port of Kondor3 NFT discovery and metadata fetch behavior.
- Create `src/hooks/useNFTs.ts`
  - Fetches, groups, refreshes, and error-handles owned NFTs.
- Create `src/lib/__tests__/nftService.test.ts`
  - Covers owner lookup, metadata normalization, missing metadata, IPFS URL conversion, and Harbinger unsupported state.
- Modify `src/screens/CollectiblesScreen.tsx`
  - Replaces placeholder with NFT grid, empty state, refresh, collection grouping, and detail view entry.
- Create `src/screens/NFTDetailScreen.tsx`
  - Shows image, name, collection, token ID, owner, metadata, and explorer link.
- Modify `src/navigation/TabNavigator.tsx`
  - Adds NFT detail screen under Collectibles stack if a separate stack is needed.

### Backup And Recovery

- Create `src/lib/walletBackup.ts`
  - Creates, verifies, exports, and imports versioned wallet backups.
- Create `src/lib/__tests__/walletBackup.test.ts`
  - Covers valid backup, wrong PIN failure, checksum failure, missing encrypted key failure, and version rejection.
- Create `src/screens/BackupRecoveryScreen.tsx`
  - Shows backup status, create backup, import backup, and recent backup timestamps.
- Modify `src/stores/walletStore.ts`
  - Exposes backup-safe encrypted wallet snapshot and restore entry point.
- Modify `src/screens/SettingsScreen.tsx`
  - Adds Backup & Recovery entry.
- Add dependencies only if needed after verifying Expo SDK compatibility:
  - `expo-file-system`
  - `expo-document-picker`
  - `expo-sharing`

### History And Monitoring

- Create `src/stores/transactionStore.ts`
  - Persists local pending transactions scoped by network and address.
- Create `src/stores/__tests__/transactionStore.test.ts`
  - Covers add pending, confirm by chain ID, remove stale pending, and network scoping.
- Modify `src/hooks/useTransactionHistory.ts`
  - Merges API transactions with local pending transactions.
- Modify `src/screens/ActivityScreen.tsx`
  - Adds filters for all, send, receive, swap, and pending.
- Modify `src/navigation/TabNavigator.tsx`
  - Decide and implement either a dedicated History tab or a more discoverable Home entry. Preferred default is a dedicated History tab if tab density remains acceptable on iPhone 15 Pro width.

### Settings Consolidation

- Modify `src/screens/SettingsScreen.tsx`
  - Converts current static settings into a navigable settings index.
- Create `src/screens/SecurityPrivacyScreen.tsx`
  - Moves recovery phrase, private key, lock wallet, remove wallet, and authentication preferences.
- Create `src/screens/NetworkSettingsScreen.tsx`
  - Network selector for Mainnet and Harbinger.
- Modify `src/navigation/TabNavigator.tsx`
  - Adds settings stack screens.

---

## Task 1: Branch, Baseline, And Plan Commit

**Files:**
- Read: `package.json`
- Read: `tsconfig.json`
- Read: `docs/superpowers/plans/2026-06-19-kondor3-mobile-feature-parity.md`

**Interfaces:**
- Consumes: branch `feature/kondor3-mobile-parity`
- Produces: committed planning baseline

- [ ] **Step 1: Confirm branch**

Run:

```bash
git status --short --branch
```

Expected:

```text
## feature/kondor3-mobile-parity
?? docs/superpowers/plans/2026-06-19-kondor3-mobile-feature-parity.md
```

- [ ] **Step 2: Run baseline tests**

Run:

```bash
npm test -- --runInBand
```

Expected: all current tests pass before parity work starts.

- [ ] **Step 3: Run baseline type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no type errors from the branch baseline. If existing errors appear, capture exact file paths and decide whether they block Task 2 before modifying source files.

- [ ] **Step 4: Commit the plan**

Run:

```bash
git add docs/superpowers/plans/2026-06-19-kondor3-mobile-feature-parity.md
git commit -m "docs: plan kondor3 mobile parity"
```

Expected: the plan is committed before implementation work begins.

---

## Task 2: Network Foundation

**Files:**
- Create: `src/stores/networkStore.ts`
- Create: `src/stores/__tests__/networkStore.test.ts`
- Modify: `src/lib/constants.ts`
- Modify: `src/stores/koinosStore.ts`
- Modify: `src/stores/tokenStore.ts`
- Modify: `src/hooks/useTransactionHistory.ts`
- Modify: `src/lib/txHistory.ts`
- Modify: `src/components/WalletConnectHandler.tsx`
- Modify: `src/stores/walletConnectStore.ts`
- Modify: `src/screens/DAppWebViewScreen.tsx`
- Create or modify tests near each changed module.

**Interfaces:**
- Produces:
  - `NetworkMode = 'mainnet' | 'harbinger'`
  - `NetworkConfig`
  - `useNetworkStore`
  - `getActiveNetworkConfig(): NetworkConfig`
  - `setNetworkMode(mode: NetworkMode): Promise<void>`
- Consumes:
  - Existing constants from `src/lib/constants.ts`
  - Existing provider creation in Koinos, token, history, WebView, and WalletConnect modules.

- [ ] **Step 1: Write failing network store tests**

Create `src/stores/__tests__/networkStore.test.ts` with tests for:

- default mode is `mainnet`
- `setNetworkMode('harbinger')` persists Harbinger
- invalid persisted values normalize to `mainnet`
- config includes `chainId`, `rpcNodes`, `koinContract`, `explorer`, `rest`, `freeManaSharer`, and `isTestnet`

Run:

```bash
npm test -- src/stores/__tests__/networkStore.test.ts --runInBand
```

Expected: fails because `networkStore.ts` does not exist.

- [ ] **Step 2: Implement network store**

Create `src/stores/networkStore.ts` with typed configs copied from current `MAINNET` and `TESTNET` constants plus Kondor3's Harbinger metadata where mobile lacks explorer/rest fields.

- [ ] **Step 3: Wire providers to active network**

Replace direct `DEFAULT_NETWORK` provider usage in:

- `src/stores/koinosStore.ts`
- `src/stores/tokenStore.ts`
- `src/hooks/useTransactionHistory.ts`
- `src/components/WalletConnectHandler.tsx`
- `src/screens/DAppWebViewScreen.tsx`

Use active network selectors. Preserve old default behavior when no store hydration has completed by returning mainnet.

- [ ] **Step 4: Scope caches by network**

Update token and history cache keys to include `networkMode:address`. A network switch must not display balances or history from the previous network while the new network is loading.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/stores/__tests__/networkStore.test.ts src/hooks/__tests__ src/stores/__tests__ --runInBand
npx tsc --noEmit
```

Expected: tests and type-check pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src lib docs package.json package-lock.json
git commit -m "feat: add mobile network state"
```

Expected: one commit containing only network foundation changes.

---

## Task 3: DApp Origin Security And Connected Sites

**Files:**
- Create: `src/lib/dapp/originSecurity.ts`
- Create: `src/lib/dapp/permissions.ts`
- Create: `src/stores/dappPermissionStore.ts`
- Create: `src/lib/dapp/__tests__/originSecurity.test.ts`
- Create: `src/lib/dapp/__tests__/permissions.test.ts`
- Create: `src/screens/ConnectedSitesScreen.tsx`
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/navigation/TabNavigator.tsx`
- Modify: `src/screens/DAppWebViewScreen.tsx`

**Interfaces:**
- Produces:
  - `inspectDAppOrigin(origin: string, options?: OriginSecurityOptions): DAppOriginSecurity`
  - `createGrant(params): DAppPermissionGrant | null`
  - `resolveConnection(origin, store, availableAccounts): ConnectionResolution`
  - `useDAppPermissionStore`
- Consumes:
  - Account list from `walletStore`
  - Origin from WebView app metadata or current URL.

- [ ] **Step 1: Port pure domain tests from Kondor3**

Write mobile tests equivalent to Kondor3's dApp security and permission tests. Signing capabilities must be rejected if found in a persisted grant.

Run:

```bash
npm test -- src/lib/dapp/__tests__/originSecurity.test.ts src/lib/dapp/__tests__/permissions.test.ts --runInBand
```

Expected: fails because modules are not implemented.

- [ ] **Step 2: Implement pure security and permission modules**

Port Kondor3's pure domain logic without Chrome dependencies. Use `URL` parsing available in React Native runtime or add a tested URL normalization helper if needed.

- [ ] **Step 3: Implement AsyncStorage grant store**

Persist only public grant data:

- origin
- hostname
- selected account addresses
- lifetime
- risk at grant
- created and last-used timestamps

Do not store private keys, signatures, pending requests, or transaction data in this store.

- [ ] **Step 4: Add Connected Sites screen**

Implement a mobile settings screen that lists grants by hostname and selected accounts. Include revoke per site and revoke all actions, each with confirmation.

- [ ] **Step 5: Wire WebView getAccounts to grants**

For `getAccounts`:

- try grant fast-path first
- if no valid grant, show account approval
- if user remembers site, save grant
- return selected accounts in Kondor provider shape

- [ ] **Step 6: Verify**

Run:

```bash
npm test -- src/lib/dapp/__tests__ src/stores/__tests__ --runInBand
npx tsc --noEmit
```

Expected: tests and type-check pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src
git commit -m "feat: add dapp connection grants"
```

Expected: one commit with dApp grant logic and connected sites UI.

---

## Task 4: Message And Hash Signing Parity

**Files:**
- Create: `src/lib/dapp/messageSigning.ts`
- Create: `src/lib/dapp/__tests__/messageSigning.test.ts`
- Create: `src/components/DAppMessageSigningModal.tsx`
- Modify: `src/screens/DAppWebViewScreen.tsx`
- Modify: `src/components/WalletConnectHandler.tsx`
- Modify: `src/stores/walletConnectStore.ts`
- Create or modify component tests for signing request state.

**Interfaces:**
- Produces:
  - `normalizeBytesInput(value: unknown): Uint8Array`
  - `normalizeHashBytes(hash: unknown): Uint8Array`
  - `normalizeMessageForSigning(message: unknown): string | Uint8Array`
  - `signMessageWithAuthenticatedAccount(params): Promise<string>`
  - `signHashWithAuthenticatedAccount(params): Promise<Uint8Array>`
- Consumes:
  - Existing wallet private-key retrieval/authentication behavior.
  - Pending WebView and WalletConnect request IDs.

- [ ] **Step 1: Write normalization tests**

Cover string messages, byte arrays, ArrayBuffer, hex strings, base64url strings, object-like byte maps, invalid byte input, and raw hash length enforcement.

Run:

```bash
npm test -- src/lib/dapp/__tests__/messageSigning.test.ts --runInBand
```

Expected: fails because `messageSigning.ts` does not exist.

- [ ] **Step 2: Implement signing helpers**

Use koilib `Signer.signMessage` and `Signer.signHash`. Return base64url string for message signing to match Kondor3 behavior. Return byte-compatible result for hash signing, preserving the response shape expected by dApps.

- [ ] **Step 3: Add modal UI**

Show:

- requesting site
- risk notice
- account address
- message preview or hash preview
- advanced raw data toggle
- explicit raw hash acknowledgement for `signHash`
- approve and reject actions

- [ ] **Step 4: Wire WebView provider**

Replace the current `Message signing not yet implemented` branch in `DAppWebViewScreen.tsx` with pending modal flow and response dispatch.

- [ ] **Step 5: Wire WalletConnect**

Handle `koinos_signMessage` and `koinos_signHash` as signing requests instead of generic unsupported requests. Preserve transaction signing behavior.

- [ ] **Step 6: Verify**

Run:

```bash
npm test -- src/lib/dapp/__tests__/messageSigning.test.ts src/components/__tests__ --runInBand
npx tsc --noEmit
```

Expected: tests and type-check pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src
git commit -m "feat: add dapp message signing"
```

Expected: one commit with message/hash signing parity.

---

## Task 5: Transaction Approval Parity

**Files:**
- Modify: `src/components/TransactionApprovalModal.tsx`
- Modify: `src/lib/transactionDecoder.ts`
- Modify: `src/lib/__tests__/transactionDecoder.test.ts`
- Create: `src/components/__tests__/TransactionApprovalModal.test.tsx`
- Modify: `src/screens/DAppWebViewScreen.tsx`
- Modify: `src/components/WalletConnectHandler.tsx`

**Interfaces:**
- Produces:
  - richer decoded operation list
  - origin security display for dApp transactions
  - network mismatch rejection before signing
  - consistent free-mana behavior for dApp and WalletConnect transactions
- Consumes:
  - network store from Task 2
  - origin security from Task 3
  - existing native swap operation decoder.

- [ ] **Step 1: Expand decoder tests**

Add test coverage for:

- KOIN transfer
- token approve
- KoinDX `swap_tokens_in`
- unknown call contract
- unknown system call

Run:

```bash
npm test -- src/lib/__tests__/transactionDecoder.test.ts --runInBand
```

Expected: fails until decoder supports all required labels.

- [ ] **Step 2: Expand decoder implementation**

Keep decoder pure. It must not fetch network data, decrypt keys, or mutate transactions.

- [ ] **Step 3: Add approval modal tests**

Cover:

- KoinDX dApp swaps are blocked with mobile-native copy directing users to the Swap tab
- signer address not in wallet is rejected before auth
- transaction chain mismatch is rejected before auth
- decoded operation rows render for known operations
- unknown operations render contract ID and entry point

- [ ] **Step 4: Update modal UI and signing flow**

Add origin notice and network label. Keep private-key lifetime scoped to the approve handler.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/lib/__tests__/transactionDecoder.test.ts src/components/__tests__/TransactionApprovalModal.test.tsx --runInBand
npx tsc --noEmit
```

Expected: tests and type-check pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src
git commit -m "feat: improve dapp transaction approvals"
```

Expected: one commit with transaction approval parity.

---

## Task 6: Token Management And Portfolio Values

**Files:**
- Create: `src/stores/customTokenStore.ts`
- Create: `src/stores/__tests__/customTokenStore.test.ts`
- Create: `src/lib/tokenPrices.ts`
- Create: `src/lib/__tests__/tokenPrices.test.ts`
- Create: `src/screens/TokenManagementScreen.tsx`
- Modify: `src/stores/tokenStore.ts`
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/navigation/TabNavigator.tsx`

**Interfaces:**
- Produces:
  - custom token persistence by network
  - hidden system token support
  - token USD price and portfolio value display
  - token management screen
- Consumes:
  - token list from existing KoinDX source
  - network store from Task 2
  - KoinDX quote helpers from native swap work.

- [ ] **Step 1: Write custom token store tests**

Run:

```bash
npm test -- src/stores/__tests__/customTokenStore.test.ts --runInBand
```

Expected: fails until store exists.

- [ ] **Step 2: Implement custom token store**

Persist by network. System tokens can be hidden, not removed. Custom tokens can be removed.

- [ ] **Step 3: Write token price tests**

Cover price success, unavailable price, failed API, and zero balances.

Run:

```bash
npm test -- src/lib/__tests__/tokenPrices.test.ts --runInBand
```

Expected: fails until service exists.

- [ ] **Step 4: Implement token prices**

Use a short-lived cache. Price failures must not block balance display.

- [ ] **Step 5: Wire token store and UI**

Merge system, custom, and hidden tokens into the visible list. Add Manage Tokens under Settings. Add portfolio value to Home only when price data is available.

- [ ] **Step 6: Verify**

Run:

```bash
npm test -- src/stores/__tests__/customTokenStore.test.ts src/lib/__tests__/tokenPrices.test.ts --runInBand
npx tsc --noEmit
```

Expected: tests and type-check pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src
git commit -m "feat: add token management"
```

Expected: one commit with token management and prices.

---

## Task 7: NFT Collectibles

**Files:**
- Create: `src/lib/nftService.ts`
- Create: `src/lib/__tests__/nftService.test.ts`
- Create: `src/hooks/useNFTs.ts`
- Modify: `src/screens/CollectiblesScreen.tsx`
- Create: `src/screens/NFTDetailScreen.tsx`
- Modify: `src/navigation/TabNavigator.tsx`

**Interfaces:**
- Produces:
  - `fetchNFTsByOwner(address, networkMode, provider): Promise<NFT[]>`
  - `groupNFTsByCollection(nfts): NFTCollection[]`
  - `useNFTs()`
- Consumes:
  - current account address
  - network store
  - provider for mainnet NFT reads.

- [ ] **Step 1: Write NFT service tests**

Cover owned NFT lookup, metadata normalization, IPFS URL conversion, unsupported Harbinger state, and empty owner state.

Run:

```bash
npm test -- src/lib/__tests__/nftService.test.ts --runInBand
```

Expected: fails until service exists.

- [ ] **Step 2: Port Kondor3 NFT service behavior**

Keep network calls injectable for tests. Do not fetch NFTs on Harbinger; return an unsupported state to the hook.

- [ ] **Step 3: Implement hook**

Expose `nfts`, `collections`, `loading`, `error`, `refetch`, and `isTestnet`.

- [ ] **Step 4: Replace placeholder Collectibles screen**

Show:

- loading state
- empty state
- unsupported Harbinger state
- collection groups
- NFT grid rows
- pull-to-refresh
- NFT detail navigation

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/lib/__tests__/nftService.test.ts --runInBand
npx tsc --noEmit
```

Expected: tests and type-check pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src
git commit -m "feat: add nft collectibles"
```

Expected: one commit with real Collectibles parity.

---

## Task 8: Backup And Recovery

**Files:**
- Create: `src/lib/walletBackup.ts`
- Create: `src/lib/__tests__/walletBackup.test.ts`
- Create: `src/screens/BackupRecoveryScreen.tsx`
- Modify: `src/stores/walletStore.ts`
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/navigation/TabNavigator.tsx`
- Modify: `package.json` and `package-lock.json` only if Expo backup file dependencies are needed.

**Interfaces:**
- Produces:
  - `createWalletBackup(walletSnapshot, pin): Promise<BackupData>`
  - `verifyWalletBackup(backup, pin): Promise<boolean>`
  - `restoreWalletBackup(backup, pin): Promise<RestoredWalletSnapshot>`
- Consumes:
  - wallet encrypted account data
  - PIN-authenticated decrypt path
  - Expo file/share APIs if export/import is implemented with native files.

- [ ] **Step 1: Write backup tests**

Cover valid backup, wrong PIN, checksum mismatch, unsupported version, missing encrypted key, and restore snapshot shape.

Run:

```bash
npm test -- src/lib/__tests__/walletBackup.test.ts --runInBand
```

Expected: fails until backup module exists.

- [ ] **Step 2: Implement backup codec**

Use versioned JSON with integrity check. Verify by decrypting each encrypted account with the provided PIN. Do not include plaintext private keys or mnemonic in backup data.

- [ ] **Step 3: Add wallet store backup interfaces**

Expose methods that return encrypted wallet data and restore verified encrypted data. Do not bypass existing PIN setup or lock semantics.

- [ ] **Step 4: Add Backup & Recovery screen**

Support:

- create backup
- share or save backup file
- import backup file
- verify backup before restore
- show last successful backup timestamp

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/lib/__tests__/walletBackup.test.ts --runInBand
npx tsc --noEmit
```

Expected: tests and type-check pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src package.json package-lock.json
git commit -m "feat: add wallet backup recovery"
```

Expected: one commit with backup and recovery parity.

---

## Task 9: History And Pending Transaction Parity

**Files:**
- Create: `src/stores/transactionStore.ts`
- Create: `src/stores/__tests__/transactionStore.test.ts`
- Modify: `src/hooks/useTransactionHistory.ts`
- Modify: `src/screens/ActivityScreen.tsx`
- Modify: `src/navigation/TabNavigator.tsx`
- Modify: send, swap, dApp, and WalletConnect success paths that broadcast transactions.

**Interfaces:**
- Produces:
  - persisted local pending transaction store scoped by network and address
  - history merge behavior matching Kondor3's confirmed-vs-pending reconciliation
  - visible history filters
- Consumes:
  - network store
  - existing parsed transaction history
  - broadcast receipts from send, swap, dApp, and WalletConnect flows.

- [ ] **Step 1: Write transaction store tests**

Cover local pending add, confirm by local ID, confirm by chain transaction ID, stale removal, and network scoping.

Run:

```bash
npm test -- src/stores/__tests__/transactionStore.test.ts --runInBand
```

Expected: fails until store exists.

- [ ] **Step 2: Implement transaction store**

Persist only non-sensitive transaction metadata needed for optimistic history. Do not persist private keys or raw signatures.

- [ ] **Step 3: Wire broadcast flows**

When send, swap, dApp transaction, or WalletConnect transaction broadcasts, add pending transaction metadata immediately. Remove it when confirmed history includes the chain transaction ID.

- [ ] **Step 4: Improve Activity UI**

Add filters for all, send, receive, swap, and pending. If a dedicated History tab is selected, update `TabNavigator.tsx`; otherwise make Activity discoverable from Home header.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/stores/__tests__/transactionStore.test.ts src/hooks/__tests__ --runInBand
npx tsc --noEmit
```

Expected: tests and type-check pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src
git commit -m "feat: improve transaction history"
```

Expected: one commit with history parity.

---

## Task 10: Settings Shell Consolidation

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`
- Create: `src/screens/SecurityPrivacyScreen.tsx`
- Create: `src/screens/NetworkSettingsScreen.tsx`
- Modify: `src/navigation/TabNavigator.tsx`
- Modify: tests for settings navigation if present; create focused tests if not present.

**Interfaces:**
- Produces:
  - settings index matching Kondor3 feature categories
  - network selector
  - security/privacy screen
  - lock wallet action
- Consumes:
  - screens and stores from Tasks 2 through 9.

- [ ] **Step 1: Create settings map**

Settings index entries must include:

- Manage Accounts
- Manage Tokens
- Security & Privacy
- Connected Sites
- Backup & Recovery
- Network
- Address Book or Contacts
- Lock Wallet
- Remove Wallet

- [ ] **Step 2: Move sensitive actions**

Move recovery phrase and private key reveal into `SecurityPrivacyScreen.tsx`. Each reveal must require authentication before showing or copying data.

- [ ] **Step 3: Add network selector**

`NetworkSettingsScreen.tsx` must show Mainnet and Harbinger, current status, and a confirmation prompt before switching networks.

- [ ] **Step 4: Wire navigation**

Add missing settings screens to a dedicated Settings stack nested under the Home stack. Keep existing account and contacts flows reachable from the Settings index.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- --runInBand
npx tsc --noEmit
```

Expected: full test suite and type-check pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src
git commit -m "feat: consolidate settings parity"
```

Expected: one commit with settings shell parity.

---

## Task 11: Parity QA And Release Readiness

**Files:**
- Modify: `docs/development/progress.md`
- Modify: `docs/development/todo.md`
- Modify: `STATUS.md`
- Create: `docs/development/kondor3-mobile-parity-qa.md`

**Interfaces:**
- Produces:
  - manual QA checklist
  - updated project status
  - final parity gap list
- Consumes:
  - completed Tasks 2 through 10.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test -- --runInBand
npx tsc --noEmit
```

Expected: all tests pass and type-check passes.

- [ ] **Step 2: Run simulator smoke**

Run:

```bash
npm run ios
```

Expected: iOS simulator starts without Metro bundle errors.

- [ ] **Step 3: Manual smoke checklist**

Create `docs/development/kondor3-mobile-parity-qa.md` with pass/fail rows for:

- wallet unlock
- account switching
- network switching
- send on mainnet read-only preparation path
- native swap quote and failure handling
- token hide/show
- custom token add/remove
- NFT empty or loaded state
- WebView getAccounts remembered grant
- WebView signMessage
- WebView signHash
- WebView signTransaction rejection and approval
- WalletConnect session approval
- WalletConnect message signing
- WalletConnect transaction signing
- connected-site revoke
- backup create
- backup verify/import
- history pending-to-confirmed transition

- [ ] **Step 4: Update docs**

Update:

- `docs/development/progress.md`
- `docs/development/todo.md`
- `STATUS.md`

The updates must distinguish shipped parity, intentionally mobile-specific differences, and remaining gaps.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs STATUS.md
git commit -m "docs: record kondor3 parity qa"
```

Expected: one final docs commit with QA evidence and remaining gap list.

---

## Execution Order And Estimated Size

1. Task 2, Network Foundation: 1.5-2.5 days.
2. Task 3, DApp grants and connected sites: 2-3 days.
3. Task 4, message/hash signing: 2-3 days.
4. Task 5, transaction approval parity: 2-3 days.
5. Task 6, token management and prices: 3-5 days.
6. Task 7, NFT collectibles: 3-5 days.
7. Task 8, backup and recovery: 3-5 days.
8. Task 9, history and pending transactions: 2-3 days.
9. Task 10, settings consolidation: 1-2 days.
10. Task 11, QA and docs: 1-2 days.

Expected total: 4-6 focused weeks for strong parity. A high-value first milestone is Tasks 2-5, which gives mobile the most important extension-grade dApp behavior.

---

## Self-Review

- Spec coverage: Every audited parity gap has a task: network, dApp grants, connected sites, message/hash signing, transaction approvals, token management, prices, NFTs, backup, history, and settings.
- Scope check: This plan intentionally decomposes parity into independently shippable tasks because the full feature set spans multiple subsystems.
- Risk check: The largest risks are dApp signing response-shape compatibility, network switching side effects, NFT metadata reliability, and backup restore safety. Each high-risk area has a pure test module before UI work.
- Placeholder scan: The plan has no open requirement placeholders.
