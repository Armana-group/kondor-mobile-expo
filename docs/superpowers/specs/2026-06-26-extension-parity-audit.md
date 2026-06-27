# Kondor3 Extension Parity Audit

**Date:** 2026-06-26
**Mobile repo:** `/Users/ron/devstuff/projects/koinos/apps/kondor-mobile-expo`
**Extension reference:** `/Users/ron/devstuff/projects/armana/apps/kondor3`

## Scope

This audit treats Kondor3 as the feature reference, not as a platform blueprint.
Mobile parity should keep native mobile flows, Expo storage/authentication, WebView
provider injection, and WalletConnect where those are the right equivalents.

Chrome-only mechanics are not parity gaps by themselves:

- Browser action popup and side panel.
- Content-script injection into arbitrary browser tabs.
- Chrome extension storage/session APIs.
- Popup positioning and toolbar behavior.

## Already Close Or Better Than Extension

### Network Switching

Mobile now has app-wide Mainnet/Harbinger switching, health checks before switching,
updated Harbinger endpoints/chain ID, and `tKOIN` display on testnet.

Parity status: close.

Remaining gap: extension has custom RPC override settings; mobile currently supports
only the built-in network configs.

### Connected Sites

Extension and mobile both model remembered grants as `getAccounts` only. Signing,
message signing, hash signing, and transaction broadcasting remain prompt-driven.
Mobile has a Connected Sites settings screen with per-origin disconnect and
disconnect-all flows.

Parity status: good.

### DApp Signing And Approvals

Mobile supports:

- `getAccounts` approval with remembered grants.
- `signer:signMessage`.
- `signer:signHash` with explicit raw-hash acknowledgement.
- `signer:signTransaction` and `signer:sendTransaction` approval.
- Origin security notices.
- Signer mismatch and chain mismatch checks.
- Operation decoding and KoinDX dApp swap blocking.
- Biometric/device authentication for signing.

Parity status: good for the core approval model.

Remaining gap: extension has a transaction-auth memory window; mobile currently has
only a secure-default manual-send confirmation toggle.

### Token Management

Mobile has custom tokens, hidden system tokens, duplicate prevention, remove custom
token, visible/hidden counts, and network-scoped token state.

Parity status: good.

### Swap

Mobile has a real native swap flow: token picker, quote debounce, slippage presets,
quote expiry, mainnet-only gating, signing, broadcast status, balance refresh, and
pending history.

Parity status: close.

Remaining gap: extension swap signs through its transaction-auth PIN session; mobile
uses the wallet secret/auth path directly. This is acceptable until mobile gets an
auth-session setting.

### Apps And WalletConnect

Mobile has a native Applications tab with:

- Curated dApps.
- Search.
- Custom URL launch.
- In-app WebView provider injection.
- WalletConnect QR scanner and active session display.

Parity status: close, and mobile has WalletConnect surface area the extension does
not need in the same form.

Remaining gaps: extension persists custom apps; mobile custom URLs are one-off.
Extension also includes Fogata in the curated app list while mobile currently lists
KoinDX, Kollection, and KoinScan.

### Activity

Mobile has transaction filters, pending transaction merge, explorer linking, and
send/receive/swap detail alerts.

Parity status: usable.

Remaining gap: extension has richer transaction details with copyable identifiers
and advanced raw transaction data.

## Real Parity Gaps

### P1: Explicit Network Provider Calls

Extension provider calls carry a requested `network` through to the background
provider. Mobile exposes `getProvider(network)` but currently returns a provider
wrapper that ignores the argument and routes calls to the active mobile network.

Impact:

- A dApp that explicitly requests Harbinger while mobile is on Mainnet will receive
  Mainnet provider data.
- This matters more now that network switching is real and the testnet endpoint was
  updated.

Recommended behavior:

- `window.kondor.provider` continues to use the active network.
- `window.kondor.getProvider('mainnet')` and `getProvider('harbinger')` route read
  calls to that network's RPC nodes.
- Unknown network values fail closed with a clear error.
- Signing and broadcasting still require active-network chain checks and user approval.

### P1: Send Flow Parity

Extension send has user-facing features mobile does not yet expose:

- Memo field.
- Recipient resolution for `@nickname` and `kap://name` on mainnet.
- Saved-recipient chips inline with the recipient field.
- Advanced options for free mana, max mana, and custom payer.
- Transaction authorization remembered state.

Mobile already has token picker, QR scan, contacts, max amount, mana precheck, and
the new confirmation preference.

Recommended split:

1. Add memo and recipient resolution first.
2. Add inline saved-recipient chips if the current contacts picker feels too hidden.
3. Defer custom payer/free-mana controls until the product policy is clear.

### P1: Transaction Authorization Session Setting

Extension supports:

- Every transaction.
- Remember 1 minute.
- Remember 5 minutes.
- Remember 15 minutes.
- Until wallet locks.

Mobile currently supports:

- Require confirmation before manual sends: on by default.
- Manual sends may skip authentication if the user disables the warning-protected
  setting.
- dApp and WalletConnect approvals stay strict.

Recommended mobile equivalent:

- Keep default as "Every transaction".
- Add an optional remembered biometric/device-auth session for manual sends and
  native swaps.
- Do not persist the secret or signer.
- Store only an in-memory authorization timestamp scoped to active account.
- Clear it on app background, wallet lock, account switch, and network switch.
- Do not apply it to dApp or WalletConnect approvals in the first pass.

### P2: Custom RPC Overrides

Extension exposes custom RPC settings. Mobile has fixed configs plus health checks.

Recommended mobile behavior:

- Put this behind an Advanced section in Network settings.
- Require HTTPS RPC URLs.
- Run health checks before saving or switching to an override.
- Provide "Reset to default" per network.

### P2: Persistent Custom Apps

Extension persists custom dApps. Mobile only opens custom URLs for the current
navigation.

Recommended mobile behavior:

- Add a small persisted custom dApp store.
- Let users add name, URL, optional category, and optional icon URL.
- Reuse the existing URL validator.
- Add remove/edit from a simple app details sheet.

### P2: Activity Details Polish

Extension transaction details are more inspectable.

Recommended mobile behavior:

- Replace the current alert details with a bottom sheet/modal.
- Add copy buttons for transaction ID, token, from, to, payer.
- Add advanced JSON/raw data behind a collapsed section.

### P3: Provider Command Catalog Edge

Extension lists `provider:invokeSystemCall`, but its background handler throws
"not implemented". Mobile does not expose it. This is not a practical parity gap
unless a target dApp depends on that exact failure shape.

## Recommended Next Slice

Implement **explicit network provider calls** first.

Why:

- It is directly connected to the new network switching/testnet work.
- It improves dApp compatibility without adding much UI.
- It is safer than immediately widening send/auth controls.
- It creates a clear test target: a WebView dApp can request Harbinger provider data
  while the wallet remains on Mainnet.

Implementation outline:

1. Update the injected provider wrapper so `getProvider(network)` returns methods
   that include `network` in their native command args.
2. Add mobile network argument normalization for `mainnet`, `harbinger`, and
   extension-style network tags.
3. Resolve provider commands against the requested network config when present,
   otherwise use the active network.
4. Keep signing/broadcast approval paths tied to active wallet/network validation.
5. Add Jest coverage for `getChainId`, `getHeadInfo`, invalid network, and no
   accidental auto-approval.

Second slice should be **send memo + recipient resolution**, because it is visible
extension parity with contained risk.
