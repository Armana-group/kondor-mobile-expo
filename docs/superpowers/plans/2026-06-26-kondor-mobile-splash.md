# Kondor Mobile Splash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain startup spinner with a polished Kondor-branded splash handoff while keeping startup fast.

**Architecture:** Add a focused `StartupSplash` React Native component and render it from the existing `AppNavigator` loading branch. Keep startup state ownership in `AppNavigator`; the new component is presentational and owns no timing or wallet logic.

**Tech Stack:** React Native, Expo SDK 56, Jest, react-test-renderer, existing Kondor assets and theme colors.

## Global Constraints

- Preserve fast startup; do not add artificial delays.
- Keep the native splash static through the existing `expo-splash-screen` plugin.
- Keep the visual direction aligned with `#181818` graphite and Kondor purple `#7061EF`.
- Do not change app routing after wallet state resolves.
- Avoid custom native code and new runtime dependencies.

---

### Task 1: Branded Startup Splash

**Files:**
- Create: `src/components/StartupSplash.tsx`
- Create: `src/components/__tests__/StartupSplash.test.tsx`
- Modify: `src/navigation/AppNavigator.tsx`
- Modify: `src/navigation/__tests__/AppNavigator.test.tsx`
- Modify: `app.json`

**Interfaces:**
- Consumes: existing `colors` object from `src/theme/colors.ts` and `assets/splash-icon.png`.
- Produces: `StartupSplash(): JSX.Element`, a presentational component with `testID="startup-splash"` and visible text `Kondor Wallet`.

- [ ] **Step 1: Write the failing component test**

```tsx
it('renders the Kondor startup identity', () => {
  const renderer = TestRenderer.create(<StartupSplash />);

  expect(renderer.root.findByProps({ testID: 'startup-splash' })).toBeTruthy();
  expect(renderer.root.findByProps({ testID: 'startup-splash-logo' })).toBeTruthy();
  expect(renderer.root.findByProps({ children: 'Kondor Wallet' })).toBeTruthy();
});
```

- [ ] **Step 2: Run component test to verify it fails**

Run: `npx jest src/components/__tests__/StartupSplash.test.tsx --runInBand`
Expected: FAIL because `StartupSplash` does not exist yet.

- [ ] **Step 3: Implement `StartupSplash`**

Create `src/components/StartupSplash.tsx` as a presentational React Native component:

```tsx
import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import colors from '../theme/colors';

const splashLogo = require('../../assets/splash-icon.png');

export function StartupSplash() {
  return (
    <View testID="startup-splash" style={styles.container}>
      <View style={styles.glow}>
        <View style={styles.ring}>
          <Image
            testID="startup-splash-logo"
            source={splashLogo}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      </View>
      <Text style={styles.title}>Kondor Wallet</Text>
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={colors.purple} />
        <Text style={styles.status}>Securing wallet</Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run component test to verify it passes**

Run: `npx jest src/components/__tests__/StartupSplash.test.tsx --runInBand`
Expected: PASS.

- [ ] **Step 5: Write failing navigator test**

Add a test to `src/navigation/__tests__/AppNavigator.test.tsx` that keeps `loadWallet` pending and asserts `testID="startup-splash"` is rendered.

- [ ] **Step 6: Run navigator test to verify it fails**

Run: `npx jest src/navigation/__tests__/AppNavigator.test.tsx --runInBand`
Expected: FAIL because `AppNavigator` still renders only the plain loading view.

- [ ] **Step 7: Replace the loading branch**

Modify `src/navigation/AppNavigator.tsx`:

```tsx
import { StartupSplash } from '../components/StartupSplash';

if (isLoading) {
  return <StartupSplash />;
}
```

Remove the now-unused loading view styles and `ActivityIndicator` import.

- [ ] **Step 8: Run navigator test to verify it passes**

Run: `npx jest src/navigation/__tests__/AppNavigator.test.tsx --runInBand`
Expected: PASS.

- [ ] **Step 9: Polish native splash config**

Change `app.json` splash `imageWidth` from `200` to `240` to make the native mark feel closer to the in-app splash while preserving `contain`.

- [ ] **Step 10: Verify**

Run:

```bash
npx jest src/components/__tests__/StartupSplash.test.tsx src/navigation/__tests__/AppNavigator.test.tsx --runInBand
npx tsc --noEmit
npx jest --runInBand
git diff --check
```

Expected: all commands exit 0.
