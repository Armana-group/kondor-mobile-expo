import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { NativeMaterialSurface } from '../../components/NativeMaterialSurface';
import { NativeTabIcon } from '../../components/NativeTabIcon';
import {
  createTabBarIcon,
  getTabNavigatorScreenOptions,
} from '../tabBarStyling';

jest.mock('expo-glass-effect', () => ({
  GlassView: 'GlassView',
  isGlassEffectAPIAvailable: jest.fn(() => false),
  isLiquidGlassAvailable: jest.fn(() => false),
}), { virtual: true });

jest.mock('expo-blur', () => ({
  BlurView: 'BlurView',
}), { virtual: true });

jest.mock('expo-symbols', () => ({
  SymbolView: 'SymbolView',
}), { virtual: true });

jest.mock('expo-symbols/androidWeights/semiBold', () => ({
  name: 'Material Symbols Rounded',
  font: 700,
}), { virtual: true });

describe('TabNavigator iOS material styling', () => {
  it('uses a floating native material tab bar background', async () => {
    const options = getTabNavigatorScreenOptions();
    let backgroundRenderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      backgroundRenderer = TestRenderer.create(
        options.tabBarBackground?.() as React.ReactElement
      );
    });

    expect(options.tabBarStyle).toEqual(
      expect.objectContaining({
        position: 'absolute',
        backgroundColor: 'transparent',
        borderTopWidth: 0,
      })
    );
    expect(backgroundRenderer!.root.findByType(NativeMaterialSurface).props.variant).toBe('tabBar');
  });

  it('creates native-symbol tab icons', async () => {
    let iconRenderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      iconRenderer = TestRenderer.create(
        createTabBarIcon({
          ios: 'house.fill',
          android: 'home_filled',
        })({ focused: true, color: '#7061EF', size: 24 })
      );
    });

    expect(iconRenderer!.root.findByType(NativeTabIcon).props.symbol).toEqual({
      ios: 'house.fill',
      android: 'home_filled',
    });
  });
});
