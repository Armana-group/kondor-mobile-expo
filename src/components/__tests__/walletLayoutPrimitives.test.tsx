import React from 'react';
import { Switch, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { AppHeader } from '../AppHeader';
import { InfoCard } from '../InfoCard';
import { NativeMaterialSurface } from '../NativeMaterialSurface';
import { WarningInline } from '../WarningInline';
import { SettingsRow, SettingsSection } from '../settings';
import { layout } from '../../theme/layout';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .flat()
    .filter(Boolean)
    .join(' ');
}

describe('wallet layout primitives', () => {
  it('renders a consistent app header with a back action', async () => {
    const onBack = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<AppHeader title="Security & Privacy" onBack={onBack} />);
    });

    expect(renderedText(renderer!)).toContain('Security & Privacy');
    expect(renderer!.root.findByType(NativeMaterialSurface).props.variant).toBe('header');
    expect(renderer!.root.findByType(Text).props.numberOfLines).toBe(1);
    expect(renderer!.root.findByType(Text).props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ flexShrink: 1, textAlign: 'center' }),
      ])
    );

    await act(async () => {
      renderer!.root.findByProps({ accessibilityLabel: 'Go back' }).props.onPress();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders explanatory info cards with title, body, and children', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <InfoCard title="Sensitive Wallet Data" body="Authenticate before revealing secrets.">
          <Text>Child control</Text>
        </InfoCard>
      );
    });

    const text = renderedText(renderer!);
    expect(text).toContain('Sensitive Wallet Data');
    expect(text).toContain('Authenticate before revealing secrets.');
    expect(text).toContain('Child control');
    expect(renderer!.root.findByType(NativeMaterialSurface).props.variant).toBe('card');
  });

  it('renders settings rows with helper text and a stable trailing control column', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <SettingsSection title="Security">
          <SettingsRow
            label="Require biometrics for sends"
            helperText="Manual sends ask for device authentication before broadcasting."
            control={<Switch accessibilityLabel="Require biometrics for sends" value />}
            showChevron={false}
          />
        </SettingsSection>
      );
    });

    const text = renderedText(renderer!);
    expect(text).toContain('Security');
    expect(text).toContain('Require biometrics for sends');
    expect(text).toContain('Manual sends ask for device authentication before broadcasting.');
    expect(renderer!.root.findByType(Switch).props.accessibilityLabel).toBe('Require biometrics for sends');
    expect(renderer!.root.findByProps({ testID: 'settings-row-trailing-control' }).props.style)
      .toEqual(expect.arrayContaining([expect.objectContaining({ width: layout.row.controlColumnWidth })]));
  });

  it('renders no-icon row separators without icon inset spacing', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <SettingsSection title="Security">
          <SettingsRow label="Every transaction" showSeparator showChevron={false} />
        </SettingsSection>
      );
    });

    expect(
      renderer!.root.findByProps({ testID: 'settings-row-separator-Every transaction' }).props.style
    ).toEqual(expect.arrayContaining([expect.objectContaining({ marginLeft: 0 })]));
  });

  it('renders compact inline warnings with consistent copy', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<WarningInline text="Send biometrics are off" />);
    });

    expect(renderedText(renderer!)).toContain('Send biometrics are off');
    expect(renderer!.root.findByProps({ testID: 'warning-inline' })).toBeTruthy();
  });
});
