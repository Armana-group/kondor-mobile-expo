# How to Run the App (Bare React Native)

## Prerequisites
- Xcode installed (for iOS)
- iOS Simulator running or iPhone connected
- Android Studio installed (for Android)

## Running on iOS

### Terminal 1 - Start Metro Bundler:
```bash
npm start
```

Wait for it to show:
```
Metro waiting on exp://192.168.x.x:8081
```

### Terminal 2 - Build and Run iOS:
```bash
npm run ios
```

Or to specify a specific simulator:
```bash
npm run ios -- --simulator="iPhone 15 Pro"
```

This will:
1. Build the native iOS app (3-5 min first time)
2. Install it on the simulator
3. Launch the app
4. Show logs in the terminal

### To See Console Logs:
In the terminal running `npm start`, you'll see:
- `console.log()` outputs
- `console.error()` outputs
- All your `[KoinosStore]`, `[Crypto]` logs

Or open React Native Debugger:
- Press `Cmd + D` in simulator
- Select "Debug"

## Running on Android

### Terminal 1 - Start Metro:
```bash
npm start
```

### Terminal 2 - Build and Run Android:
```bash
npm run android
```

## Testing Transfers

1. Start the app
2. Look for these logs in Terminal 1 (Metro):
   ```
   [Crypto] react-native-quick-crypto installed successfully
   [Crypto] crypto.subtle available: true
   ```
3. Go to Send screen
4. Try sending KOIN
5. Watch the logs:
   ```
   [KoinosStore] Starting transfer to: ...
   [ManualTokenContract] Starting transfer to: ...
   [ManualTokenContract] Transaction prepared, ID: ...
   [ManualTokenContract] Sending transaction...
   [ManualTokenContract] Transaction confirmed!
   ```

## Rebuilding After Code Changes

For JS changes:
- Just save the file - hot reload works automatically

For native changes (rare):
```bash
npm run ios  # Rebuild
```

## Troubleshooting

### If you see "No bundle URL present"
```bash
# Clear cache and restart
npm start -- --reset-cache
```

### If build fails
```bash
# Clean and rebuild
cd ios
pod install
cd ..
npm run ios
```

### See detailed Xcode logs
```bash
# Open in Xcode to see full build logs
open ios/KondorMobile.xcworkspace
# Then press Cmd+R to build and run
```

## Current Status

✅ Native folders generated (`ios/` and `android/`)
✅ `react-native-quick-crypto` compiled natively
✅ Transfer code ready
✅ Ready to test!

## Quick Commands Reference

```bash
# Start Metro bundler
npm start

# Run iOS (in another terminal)
npm run ios

# Run Android (in another terminal)
npm run android

# Clear Metro cache
npm start -- --reset-cache

# List available iOS simulators
xcrun simctl list devices

# Run on specific simulator
npm run ios -- --simulator="iPhone 15 Pro"
```
