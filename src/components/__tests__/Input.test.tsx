import React from 'react';
import { StyleSheet, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { Input } from '../Input';
import { colors } from '../../theme/colors';

describe('Input', () => {
  it('keeps base dark-mode styles when a custom input style is provided', () => {
    let renderer: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <Input
          value="chicken egg ..."
          onChangeText={jest.fn()}
          style={{ minHeight: 120, textAlignVertical: 'top' }}
        />
      );
    });

    const input = renderer!.root.findByType(TextInput);
    const style = StyleSheet.flatten(input.props.style);

    expect(style.color).toBe(colors.textPrimary);
    expect(style.backgroundColor).toBe(colors.card);
    expect(style.borderColor).toBe(colors.border);
    expect(style.minHeight).toBe(120);
    expect(style.textAlignVertical).toBe('top');
  });
});
