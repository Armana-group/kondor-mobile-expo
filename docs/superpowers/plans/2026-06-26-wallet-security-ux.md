# Wallet Security UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement dismissible backup notices, secure-default manual-send confirmation settings, and Harbinger `tKOIN` labeling.

**Architecture:** Add a small persisted backup-notice dismissal store, extend existing auth preferences for manual-send confirmation, and wire both into the existing UI seams. Keep dApp and WalletConnect approvals unchanged, and fix testnet token metadata at the token-store layer.

**Tech Stack:** React Native, Expo SecureStore, AsyncStorage, Zustand, Jest, react-test-renderer.

## Global Constraints

- Keep the default wallet behavior secure.
- Do not disable backup warnings globally forever.
- Do not weaken dApp or WalletConnect transaction approvals.
- Do not change PIN setup, lock-screen behavior, or account-management biometric gates.
- Harbinger must display `tKOIN`, not `KOIN`.

---

### Task 1: Backup Notice Dismissal

**Files:**
- Create: `src/stores/backupNoticeDismissalStore.ts`
- Create: `src/stores/__tests__/backupNoticeDismissalStore.test.ts`
- Modify: `src/components/BackupStatusNotice.tsx`
- Modify: `src/components/__tests__/BackupStatusNotice.test.tsx`

**Interfaces:**
- Produces: `getBackupNoticeDismissalKey(backupHealth: BackupHealth): string | null`
- Produces: `useBackupNoticeDismissalStore` with `dismissNotice(key)`, `isDismissed(key)`, and `clearDismissals()`
- Consumes: `BackupHealth` and `isBackupHealthActionRequired`

- [x] Write failing tests for key generation and persisted dismissal matching.
- [x] Implement the dismissal store.
- [x] Write failing component tests for dismiss control and dismissal hiding.
- [x] Wire `BackupStatusNotice` to render a close icon button and hide matching dismissed keys.
- [x] Verify with `npx jest src/stores/__tests__/backupNoticeDismissalStore.test.ts src/components/__tests__/BackupStatusNotice.test.tsx --runInBand`.

### Task 2: Manual Send Confirmation Preference

**Files:**
- Modify: `src/services/auth.ts`
- Modify: `src/services/__tests__/auth.test.ts`
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/screens/__tests__/SettingsScreen.test.tsx`
- Modify: `src/screens/SendScreen.tsx`
- Modify: `src/screens/__tests__/SendScreen.test.tsx`

**Interfaces:**
- Produces: `isSendConfirmationRequired(): Promise<boolean>`
- Produces: `setSendConfirmationRequired(required: boolean): Promise<void>`
- Consumes: `requireBiometricAuth('send this transaction')`

- [x] Write failing auth tests for secure default and persistence.
- [x] Implement the auth preference in SecureStore.
- [x] Write failing Settings tests for row display and warning confirmation.
- [x] Wire `SettingsScreen` to load, display, and update the setting.
- [x] Write failing Send tests for requiring auth by default and skipping auth when disabled.
- [x] Wire `SendScreen` to load preference, skip auth only when disabled, and show `Send confirmation is off`.
- [x] Verify with `npx jest src/services/__tests__/auth.test.ts src/screens/__tests__/SettingsScreen.test.tsx src/screens/__tests__/SendScreen.test.tsx --runInBand`.

### Task 3: Harbinger `tKOIN`

**Files:**
- Modify: `src/stores/tokenStore.ts`
- Modify: `src/stores/__tests__/tokenStore.test.ts`
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/screens/__tests__/HomeScreen.test.tsx`
- Modify: `src/lib/transactionDecoder.ts`
- Modify: `src/lib/__tests__/transactionDecoder.test.ts`

**Interfaces:**
- Consumes: active network config from `getActiveNetworkConfig()`
- Produces: Harbinger native token metadata `{ symbol: 'tKOIN', name: 'Koinos Testnet' }`

- [x] Write failing token-store test for Harbinger `tKOIN` metadata.
- [x] Update Harbinger token metadata.
- [x] Write failing Home test proving Harbinger headline uses active network contract, not `KOIN` symbol.
- [x] Update `HomeScreen` native-token lookup and display symbol.
- [x] Write failing transaction-decoder test for Harbinger `tKOIN`.
- [x] Update decoder metadata for the Harbinger contract.
- [x] Verify with `npx jest src/stores/__tests__/tokenStore.test.ts src/screens/__tests__/HomeScreen.test.tsx src/lib/__tests__/transactionDecoder.test.ts --runInBand`.

### Task 4: Final Verification

**Files:**
- All files above.

**Interfaces:**
- None.

- [x] Run `npx tsc --noEmit`.
- [x] Run `npx jest --runInBand`.
- [x] Run `npx -y react-doctor@latest . --verbose --scope changed`.
- [x] Run `git diff --check`.
- [x] Stage and commit only wallet-security UX files.
