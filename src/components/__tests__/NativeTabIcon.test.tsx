import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { NativeTabIcon } from '../NativeTabIcon';

jest.mock('expo-symbols', () => ({
  SymbolView: 'SymbolView',
}), { virtual: true });

const SymbolViewHost = 'SymbolView' as unknown as React.ElementType;

describe('NativeTabIcon', () => {
  it('renders native platform symbols for tab bar icons', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <NativeTabIcon
          focused
          color="#7061EF"
          symbol={{
            ios: 'house.fill',
            android: 'home_filled',
          }}
        />
      );
    });

    expect(renderer!.root.findByType(SymbolViewHost).props.name).toEqual({
      ios: 'house.fill',
      android: 'home_filled',
    });
    expect(renderer!.root.findByType(SymbolViewHost).props.size).toBe(24);
    expect(renderer!.root.findByType(SymbolViewHost).props.type).toBe('hierarchical');
    expect(renderer!.root.findByType(SymbolViewHost).props.tintColor).toBe('#7061EF');
    expect(renderer!.root.findByType(SymbolViewHost).props.weight).toEqual({
      ios: 'semibold',
      android: expect.objectContaining({ name: expect.any(String) }),
    });
  });
});
