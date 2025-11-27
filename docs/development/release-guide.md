# Kondor Wallet - Release Guide

*Last Updated: November 27, 2025*

---

## Current Release Status

| Platform | Status | Version |
|----------|--------|---------|
| iOS TestFlight | ✅ Live | 1.0.0 (1) |
| Google Play Internal | ⏳ Ready to build | 1.0.0 |

---

## App Configuration

```json
{
  "name": "Kondor Wallet",
  "ios.bundleIdentifier": "io.armana.kondor",
  "android.package": "io.armana.kondor",
  "version": "1.0.0",
  "ios.buildNumber": "1",
  "android.versionCode": 1
}
```

**Developer:** Armana Inc.
**Privacy Policy:** https://armana.io/privacy/kondor
**Support Email:** support@armana.io

---

## iOS Release (TestFlight)

### Build & Upload

```bash
cd /Users/ron/devstuff/projects/koinos/apps/kondor-mobile-expo

# Generate iOS project
rm -rf ios
npx expo prebuild --platform ios

# Open in Xcode
open ios/Kondor.xcworkspace
```

In Xcode:
1. Select "Any iOS Device (arm64)"
2. Product → Archive
3. Distribute App → App Store Connect → Upload

### TestFlight Setup
- App Store Connect: https://appstoreconnect.apple.com
- Add testers under TestFlight tab
- External testers require beta review

---

## Android Release (Google Play)

### Build AAB

**Option 1: Local Build**
```bash
cd /Users/ron/devstuff/projects/koinos/apps/kondor-mobile-expo

# Generate Android project
npx expo prebuild --platform android

# Build release bundle
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

**Option 2: EAS Build**
```bash
npm install -g eas-cli
eas login
eas build --platform android --profile production
```

### Upload to Google Play

1. Go to [Google Play Console](https://play.google.com/console)
2. Select/create "Kondor Wallet" app
3. Testing → Internal testing → Create release
4. Upload AAB
5. Add testers by email

---

## Version Incrementing

Before each new release, update `app.json`:

```json
{
  "expo": {
    "version": "1.0.1",
    "ios": {
      "buildNumber": "2"
    },
    "android": {
      "versionCode": 2
    }
  }
}
```

---

## Pre-Release Checklist

### Functional Testing
- [ ] Wallet creation (fresh install)
- [ ] Wallet import (seed phrase)
- [ ] KOIN transfer on mainnet
- [ ] Multi-token transfers
- [ ] QR code scanning
- [ ] Multi-account support
- [ ] Contact management
- [ ] Biometric authentication
- [ ] Settings/export features

### Platform Testing
- [ ] iOS device (iPhone)
- [ ] Android device
- [ ] Different screen sizes

---

## Public Release Requirements

### App Store (iOS)
- [ ] App screenshots (6.5" and 5.5" iPhone)
- [ ] App description
- [ ] Keywords
- [ ] Support URL
- [ ] Privacy policy URL ✅

### Google Play
- [ ] App screenshots (phone + tablet)
- [ ] Short description (80 chars)
- [ ] Full description (4000 chars)
- [ ] Feature graphic (1024x500)
- [ ] Privacy policy URL ✅
- [ ] Content rating questionnaire

---

## Troubleshooting

### iOS: Bundle ID conflict
The original `com.kondorwallet.mobile` was taken. Using `io.armana.kondor`.

### iOS: App name conflict
"Kondor" was taken. Using "Kondor Wallet".

### Android: Signing issues
For local builds, ensure release keystore is configured in `android/app/build.gradle`.

### Build errors after prebuild
```bash
# Clean and rebuild
rm -rf ios android node_modules
npm install
npx expo prebuild
```

---

## Contacts

- **Developer Account:** Armana Inc.
- **Support:** support@armana.io
- **Privacy Policy:** https://armana.io/privacy/kondor
