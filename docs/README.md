# Kondor Mobile Expo - Documentation

Welcome to the Kondor Mobile Expo documentation. This is a React Native wallet application for the Koinos blockchain.

## 📚 Documentation Structure

### Getting Started
New to the project? Start here:
- **[Quick Start](getting-started/quick-start.md)** - Fastest way to get the app running
- **[Running the App](getting-started/running-the-app.md)** - Detailed instructions for iOS/Android
- **[Expo Go Limitation](getting-started/expo-go-limitation.md)** - Why we use bare React Native

### Development
Working on the app:
- **[Progress](development/progress.md)** - Current status and recent work
- **[TODO](development/todo.md)** - Next tasks and implementation plans
- **[Architecture Overview](architecture/architecture-overview.md)** - System design and patterns

### Architecture
Understanding the codebase:
- **[Comparison with kondor-mobile](architecture/comparison-with-kondor-mobile.md)** - How this differs from reference implementation
- **[Architecture Overview](architecture/architecture-overview.md)** - Code structure and patterns

## 🚀 Quick Links

### First Time Setup
1. Read [Quick Start](getting-started/quick-start.md)
2. Run: `npm install`
3. Run: `npm start` then `npm run ios`

### Current Status
- ✅ Balance checking works
- ✅ Transfers work (code-wise)
- 🚧 Blocked by mana depletion
- 📝 Next: Implement mana checker

See [Progress](development/progress.md) for details.

### Common Tasks

**Run the app:**
```bash
npm start                # Terminal 1 - Metro
npm run ios              # Terminal 2 - iOS
npm run android          # Terminal 2 - Android
```

**Clean build:**
```bash
npm start -- --reset-cache
```

**View logs:**
All logs appear in Terminal 1 (Metro bundler)

## 🎯 Current Priority

**Implement Mana Checker** - See [TODO](development/todo.md)

Transfers are working but blocked by insufficient mana. Need to:
1. Add `getMana()` to koinosStore
2. Display mana in HomeScreen
3. Check mana before allowing transfers
4. Show time estimate for mana regeneration

## 📖 Project Overview

Kondor Mobile is a non-custodial cryptocurrency wallet for Koinos:
- **Platform:** React Native with Expo (bare workflow)
- **State:** Zustand with persistence
- **Crypto:** koilib + react-native-quick-crypto
- **Storage:** Expo SecureStore for keys, AsyncStorage for public data

## 🔗 Reference Projects

- `../kondor-mobile` - Original mobile wallet (reference implementation)
- `../kondor` - Chrome extension (working Koinos integration)

## 📁 Directory Structure

```
docs/
├── README.md (this file)
├── getting-started/
│   ├── quick-start.md
│   ├── running-the-app.md
│   └── expo-go-limitation.md
├── development/
│   ├── progress.md
│   └── todo.md
└── architecture/
    ├── architecture-overview.md
    └── comparison-with-kondor-mobile.md
```

## 🤝 Contributing

When adding new features:
1. Update [Progress](development/progress.md) when completing work
2. Update [TODO](development/todo.md) with new tasks
3. Document architectural changes in [Architecture](architecture/architecture-overview.md)

## ❓ Need Help?

- Check [Running the App](getting-started/running-the-app.md) for troubleshooting
- Review [Progress](development/progress.md) for recent changes
- See [Architecture](architecture/architecture-overview.md) for code structure
