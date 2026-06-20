import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockGoBack = jest.fn();
const mockGetMnemonic = jest.fn(async () => 'seed words here');
const mockGetPrivateKey = jest.fn(async () => 'private-key-here');
const mockCopyWithAutoClear = jest.fn(async (_value: string) => undefined);
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
  }),
}));

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: (
    selector?: (state: {
      getMnemonic: typeof mockGetMnemonic;
      getPrivateKey: typeof mockGetPrivateKey;
    }) => unknown
  ) => {
    const state = {
      getMnemonic: mockGetMnemonic,
      getPrivateKey: mockGetPrivateKey,
    };

    return selector ? selector(state) : state;
  },
}));

jest.mock('../../lib/clipboard', () => ({
  copyWithAutoClear: (value: string) => mockCopyWithAutoClear(value),
}));

jest.mock('../../lib/haptics', () => ({
  HapticFeedback: {
    success: jest.fn(async () => undefined),
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

function getAlertButton(label: string) {
  const buttons = alertSpy.mock.calls.at(-1)?.[2];
  const button = buttons?.find((candidate) => candidate.text === label);

  if (!button?.onPress) {
    throw new Error(`Alert button not found: ${label}`);
  }

  return button.onPress;
}

describe('SecurityPrivacyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMnemonic.mockResolvedValue('seed words here');
    mockGetPrivateKey.mockResolvedValue('private-key-here');
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  it('re-authenticates before copying a revealed recovery phrase', async () => {
    const { SecurityPrivacyScreen } = require('../SecurityPrivacyScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<SecurityPrivacyScreen />);
    });

    await act(async () => {
      findButtonByText(renderer!, 'View Recovery Phrase').props.onPress();
    });

    await act(async () => {
      await getAlertButton('Continue')();
    });

    expect(mockGetMnemonic).toHaveBeenCalledTimes(1);

    await act(async () => {
      await getAlertButton('Copy')();
    });

    expect(mockGetMnemonic).toHaveBeenCalledTimes(2);
    expect(mockCopyWithAutoClear).toHaveBeenCalledWith('seed words here');
  });

  it('re-authenticates before copying a revealed private key', async () => {
    const { SecurityPrivacyScreen } = require('../SecurityPrivacyScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<SecurityPrivacyScreen />);
    });

    await act(async () => {
      findButtonByText(renderer!, 'View Private Key').props.onPress();
    });

    await act(async () => {
      await getAlertButton('Continue')();
    });

    expect(mockGetPrivateKey).toHaveBeenCalledTimes(1);

    await act(async () => {
      await getAlertButton('Copy')();
    });

    expect(mockGetPrivateKey).toHaveBeenCalledTimes(2);
    expect(mockCopyWithAutoClear).toHaveBeenCalledWith('private-key-here');
  });
});
