import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { CustomDapp } from '../../stores/customDappStore';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockNavigate = jest.fn();
const mockInitializeWalletConnect = jest.fn(async () => undefined);
const mockPair = jest.fn(async () => undefined);
const mockDisconnectSession = jest.fn(async () => undefined);
const mockAddCustomDapp = jest.fn();
let mockCustomDapps: CustomDapp[] = [];

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../components/WalletConnectQRModal', () => ({
  WalletConnectQRModal: () => null,
}));

jest.mock('../../stores/walletStore', () => ({
  useWalletStore: () => ({
    address: '1WalletAddress',
    isWalletCreated: true,
  }),
}));

jest.mock('../../stores/walletConnectStore', () => ({
  useWalletConnectStore: () => ({
    initialized: true,
    initialize: mockInitializeWalletConnect,
    pair: mockPair,
    sessions: [],
    disconnectSession: mockDisconnectSession,
  }),
}));

jest.mock('../../stores/customDappStore', () => ({
  useCustomDappStore: () => ({
    customDapps: mockCustomDapps,
    addCustomDapp: mockAddCustomDapp,
    removeCustomDapp: jest.fn(),
  }),
}));

function collectRenderedText(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text)
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

function findPressableByText(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const node = renderer.root.findAllByType(TouchableOpacity).find((candidate) =>
    candidate.findAllByType(Text).some((textNode) => textNode.props.children === label)
  );

  if (!node) {
    throw new Error(`Pressable not found: ${label}`);
  }

  return node;
}

describe('BrowserScreen custom apps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCustomDapps = [];
    mockAddCustomDapp.mockReturnValue({
      ok: true,
      dapp: {
        id: 'custom-fogata',
        name: 'fogata.io',
        description: 'Custom URL',
        url: 'https://fogata.io',
        icon: '',
        category: 'other',
        createdAt: 1,
        updatedAt: 1,
        isCurated: false,
      },
    });
  });

  it('renders saved custom apps and opens them in the dApp WebView', async () => {
    mockCustomDapps = [
      {
        id: 'custom-fogata',
        name: 'Fogata',
        description: 'Custom URL',
        url: 'https://fogata.io',
        icon: '',
        category: 'defi',
        createdAt: 1,
        updatedAt: 1,
        isCurated: false,
      },
    ];
    const { BrowserScreen } = require('../BrowserScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BrowserScreen />);
    });

    expect(collectRenderedText(renderer!).join(' ')).toContain('Fogata');

    await act(async () => {
      findPressableByText(renderer!, 'Fogata').props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('DAppWebView', {
      app: expect.objectContaining({
        id: 'custom-fogata',
        name: 'Fogata',
        url: 'https://fogata.io',
      }),
    });
  });

  it('saves custom URLs before opening them', async () => {
    const { BrowserScreen } = require('../BrowserScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<BrowserScreen />);
    });

    await act(async () => {
      findPressableByText(renderer!, 'Add App').props.onPress();
    });

    const urlInput = renderer!.root.findAllByType(TextInput).find((node) =>
      node.props.placeholder === 'https://example.com'
    );

    if (!urlInput) {
      throw new Error('Custom URL input not found');
    }

    await act(async () => {
      urlInput.props.onChangeText('https://fogata.io');
    });

    await act(async () => {
      findPressableByText(renderer!, 'Save').props.onPress();
    });

    expect(mockAddCustomDapp).toHaveBeenCalledWith({
      name: 'fogata.io',
      url: 'https://fogata.io',
      category: 'other',
    });
    expect(mockNavigate).toHaveBeenCalledWith('DAppWebView', {
      app: expect.objectContaining({
        id: 'custom-fogata',
        url: 'https://fogata.io',
      }),
    });
  });
});
