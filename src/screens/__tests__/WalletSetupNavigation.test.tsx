import React from 'react';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

const mockReset = jest.fn();
const mockGoBack = jest.fn();
const mockCreateWallet = jest.fn(async () => undefined);
const mockImportWallet = jest.fn(async () => undefined);
const mockMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    reset: mockReset,
    goBack: mockGoBack,
  }),
}));

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../lib/wallet', () => ({
  generateMnemonic: jest.fn(() => mockMnemonic),
  validateMnemonic: jest.fn(() => true),
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: (selector?: (state: {
    createWallet: typeof mockCreateWallet;
    importWallet: typeof mockImportWallet;
  }) => unknown) => {
    const state = {
      createWallet: mockCreateWallet,
      importWallet: mockImportWallet,
    };
    return selector ? selector(state) : state;
  },
}));

function findButtonByText(
  renderer: TestRenderer.ReactTestRenderer,
  label: string
): TestRenderer.ReactTestInstance {
  const button = renderer.root.findAllByType(TouchableOpacity).find((node) =>
    node.findAllByType(Text).some((textNode) => textNode.props.children === label)
  );

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

describe('wallet setup success navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirmButton = Array.isArray(buttons)
        ? buttons.find((button) => button.text === 'Yes, I saved it')
        : undefined;
      confirmButton?.onPress?.();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lets the root navigator switch stacks after creating a wallet', async () => {
    const { CreateWalletScreen } = require('../CreateWalletScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<CreateWalletScreen />);
    });

    await act(async () => {
      findButtonByText(renderer!, 'Generate Recovery Phrase').props.onPress();
    });

    await act(async () => {
      findButtonByText(renderer!, "I've Saved My Recovery Phrase").props.onPress();
    });

    expect(mockCreateWallet).toHaveBeenCalledWith(mockMnemonic);
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('lets the root navigator switch stacks after importing a wallet', async () => {
    const { ImportWalletScreen } = require('../ImportWalletScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<ImportWalletScreen />);
    });

    await act(async () => {
      renderer!.root.findByType(TextInput).props.onChangeText(mockMnemonic);
    });

    await act(async () => {
      findButtonByText(renderer!, 'Import Wallet').props.onPress();
    });

    expect(mockImportWallet).toHaveBeenCalledWith(mockMnemonic);
    expect(mockReset).not.toHaveBeenCalled();
  });
});
