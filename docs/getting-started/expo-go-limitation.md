# Expo Go Limitation: Native Crypto Required

## The Problem

The `react-native-quick-crypto` package (required for koilib transaction signing) uses **native code** and cannot run in **Expo Go**. This is a common limitation with Expo Go - it only supports packages that are pre-included in the Expo Go app.

## Solutions

### Option 1: Build a Development Build (Recommended)

Create a custom development app with native modules baked in:

```bash
# 1. Install EAS CLI (if you haven't already)
npm install -g eas-cli

# 2. Configure EAS (creates eas.json if it doesn't exist)
eas build:configure

# 3. Build a development version for your device
# For iOS simulator:
eas build --profile development --platform ios

# For Android emulator/device:
eas build --profile development --platform android

# 4. Install the resulting build on your device/simulator
# - For iOS: Download the .app file and drag to simulator
# - For Android: Install the .apk file

# 5. Start the dev server
npm start --dev-client
```

**Pros:**
- Full native module support
- Works with `react-native-quick-crypto`
- Still has hot reload and debugging
- Close to production environment

**Cons:**
- Initial build takes 10-20 minutes
- Need to rebuild if you add new native modules

### Option 2: Use Expo Prebuild (Bare Workflow)

Convert to a bare React Native project:

```bash
# Generate native iOS and Android folders
npx expo prebuild

# Run on iOS
npm run ios

# Run on Android
npm run android
```

**Pros:**
- Full control over native code
- Can modify native configurations
- Faster local builds

**Cons:**
- Larger project size (iOS/Android folders)
- Need to manage native dependencies
- Can't use Expo Go anymore

### Option 3: Implement Pure JS Crypto (Complex)

Replace `react-native-quick-crypto` with pure JavaScript crypto libraries. This would require:
- Using `@noble/secp256k1` or similar for signing
- Manually implementing koilib's signing logic
- Significant code changes

**Not recommended** - Option 1 or 2 is much simpler.

## Recommended Next Steps

1. **For testing/development**: Use Option 1 (Development Build)
2. **For production**: You'll need to build anyway, so Option 1 or 2 both work

## Current Status

The app code is ready and will work once you use a development build or bare workflow. The crypto polyfills are configured correctly - it just needs a native environment to run in.
