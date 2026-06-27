import React from 'react';
import { Image, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { StartupSplash } from '../StartupSplash';

describe('StartupSplash', () => {
  it('renders the Kondor startup identity', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<StartupSplash />);
    });

    expect(renderer!.root.findByProps({ testID: 'startup-splash' })).toBeTruthy();
    expect(renderer!.root.findByProps({ testID: 'startup-splash-logo' }).type).toBe(Image);
    expect(renderer!.root.findAllByType(Text).some((node) => node.props.children === 'Kondor Wallet')).toBe(
      true,
    );
  });
});
