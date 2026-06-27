# Wallet Security UX Design

## Summary

Give users more control over repeated wallet safety prompts while keeping secure defaults. This patch covers three mobile UX fixes:

1. Let users dismiss backup notices without permanently hiding new backup risks.
2. Add a setting for manual-send biometric/device confirmation.
3. Label Harbinger testnet KOIN as `tKOIN`.

## Goals

- Keep the default wallet behavior secure.
- Let users dismiss backup warnings that become repetitive.
- Bring security controls into Settings with clear, plain-language warnings.
- Keep dApp and WalletConnect approval paths stricter than local manual sends.
- Fix testnet token naming so Harbinger shows `tKOIN`, not `KOIN`.

## Non-Goals

- Do not remove backup health tracking.
- Do not disable backup warnings globally forever.
- Do not weaken dApp or WalletConnect transaction approvals.
- Do not change PIN setup, lock-screen behavior, or account-management biometric gates.
- Do not redesign the whole Settings screen.

## Backup Notice Dismissal

`BackupStatusNotice` should render a small dismiss control when the notice is actionable. Dismissal should be local to the current warning state:

- A dismissed `none` backup notice stays hidden while the wallet remains in the same no-backup state.
- A dismissed warning should reappear when backup health changes to a different actionable state, such as `stale` or `failed`.
- A verified backup should continue hiding the notice normally.
- Tapping the notice body should still open Backup & Recovery.
- Tapping dismiss should not navigate.

The dismissal key should include enough backup-health identity to avoid hiding a newly relevant warning. Use backup status plus available fingerprint/account-set/failure metadata instead of a single global boolean.

## Manual Send Confirmation Setting

Add a persisted security preference for manual sends:

- Default: confirmation required.
- Setting label: `Require confirmation before sending`.
- When enabled, `SendScreen` should call the existing biometric/device auth helper before broadcasting.
- When disabled, `SendScreen` should skip the biometric/device auth step for manual sends only.
- dApp and WalletConnect transaction approvals should still require their existing approval/auth flow.

When the user turns the setting off, show a confirmation alert:

Title: `Turn off send confirmation?`

Body: `Anyone with this unlocked wallet can send tokens without Face ID, Touch ID, or device passcode confirmation.`

Actions:

- `Keep On`
- `Turn Off`

The Settings row should make the current value visible as `On` or `Off`.

## Send Screen Warning

When manual-send confirmation is disabled, `SendScreen` should show a subtle warning near the send action:

`Send confirmation is off`

The warning should be visually restrained but noticeable, using existing warning colors. It should not block sending.

## Harbinger Token Label

Harbinger’s system token should display as:

- Symbol: `tKOIN`
- Name: `Koinos Testnet`

Home’s headline balance should not find the native token by hard-coded `symbol === 'KOIN'`. It should resolve the active network’s native token by contract id from the active network config.

This avoids breaking Harbinger display when the symbol becomes `tKOIN`.

## Data Flow

- Backup dismissal state can live in a small persisted Zustand store backed by `AsyncStorage`.
- Manual-send confirmation should live in `auth.ts` with the existing security preferences backed by `SecureStore`.
- `SettingsScreen` reads and writes the send-confirmation preference.
- `SendScreen` reads the preference before calling `requireBiometricAuth`.
- `tokenStore` owns Harbinger token metadata.
- `HomeScreen` uses active network config to resolve the headline native token.

## Error Handling

- If reading the send-confirmation setting fails, fail secure and require confirmation.
- If writing the setting fails, leave the current setting unchanged and show a short error alert.
- If biometric/device authentication fails while confirmation is enabled, keep the existing send-blocking behavior.
- Backup notice dismissal should never mark backup health as verified.

## Testing

Add focused coverage for:

- `BackupStatusNotice` exposes dismiss behavior and does not fire the main press when dismissed.
- Dismissed backup notices hide only for the matching backup-health key and reappear for changed backup health.
- `auth.ts` defaults manual-send confirmation to required and persists on/off.
- `SettingsScreen` shows `Require confirmation before sending` with `On` by default and warning confirmation when turning it off.
- `SendScreen` calls biometric/device auth when confirmation is on.
- `SendScreen` skips biometric/device auth and shows warning copy when confirmation is off.
- Harbinger system token metadata uses `tKOIN` / `Koinos Testnet`.
- Home headline balance still renders in Harbinger after native token symbol changes to `tKOIN`.

## Acceptance Criteria

- A user can dismiss the backup notice without losing future meaningful backup warnings.
- Manual sends still require biometric/device confirmation by default.
- Users can disable manual-send confirmation from Settings after seeing a warning.
- Manual sends skip confirmation only when the user has disabled the setting.
- dApp and WalletConnect approvals are not weakened.
- Harbinger displays `tKOIN` for the testnet token.
- TypeScript and Jest pass.
