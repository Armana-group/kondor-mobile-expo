# Send And Parity Followups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the resumed Kondor3 mobile parity queue after explicit provider-network routing.

**Architecture:** Keep Kondor3 as the behavior reference while preserving the Expo mobile architecture. Put domain behavior in focused services/stores, keep signing through existing authenticated mobile paths, and keep dApp and WalletConnect approvals strict unless a task explicitly scopes manual native flows.

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19, TypeScript 6, Zustand, AsyncStorage, koilib, protobufjs/minimal, Jest, react-test-renderer.

## Global Constraints

- Default branch remains `master`; never create or use `main`.
- Do not push, deploy, publish, broadcast test transactions, or mutate production data.
- Preserve Expo/WebView/WalletConnect-native architecture; do not port Chrome extension background mechanics.
- Signing paths must remain biometric/device-auth gated unless the manual-send confirmation preference or new manual-only auth-memory path explicitly allows a skip.
- Do not apply transaction authorization memory to dApp or WalletConnect approvals in this pass.
- Recipient name resolution must fail closed when the active network has no supporting contract.
- Automated tests must not call live RPC endpoints.

---

### Task 1: Send Memo And Recipient Resolution

**Files:**
- Create: `src/lib/recipient.ts`
- Create: `src/lib/__tests__/recipient.test.ts`
- Modify: `src/lib/constants.ts`
- Modify: `src/stores/networkStore.ts`
- Modify: `src/lib/manualTokenContract.ts`
- Modify: `src/lib/__tests__/manualTokenContract.test.ts`
- Modify: `src/stores/koinosStore.ts`
- Modify: `src/screens/SendScreen.tsx`
- Modify: `src/screens/__tests__/SendScreen.test.tsx`

**Interfaces:**
- Produces `resolveRecipient(value: string, networkMode: NetworkMode): Promise<RecipientResolution | null>`.
- Extends `transferToken(contractId, to, amount, decimals, { memo, onBroadcastAccepted })`.
- Sends trimmed memo as token transfer field 4; empty memo is omitted from pending metadata.

- [ ] Write failing recipient service tests for raw address, `@nickname`, `kap://name`, and unsupported-network failure.
- [ ] Implement `recipient.ts` and optional network config contract IDs.
- [ ] Write failing manual token contract test proving memo is encoded as transfer field 4.
- [ ] Extend manual token transfer options and encoder to include memo.
- [ ] Write failing SendScreen test proving `@nickname` resolves before transfer and memo is passed to transfer/pending metadata.
- [ ] Add recipient status copy, memo input, and resolved-address send path to SendScreen.
- [ ] Run targeted tests: `npx jest src/lib/__tests__/recipient.test.ts src/lib/__tests__/manualTokenContract.test.ts src/screens/__tests__/SendScreen.test.tsx --runInBand`.

### Task 2: Inline Saved Recipient Chips

**Files:**
- Modify: `src/screens/SendScreen.tsx`
- Modify: `src/screens/__tests__/SendScreen.test.tsx`

**Interfaces:**
- Uses `useContactStore().contacts`.
- Selecting a chip fills the recipient field and selected contact.

- [ ] Write failing SendScreen test for visible saved recipient chips and chip selection.
- [ ] Render up to six compact contact chips beneath the recipient input.
- [ ] Run `npx jest src/screens/__tests__/SendScreen.test.tsx --runInBand`.

### Task 3: Manual Transaction Authorization Memory

**Files:**
- Create: `src/services/transactionAuthorization.ts`
- Create: `src/services/__tests__/transactionAuthorization.test.ts`
- Modify: `src/screens/SecurityPrivacyScreen.tsx`
- Modify: `src/screens/__tests__/SecurityPrivacyScreen.test.tsx`
- Modify: `src/screens/SendScreen.tsx`
- Modify: `src/hooks/useNativeSwap.ts`
- Modify: related send/swap tests if coverage requires it.

**Interfaces:**
- In-memory authorization timestamp scoped by active account.
- Supported modes: every transaction, 1 minute, 5 minutes, 15 minutes, until lock.
- Clear memory on wallet lock, account switch, and network switch where those events are locally observable.

- [ ] Write failing service tests for remember windows, account scoping, expiry, and clear.
- [ ] Implement the in-memory service without persisting secrets or signers.
- [ ] Add settings UI for manual sends/native swaps only.
- [ ] Wire SendScreen and native swap to use remembered auth only for manual native flows.
- [ ] Run targeted service, security, send, and swap tests.

### Task 4: Persistent Custom Apps

**Files:**
- Create: `src/stores/customDappStore.ts`
- Create: `src/stores/__tests__/customDappStore.test.ts`
- Modify: `src/screens/BrowserScreen.tsx`
- Modify: `src/constants/dapps.ts`
- Modify: related Browser/Application tests if present.

**Interfaces:**
- Custom app has `id`, `name`, `url`, optional `category`, optional `iconUrl`, `createdAt`, `updatedAt`.
- Reuses existing URL validation.

- [ ] Write failing store tests for add, update, remove, duplicate URL guard, and validation.
- [ ] Implement persisted custom dApp store.
- [ ] Add custom app entries to Applications tab with remove/edit affordances.
- [ ] Run targeted custom app tests.

### Task 5: DAppWebViewScreen Cleanup

**Files:**
- Modify: `src/screens/DAppWebViewScreen.tsx`
- Create/modify focused helper files only if the cleanup materially reduces component size.
- Modify: `src/screens/__tests__/DAppWebViewScreen.test.ts`

**Interfaces:**
- Preserve provider routing, dApp permissions, signing, WalletConnect, and navigation behavior.

- [ ] Run React Doctor scope against changed file to capture remaining warnings.
- [ ] Split pure helpers or small render helpers only where tests keep behavior pinned.
- [ ] Replace deprecated touchables with `Pressable` where low risk.
- [ ] Run DAppWebViewScreen tests and React Doctor again.

### Task 6: Final Verification And Review

**Files:**
- Read: git diff and changed test files.

- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npx jest --runInBand`.
- [ ] Run `git diff --check`.
- [ ] Run `npx -y react-doctor@latest . --verbose --scope changed`.
- [ ] Request/fill code review and fix Critical/Important findings.
- [ ] Commit logical changes locally; do not push.
