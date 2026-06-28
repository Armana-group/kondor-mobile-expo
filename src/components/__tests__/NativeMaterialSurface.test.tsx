import React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  NativeMaterialSurface,
  resolveNativeMaterialMode,
} from '../NativeMaterialSurface';

jest.mock('expo-glass-effect', () => ({
  GlassView: 'GlassView',
  isGlassEffectAPIAvailable: jest.fn(() => true),
  isLiquidGlassAvailable: jest.fn(() => true),
}), { virtual: true });

jest.mock('expo-blur', () => ({
  BlurView: 'BlurView',
}), { virtual: true });

const GlassViewHost = 'GlassView' as unknown as React.ElementType;
const BlurViewHost = 'BlurView' as unknown as React.ElementType;

describe('NativeMaterialSurface', () => {
  it('prefers Liquid Glass only when iOS glass APIs are available', () => {
    expect(resolveNativeMaterialMode({
      platform: 'ios',
      isGlassEffectAPIAvailable: true,
      isLiquidGlassAvailable: true,
    })).toBe('glass');

    expect(resolveNativeMaterialMode({
      platform: 'ios',
      isGlassEffectAPIAvailable: false,
      isLiquidGlassAvailable: true,
    })).toBe('blur');

    expect(resolveNativeMaterialMode({
      platform: 'android',
      isGlassEffectAPIAvailable: true,
      isLiquidGlassAvailable: true,
    })).toBe('solid');
  });

  it('renders forced glass, blur, and solid material modes', async () => {
    let glassRenderer: TestRenderer.ReactTestRenderer;
    let blurRenderer: TestRenderer.ReactTestRenderer;
    let solidRenderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      glassRenderer = TestRenderer.create(
        <NativeMaterialSurface material="glass" variant="card">
          <Text>Glass card</Text>
        </NativeMaterialSurface>
      );
      blurRenderer = TestRenderer.create(
        <NativeMaterialSurface material="blur" variant="tabBar">
          <Text>Blur tab</Text>
        </NativeMaterialSurface>
      );
      solidRenderer = TestRenderer.create(
        <NativeMaterialSurface material="solid">
          <Text>Solid fallback</Text>
        </NativeMaterialSurface>
      );
    });

    expect(glassRenderer!.root.findByType(GlassViewHost).props.glassEffectStyle).toBe('regular');
    expect(glassRenderer!.root.findByType(GlassViewHost).props.colorScheme).toBe('dark');
    expect(blurRenderer!.root.findByType(BlurViewHost).props.intensity).toBeGreaterThan(0);
    expect(solidRenderer!.root.findByType(View)).toBeTruthy();
  });
});
