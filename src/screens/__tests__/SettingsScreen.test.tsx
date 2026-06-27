import React from 'react';
import { Alert, Text } from 'react-native';
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

describe('SettingsScreen', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
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
      'Network',
      'Contacts',
      'Lock Wallet',
      'Remove Wallet',
      'Mainnet',
    ]));
    expect(text).not.toContain('Send confirmation');
    expect(text).not.toContain('Require biometrics for sends');
    expect(text).not.toContain('Less secure: sends will not ask for biometrics.');
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

});
