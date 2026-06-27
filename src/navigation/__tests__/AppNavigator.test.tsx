import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { AppNavigator } from '../AppNavigator';

const mockLoadWallet = jest.fn(async () => true);
const mockIsPinEnabled = jest.fn(async () => true);
const mockClearTransactionAuthorization = jest.fn();

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: ({
      component: Component,
      children,
    }: {
      component?: React.ComponentType<any>;
      children?: () => React.ReactNode;
    }) => {
      if (children) {
        return children();
      }

      return Component ? <Component /> : null;
    },
  }),
}));

jest.mock('../../screens/WelcomeScreen', () => ({
  WelcomeScreen: () => {
    const { Text: MockText } = require('react-native');
    return <MockText>Welcome</MockText>;
  },
}));

jest.mock('../../screens/CreateWalletScreen', () => ({
  CreateWalletScreen: () => {
    const { Text: MockText } = require('react-native');
    return <MockText>Create Wallet</MockText>;
  },
}));

jest.mock('../../screens/ImportWalletScreen', () => ({
  ImportWalletScreen: () => {
    const { Text: MockText } = require('react-native');
    return <MockText>Import Wallet</MockText>;
  },
}));

jest.mock('../../screens/SetupPinScreen', () => ({
  SetupPinScreen: () => {
    const { Text: MockText } = require('react-native');
    return <MockText>Setup PIN</MockText>;
  },
}));

jest.mock('../../screens/LockScreen', () => ({
  LockScreen: ({ onUnlock }: { onUnlock: () => void }) => {
    const {
      Text: MockText,
      TouchableOpacity: MockTouchableOpacity,
    } = require('react-native');
    return (
      <MockTouchableOpacity onPress={onUnlock}>
        <MockText>Lock Screen</MockText>
      </MockTouchableOpacity>
    );
  },
}));

jest.mock('../TabNavigator', () => ({
  TabNavigator: ({ onLockWallet }: { onLockWallet?: () => void }) => {
    const {
      Text: MockText,
      TouchableOpacity: MockTouchableOpacity,
    } = require('react-native');
    return (
      <MockTouchableOpacity onPress={() => onLockWallet?.()}>
        <MockText>{onLockWallet ? 'Main App Ready' : 'Main App Missing Lock'}</MockText>
      </MockTouchableOpacity>
    );
  },
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => ({
    isWalletCreated: true,
    loadWallet: mockLoadWallet,
  }),
}));

jest.mock('../../services/auth', () => ({
  isPinEnabled: () => mockIsPinEnabled(),
}));

jest.mock('../../services/transactionAuthorization', () => ({
  clearTransactionAuthorization: () => mockClearTransactionAuthorization(),
}));

jest.mock('../../lib/logger', () => ({
  walletLogger: {
    error: jest.fn(),
  },
}));

describe('AppNavigator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the branded startup splash while wallet state is hydrating', () => {
    mockLoadWallet.mockImplementationOnce(() => new Promise<boolean>(() => {}));

    let renderer: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<AppNavigator />);
    });

    expect(renderer!.root.findByProps({ testID: 'startup-splash' })).toBeTruthy();

    act(() => {
      renderer!.unmount();
    });
  });

  it('re-locks the entire app when the shared lock action is triggered', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<AppNavigator />);
    });

    expect(renderer!.root.findByType(Text).props.children).toBe('Lock Screen');

    await act(async () => {
      renderer!.root.findByType(TouchableOpacity).props.onPress();
    });

    expect(renderer!.root.findByType(Text).props.children).toBe('Main App Ready');

    await act(async () => {
      renderer!.root.findByType(TouchableOpacity).props.onPress();
    });

    expect(renderer!.root.findByType(Text).props.children).toBe('Lock Screen');
    expect(mockClearTransactionAuthorization).toHaveBeenCalledTimes(1);
  });
});
