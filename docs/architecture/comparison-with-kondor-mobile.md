# Comparison: kondor-mobile vs kondor-mobile-expo

## Key Difference: Bare React Native vs Expo

### kondor-mobile (the working one)
- **Type**: Bare React Native project
- **Native folders**: Has `android/` and `ios/` folders
- **Run commands**:
  - `react-native run-ios`
  - `react-native run-android`
- **Native modules**: Work out of the box (including `react-native-quick-crypto`)
- **Setup**: More complex, but full native access

### kondor-mobile-expo (current project)
- **Type**: Expo managed project
- **Native folders**: None (managed by Expo)
- **Run commands**:
  - `expo start` (uses Expo Go)
  - `npm start --dev-client` (uses custom development build)
- **Native modules**:
  - ❌ Don't work in Expo Go
  - ✅ Work in development builds
- **Setup**: Simpler for pure JS, but needs builds for native modules

## How kondor-mobile Handles Crypto

### 1. Project Structure
```
kondor-mobile/
├── android/          ← Native Android project
├── ios/              ← Native iOS project
├── index.js          ← Entry point (imports crypto first)
├── App.tsx
└── src/
    └── lib/
        └── crypto.ts ← Simple polyfills
```

### 2. Crypto Setup (src/lib/crypto.ts)
```javascript
// Very simple - just these 3 polyfills
import 'react-native-get-random-values';
import '@ethersproject/shims';
import 'text-encoding-polyfill';
```

### 3. How react-native-quick-crypto Works
Since kondor-mobile is a **bare React Native project**:
- Native modules are compiled into the app during build
- `react-native-quick-crypto` is linked natively
- Works immediately without any special configuration
- Provides full `crypto.subtle` API

## Your Current Situation

Your crypto setup (`src/lib/crypto.ts`) is **correct** and matches kondor-mobile! The only difference is the project type:

```
kondor-mobile:        Bare RN → Native modules work natively
kondor-mobile-expo:   Expo    → Need development build for native modules
```

## Two Paths Forward

### Path 1: Keep Expo (Recommended)
Build a development build to use native modules:
```bash
eas build --profile development --platform ios
npm start --dev-client
```

**Pros:**
- Keep Expo benefits (easier updates, OTA updates, etc.)
- Still get native module support
- Your existing code works as-is

**Cons:**
- Need to build (~15 min initial build)
- Can't use Expo Go for testing transfers

### Path 2: Convert to Bare React Native (Like kondor-mobile)
```bash
npx expo prebuild
npm run ios
```

**Pros:**
- Works exactly like kondor-mobile
- No build service needed
- Immediate native access

**Cons:**
- Larger project (adds android/ and ios/ folders)
- Lose some Expo conveniences
- Need to manage native dependencies manually

## Bottom Line

**kondor-mobile works because it's bare React Native** - native modules are built in from the start.

**Your app will work the same way** once you build it (either via EAS or expo prebuild). The code is ready - it just needs a native environment instead of Expo Go.
