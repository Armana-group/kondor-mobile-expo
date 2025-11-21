# Quick Start: Enable Transfers

## The Issue
Transfers don't work in Expo Go because `react-native-quick-crypto` (required for transaction signing) needs native code.

## Solution: Build a Development Build

### Step 1: Install EAS CLI (one-time setup)
```bash
npm install -g eas-cli
eas login
```

### Step 2: Build for iOS Simulator
```bash
eas build --profile development --platform ios
```

This will:
- Build a custom development app with native modules
- Takes ~10-20 minutes
- Gives you a download link when done

### Step 3: Install the Build
```bash
# Download the .app file from the link
# Then drag it to your iOS simulator
```

Or use this command:
```bash
# After downloading the .tar.gz file
tar -xzf [downloaded-file].tar.gz
xcrun simctl install booted [app-name].app
```

### Step 4: Start Dev Server
```bash
npm start --dev-client
```

Then press `i` to open in iOS simulator.

## For Android
```bash
eas build --profile development --platform android
# Install the resulting .apk on your device/emulator
npm start --dev-client
```

## What Changes?
- **Balance viewing**: Works in both Expo Go and development build ✅
- **Transfers**: Only works in development build ✅

## Current Status
All code is ready! Just needs a development build environment to run transfers.
