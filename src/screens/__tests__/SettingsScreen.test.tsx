import React from 'react';
import { Alert, Switch, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
  getParent: jest.fn(() => ({
    navigate: mockNavigate,
  })),
};

const mockIsSendConfirmationRequired = jest.fn(async () => true);
const mockSetSendConfirmationRequired = jest.fn(async (_required: boolean) => undefined);

let mockNetworkState = {
  mode: 'mainnet' as 'mainnet' | 'harbinger',
  hasHydrated: true,
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: (selector?: (state: { clearWallet: () => Promise<void> }) => unknown) => {
    const state = {
      clearWallet: jest.fn(async () => undefined),
    };

    return selector ? selector(state) : state;
  },
}));

jest.mock('../../stores/networkStore', () => ({
  useNetworkStore: (selector?: (state: typeof mockNetworkState) => unknown) =>
    selector ? selector(mockNetworkState) : mockNetworkState,
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

function findSwitch(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance {
  const switches = renderer.root.findAllByType(Switch);

  if (switches.length !== 1) {
    throw new Error(`Expected one Switch, found ${switches.length}`);
  }

  return switches[0];
}

describe('SettingsScreen', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSendConfirmationRequired.mockResolvedValue(true);
    mockSetSendConfirmationRequired.mockResolvedValue(undefined);
    mockNetworkState = {
      mode: 'mainnet',
      hasHydrated: true,
    };
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  it('renders the consolidated settings index required for parity', async () => {
    const { SettingsScreen } = require('../SettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<SettingsScreen />);
    });

    const text = collectRenderedText(renderer!);

    expect(text).toEqual(expect.arrayContaining([
      'Manage Accounts',
      'Manage Tokens',
      'Security & Privacy',
      'Connected Sites',
      'Backup & Recovery',
      'Send confirmation',
      'Network',
      'Contacts',
      'Lock Wallet',
      'Remove Wallet',
      'Mainnet',
    ]));
    expect(text).not.toContain('Less secure: sends will not ask for biometrics.');
    expect(findSwitch(renderer!).props.value).toBe(true);
    expect(findSwitch(renderer!).props.accessibilityLabel).toBe('Send confirmation');
  });

  it('routes new settings shell entries through the dedicated settings flow', async () => {
    const { SettingsScreen } = require('../SettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<SettingsScreen />);
    });

    await act(async () => {
      findButtonByText(renderer!, 'Manage Accounts').props.onPress();
      findButtonByText(renderer!, 'Security & Privacy').props.onPress();
      findButtonByText(renderer!, 'Network').props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('ManageAccounts');
    expect(mockNavigate).toHaveBeenCalledWith('SecurityPrivacy');
    expect(mockNavigate).toHaveBeenCalledWith('NetworkSettings');
  });

  it('shows a loading network label before hydration completes', async () => {
    mockNetworkState = {
      mode: 'mainnet',
      hasHydrated: false,
    };
    const { SettingsScreen } = require('../SettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<SettingsScreen />);
    });

    const text = collectRenderedText(renderer!);

    expect(text).toContain('Loading...');
    expect(text).not.toContain('Mainnet');
  });

  it('shows the hydrated persisted network label', async () => {
    mockNetworkState = {
      mode: 'harbinger',
      hasHydrated: true,
    };
    const { SettingsScreen } = require('../SettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<SettingsScreen />);
    });

    const text = collectRenderedText(renderer!);

    expect(text).toContain('Harbinger');
    expect(text).not.toContain('Loading...');
  });

  it('locks the wallet through the shared app-wide lock action', async () => {
    const onLockWallet = jest.fn();
    const { SettingsScreen } = require('../SettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<SettingsScreen onLockWallet={onLockWallet} />);
    });

    await act(async () => {
      findButtonByText(renderer!, 'Lock Wallet').props.onPress();
    });

    expect(onLockWallet).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalledWith('LockWallet');
  });

  it('warns before turning off manual send confirmation', async () => {
    const { SettingsScreen } = require('../SettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<SettingsScreen />);
    });

    await act(async () => {
      findSwitch(renderer!).props.onValueChange(false);
    });

    const warning = alertSpy.mock.calls.at(-1);
    expect(warning?.[0]).toBe('Turn Off Send Confirmation?');
    expect(warning?.[1]).toContain('Anyone with access to your unlocked wallet can send tokens without biometric confirmation.');

    const turnOff = warning?.[2]?.find((button) => button.text === 'Turn Off');
    expect(turnOff?.onPress).toEqual(expect.any(Function));

    await act(async () => {
      await turnOff?.onPress?.();
    });

    expect(mockSetSendConfirmationRequired).toHaveBeenCalledWith(false);
    expect(findSwitch(renderer!).props.value).toBe(false);
  });

  it('turns manual send confirmation back on without an extra warning', async () => {
    mockIsSendConfirmationRequired.mockResolvedValue(false);
    const { SettingsScreen } = require('../SettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<SettingsScreen />);
    });

    expect(findSwitch(renderer!).props.value).toBe(false);

    await act(async () => {
      await findSwitch(renderer!).props.onValueChange(true);
    });

    expect(mockSetSendConfirmationRequired).toHaveBeenCalledWith(true);
    expect(findSwitch(renderer!).props.value).toBe(true);
  });
});
