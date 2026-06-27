import React from 'react';
import { Alert, Switch, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockGoBack = jest.fn();
const mockGetMnemonic = jest.fn(async () => 'seed words here');
const mockGetPrivateKey = jest.fn(async () => 'private-key-here');
const mockCopyWithAutoClear = jest.fn(async (_value: string) => undefined);
const mockGetTransactionAuthorizationMode = jest.fn(async () => 'always');
const mockSetTransactionAuthorizationMode = jest.fn(async (_mode: string) => undefined);
const mockIsSendConfirmationRequired = jest.fn(async () => true);
const mockSetSendConfirmationRequired = jest.fn(async (_required: boolean) => undefined);
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

jest.mock('../../services/transactionAuthorization', () => ({
  getTransactionAuthorizationMode: () => mockGetTransactionAuthorizationMode(),
  setTransactionAuthorizationMode: (mode: string) => mockSetTransactionAuthorizationMode(mode),
  getTransactionAuthorizationOptions: () => [
    {
      mode: 'always',
      label: 'Every transaction',
      detail: 'Authenticate before each manual send or native swap.',
    },
    {
      mode: 'five-minutes',
      label: 'Remember for 5 minutes',
      detail: 'Skip repeated manual send or native swap prompts for five minutes.',
    },
  ],
}));

jest.mock('../../services/auth', () => ({
  isSendConfirmationRequired: () => mockIsSendConfirmationRequired(),
  setSendConfirmationRequired: (required: boolean) => mockSetSendConfirmationRequired(required),
}));

function collectRenderedText(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAll((node) => String((node as TestRenderer.ReactTestInstance).type) === 'Text')
    .map((node) => {
      const children = Array.isArray(node.props.children)
        ? node.props.children
        : [node.props.children];
      return children
        .filter((child): child is string | number => typeof child === 'string' || typeof child === 'number')
        .join('');
    })
    .filter(Boolean);
}

function findButtonByText(
  renderer: TestRenderer.ReactTestRenderer,
  label: string
): TestRenderer.ReactTestInstance {
  const button = renderer.root.findAll(
    (node) =>
      typeof node.props.onPress === 'function' &&
      node.findAllByType(Text).some((textNode) => textNode.props.children === label)
  );

  if (button.length === 0) {
    throw new Error(`Button not found: ${label}`);
  }

  return button[0];
}

function getAlertButton(label: string) {
  const buttons = alertSpy.mock.calls.at(-1)?.[2];
  const button = buttons?.find((candidate) => candidate.text === label);

  if (!button?.onPress) {
    throw new Error(`Alert button not found: ${label}`);
  }

  return button.onPress;
}

function findSwitch(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance {
  const switches = renderer.root.findAllByType(Switch);

  if (switches.length !== 1) {
    throw new Error(`Expected one Switch, found ${switches.length}`);
  }

  return switches[0];
}

describe('SecurityPrivacyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMnemonic.mockResolvedValue('seed words here');
    mockGetPrivateKey.mockResolvedValue('private-key-here');
    mockGetTransactionAuthorizationMode.mockResolvedValue('always');
    mockIsSendConfirmationRequired.mockResolvedValue(true);
    mockSetSendConfirmationRequired.mockResolvedValue(undefined);
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

  it('lets users choose a manual transaction authorization memory window', async () => {
    const { SecurityPrivacyScreen } = require('../SecurityPrivacyScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<SecurityPrivacyScreen />);
    });

    expect(mockGetTransactionAuthorizationMode).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findAllByType(Text).some((node) => node.props.children === 'Transaction Authorization')).toBe(true);

    await act(async () => {
      findButtonByText(renderer!, 'Remember for 5 minutes').props.onPress();
      await Promise.resolve();
    });

    expect(mockSetTransactionAuthorizationMode).toHaveBeenCalledWith('five-minutes');
  });

  it('shows a clear biometric approval control for manual sends', async () => {
    const { SecurityPrivacyScreen } = require('../SecurityPrivacyScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<SecurityPrivacyScreen />);
    });

    const text = collectRenderedText(renderer!);

    expect(text).toContain('Require biometrics for sends');
    expect(text).toContain('Manual sends ask for device authentication before broadcasting.');
    expect(findSwitch(renderer!).props.value).toBe(true);
    expect(findSwitch(renderer!).props.accessibilityLabel).toBe('Require biometrics for sends');
    expect(renderer!.root.findByProps({ testID: 'app-header' })).toBeTruthy();
    expect(renderer!.root.findByProps({ testID: 'settings-row-Require biometrics for sends' })).toBeTruthy();
    expect(renderer!.root.findByProps({ testID: 'settings-row-trailing-control' })).toBeTruthy();
  });

  it('warns before turning off manual send biometrics', async () => {
    const { SecurityPrivacyScreen } = require('../SecurityPrivacyScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<SecurityPrivacyScreen />);
    });

    await act(async () => {
      findSwitch(renderer!).props.onValueChange(false);
    });

    const warning = alertSpy.mock.calls.at(-1);
    expect(warning?.[0]).toBe('Turn Off Send Biometrics?');
    expect(warning?.[1]).toContain('Anyone with access to your unlocked wallet can send tokens without biometric confirmation.');

    const turnOff = warning?.[2]?.find((button) => button.text === 'Turn Off');
    expect(turnOff?.onPress).toEqual(expect.any(Function));

    await act(async () => {
      await turnOff?.onPress?.();
    });

    expect(mockSetSendConfirmationRequired).toHaveBeenCalledWith(false);
    expect(findSwitch(renderer!).props.value).toBe(false);
    expect(collectRenderedText(renderer!)).toContain('Manual sends will skip device authentication.');
    expect(renderer!.root.findByProps({ testID: 'warning-inline' })).toBeTruthy();
  });

  it('turns manual send biometrics back on without an extra warning', async () => {
    mockIsSendConfirmationRequired.mockResolvedValue(false);
    const { SecurityPrivacyScreen } = require('../SecurityPrivacyScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<SecurityPrivacyScreen />);
    });

    expect(findSwitch(renderer!).props.value).toBe(false);
    expect(collectRenderedText(renderer!)).toContain('Manual sends will skip device authentication.');

    await act(async () => {
      await findSwitch(renderer!).props.onValueChange(true);
    });

    expect(mockSetSendConfirmationRequired).toHaveBeenCalledWith(true);
    expect(findSwitch(renderer!).props.value).toBe(true);
  });
});
