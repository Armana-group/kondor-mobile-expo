# Kondor Mobile Expo

A non-custodial cryptocurrency wallet for the Koinos blockchain, built with React Native and Expo.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run on iOS
npm start        # Terminal 1 - Metro bundler
npm run ios      # Terminal 2 - Build and run

# Run on Android
npm run android
```

For detailed setup instructions, see [Getting Started Guide](docs/getting-started/quick-start.md).

## 📖 Documentation

All documentation is in the [`/docs`](docs/) directory:

- **[Getting Started](docs/getting-started/)** - Setup and running the app
- **[Development](docs/development/)** - Current progress and TODO
- **[Architecture](docs/architecture/)** - Code structure and design patterns

**Quick Links:**
- [Quick Start Guide](docs/getting-started/quick-start.md)
- [Running the App](docs/getting-started/running-the-app.md)
- [Current Progress](docs/development/progress.md)
- [TODO / Next Steps](docs/development/todo.md)
- [Architecture Overview](docs/architecture/architecture-overview.md)

## ✨ Features

- ✅ Create and import HD wallets (BIP39/BIP44)
- ✅ Secure key storage with biometric authentication
- ✅ View KOIN balance
- ✅ Send KOIN transfers
- 🚧 Mana checking (in progress)
- 📝 Transaction history (planned)

## 🏗️ Tech Stack

- **React Native** 0.81.5 (Bare workflow)
- **Expo SDK** 54
- **TypeScript** with strict mode
- **Zustand** - State management
- **koilib** - Koinos blockchain library
- **react-native-quick-crypto** - Native crypto operations

## 📱 Current Status

**Working:**
- Wallet creation and import ✅
- Balance checking ✅
- Transaction signing and submission ✅

**In Progress:**
- Mana checker (HIGH PRIORITY) 🚧
- Account has depleted mana - transfers blocked until implementation

See [Progress](docs/development/progress.md) for details.

## 🔧 Development

### Project Structure

```
src/
├── components/     # Reusable UI components
├── lib/           # Core utilities
├── navigation/    # Navigation setup
├── screens/       # Screen components
└── stores/        # State management
```

### Running Tests

```bash
npm test  # (Not configured yet)
```

### Building

```bash
# iOS
npm run ios

# Android
npm run android

# Clear cache
npm start -- --reset-cache
```

## 🔐 Security

- Private keys stored in Expo SecureStore (encrypted)
- Biometric authentication required for sensitive operations
- HD wallet derivation using BIP44 path m/44'/659'/0'/0/0
- No private keys ever transmitted over network

## 🤝 Contributing

1. Check [TODO](docs/development/todo.md) for current tasks
2. Read [Architecture](docs/architecture/architecture-overview.md) to understand the codebase
3. Update [Progress](docs/development/progress.md) when completing work

## 📄 License

See LICENSE file for details.

## 🔗 Related Projects

- [kondor-mobile](../kondor-mobile) - Reference implementation (bare React Native)
- [kondor](../kondor) - Chrome extension version

## 📞 Support

For issues and questions, check the [documentation](docs/) first, especially:
- [Running the App](docs/getting-started/running-the-app.md) for troubleshooting
- [Progress](docs/development/progress.md) for recent changes
