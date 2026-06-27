import React from 'react';
import { Alert, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockGoBack = jest.fn();
const mockSetMode = jest.fn(async () => undefined);
const mockCheckNetworkHealth = jest.fn();
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

type MockHealthSummary = {
  status: 'online' | 'degraded' | 'unavailable';
  healthyCount: number;
  totalCount: number;
  title: string;
  detail: string;
  checkedAt: number;
  bestHeight?: number;
};

const onlineSummary: MockHealthSummary = {
  status: 'online',
  healthyCount: 2,
  totalCount: 2,
  title: 'Network online',
  detail: 'Kondor can reach this Koinos network.',
  checkedAt: 1_718_910_000_000,
  bestHeight: 12345,
};

const unavailableSummary: MockHealthSummary = {
  status: 'unavailable',
  healthyCount: 0,
  totalCount: 2,
  title: 'Network unavailable',
  detail: 'Kondor cannot reach this Koinos network right now.',
  checkedAt: 1_718_910_000_000,
};

let mockHealthByNetwork: Record<'mainnet' | 'harbinger', MockHealthSummary> = {
  mainnet: onlineSummary,
  harbinger: onlineSummary,
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

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

jest.mock('../../services/networkHealth', () => ({
  checkNetworkHealth: (urls: string[]) => mockCheckNetworkHealth(urls),
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
  const button = renderer.root.findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((textNode) => textNode.props.children === label));

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
    mockHealthByNetwork = {
      mainnet: onlineSummary,
      harbinger: onlineSummary,
    };
    mockCheckNetworkHealth.mockImplementation(async (urls: string[]) => ({
      nodes: [],
      summary: urls.some((url) => url.includes('harbinger') || url.includes('testnet'))
        ? mockHealthByNetwork.harbinger
        : mockHealthByNetwork.mainnet,
    }));
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  it('shows both supported networks with health status and selected status', async () => {
    const { NetworkSettingsScreen } = require('../NetworkSettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<NetworkSettingsScreen />);
    });

    const text = collectRenderedText(renderer!);

    expect(text).toEqual(expect.arrayContaining([
      'Mainnet',
      'Harbinger',
      'Selected',
      'Online',
      '2 of 2 nodes reachable',
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
    expect(text).not.toContain('Selected');
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
    expect(text).toContain('Selected');
    expect(text).toContain('Online');
    expect(text).not.toContain('Available');
    expect(text).not.toContain('Loading...');
  });

  it('keeps network choices disabled until health checks complete', async () => {
    const mainnetHealth = createDeferred<{ nodes: never[]; summary: MockHealthSummary }>();
    const harbingerHealth = createDeferred<{ nodes: never[]; summary: MockHealthSummary }>();
    mockCheckNetworkHealth
      .mockImplementationOnce(async () => mainnetHealth.promise)
      .mockImplementationOnce(async () => harbingerHealth.promise);
    const { NetworkSettingsScreen } = require('../NetworkSettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<NetworkSettingsScreen />);
    });

    expect(findButtonByText(renderer!, 'Harbinger').props.disabled).toBe(true);
    expect(collectRenderedText(renderer!)).toContain('Checking network health...');

    await act(async () => {
      mainnetHealth.resolve({ nodes: [], summary: onlineSummary });
      harbingerHealth.resolve({ nodes: [], summary: onlineSummary });
      await Promise.all([mainnetHealth.promise, harbingerHealth.promise]);
    });

    expect(findButtonByText(renderer!, 'Harbinger').props.disabled).toBe(false);
  });

  it('blocks unavailable network switching with a direct alert', async () => {
    mockHealthByNetwork = {
      mainnet: onlineSummary,
      harbinger: unavailableSummary,
    };
    const { NetworkSettingsScreen } = require('../NetworkSettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<NetworkSettingsScreen />);
    });

    const harbingerButton = findButtonByText(renderer!, 'Harbinger');

    expect(harbingerButton.props.disabled).toBe(false);

    await act(async () => {
      harbingerButton.props.onPress();
    });

    expect(mockSetMode).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Network Unavailable',
      'Kondor cannot reach Harbinger right now. Try again after the network is reachable.',
      [{ text: 'OK' }]
    );
  });

  it('confirms before switching to an online network', async () => {
    const { NetworkSettingsScreen } = require('../NetworkSettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<NetworkSettingsScreen />);
    });

    expect(findButtonByText(renderer!, 'Harbinger').props.disabled).toBe(false);

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

  it('refreshes network health on request', async () => {
    const { NetworkSettingsScreen } = require('../NetworkSettingsScreen');
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<NetworkSettingsScreen />);
    });

    expect(mockCheckNetworkHealth).toHaveBeenCalledTimes(2);

    await act(async () => {
      findButtonByText(renderer!, 'Refresh health').props.onPress();
    });

    expect(mockCheckNetworkHealth).toHaveBeenCalledTimes(4);
  });
});
