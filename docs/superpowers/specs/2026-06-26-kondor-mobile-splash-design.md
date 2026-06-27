# Kondor Mobile Splash Design

## Summary

Create a premium startup experience for Kondor Mobile without slowing the wallet down. The design has two layers:

1. A native Expo splash screen with a polished static Kondor mark.
2. A short in-app branded handoff that replaces the current plain loading spinner while wallet and PIN state hydrate.

The result should feel secure, fast, and high-end rather than decorative or game-like.

## Goals

- Make first launch feel like a finished wallet product.
- Preserve fast startup and avoid unnecessary delays.
- Keep the design aligned with the extension brand: dark graphite, Kondor purple, clean wallet UI.
- Avoid fragile native changes beyond the existing Expo splash-screen plugin.
- Provide test coverage for the in-app loading state.

## Non-Goals

- No long intro animation.
- No sound, video, or heavy asset pipeline.
- No app flow changes after wallet state resolves.
- No custom native code outside Expo config/assets.
- No broad redesign of onboarding, lock, or home screens.

## Visual Direction

Use the existing brand base:

- Background: `#181818` or a very close graphite tone.
- Accent: Kondor purple `#7061EF`.
- Mark: centered Kondor icon, larger and cleaner than the current plain loading spinner.
- Supporting text: `Kondor Wallet`, small and confident.
- Motion: one restrained pulse or ring during in-app hydration only.

The native splash should be static and visually clean. The in-app handoff can add depth through a purple halo, soft ring, and compact loading status.

## Architecture

### Native Splash

Update the Expo splash configuration and asset:

- Keep `expo-splash-screen` in `app.json`.
- Use a new or revised splash asset under `assets/`.
- Preserve dark background color.
- Keep resize mode `contain` so it behaves predictably across devices.

Native splash changes require rebuilding native shells to verify on a real simulator/device. Expo Go may not show the final native behavior.

### In-App Handoff

Replace the loading branch in `AppNavigator` with a small component, for example `StartupSplash`.

Current behavior:

- `AppNavigator` shows a plain `ActivityIndicator` while `loadWallet()` and `isPinEnabled()` run.

New behavior:

- `AppNavigator` shows `StartupSplash` while `isLoading` is true.
- `StartupSplash` renders the Kondor mark, brand name, and a restrained loading indicator.
- The component does not own timing. It disappears as soon as app state is ready.

This keeps startup control in the existing navigator and avoids adding artificial wait time.

## Components

### `StartupSplash`

Responsibilities:

- Render the branded startup handoff.
- Use local static assets only.
- Fit both small and large iPhone screens.
- Avoid text overlap around the dynamic island/notch.

Dependencies:

- `react-native`
- `expo-status-bar` or existing status bar setup if needed
- existing `colors`
- existing `assets/splash-icon.png` or a new splash mark asset

## Error Handling

Do not hide startup errors. If `loadWallet()` fails, the existing navigator should still clear loading and log the error. The splash should not catch or suppress wallet load failures.

## Testing

Add focused tests for:

- `AppNavigator` renders the branded startup splash while wallet state is loading.
- Existing lock/main routing still works after loading completes.

Manual verification:

- Run the app in the iOS simulator.
- Confirm native launch screen appears before React renders.
- Confirm in-app handoff appears briefly during wallet/PIN hydration.
- Confirm no added delay after state resolves.
- Confirm create/import, lock, and main app startup still route correctly.

## Acceptance Criteria

- Startup no longer shows a plain spinner-only screen.
- The native splash and React loading state feel visually related.
- App startup does not intentionally wait for an animation.
- Text and logo fit on iPhone simulator sizes.
- TypeScript and Jest pass.
- If native assets/config change, native rebuild verification is documented.
