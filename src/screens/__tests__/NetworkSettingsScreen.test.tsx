import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockGoBack = jest.fn();
const mockSetMode = jest.fn(async () => undefined);
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

let mockNetworkState = {
  mode: 'mainnet' as 'mainnet' | 'harbinger',
  hasHydrated: true,
  setMode: mockSetMode,
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
  }),
}));

jest.mock('../../components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
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
  const button = renderer.root.findAllByType(TouchableOpacity).find((node) =>
    node.findAllByType(Text).some((textNode) => textNode.props.children === label)
  );

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

describe('NetworkSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNetworkState = {
      mode: 'mainnet',
      hasHydrated: true,
      setMode: mockSetMode,
    };
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  it('shows both supported networks and the current status', async () => {
    const { NetworkSettingsScreen } = require('../NetworkSettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<NetworkSettingsScreen />);
    });

    const text = collectRenderedText(renderer!);

    expect(text).toEqual(expect.arrayContaining([
      'Mainnet',
      'Harbinger',
      'Current',
    ]));
  });

  it('keeps network status loading and blocks switching before hydration completes', async () => {
    mockNetworkState = {
      mode: 'mainnet',
      hasHydrated: false,
      setMode: mockSetMode,
    };
    const { NetworkSettingsScreen } = require('../NetworkSettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<NetworkSettingsScreen />);
    });

    const text = collectRenderedText(renderer!);

    expect(text).toContain('Loading...');
    expect(text).not.toContain('Current');
    expect(text).not.toContain('Available');

    await act(async () => {
      findButtonByText(renderer!, 'Harbinger').props.onPress();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('shows the hydrated persisted network as current', async () => {
    mockNetworkState = {
      mode: 'harbinger',
      hasHydrated: true,
      setMode: mockSetMode,
    };
    const { NetworkSettingsScreen } = require('../NetworkSettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<NetworkSettingsScreen />);
    });

    const text = collectRenderedText(renderer!);

    expect(text).toContain('Harbinger');
    expect(text).toContain('Current');
    expect(text).toContain('Available');
    expect(text).not.toContain('Loading...');
  });

  it('confirms before switching the active network', async () => {
    const { NetworkSettingsScreen } = require('../NetworkSettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<NetworkSettingsScreen />);
    });

    await act(async () => {
      findButtonByText(renderer!, 'Harbinger').props.onPress();
    });

    expect(mockSetMode).not.toHaveBeenCalled();

    const confirmButton = alertSpy.mock.calls.at(-1)?.[2]?.find((button) => button.text === 'Switch');
    expect(confirmButton?.onPress).toEqual(expect.any(Function));

    await act(async () => {
      await confirmButton?.onPress?.();
    });

    expect(mockSetMode).toHaveBeenCalledWith('harbinger');
  });
});
