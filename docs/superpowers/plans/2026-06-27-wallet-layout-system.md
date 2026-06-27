# Wallet Layout System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small HIG-informed layout foundation and migrate the Settings, Security & Privacy, and Send warning surfaces onto it.

**Architecture:** Introduce shared layout tokens plus focused React Native primitives for headers, cards, settings sections, settings rows, and inline warnings. Use those primitives in the settings-like pilot screens while preserving current wallet, send, auth, and navigation behavior.

**Tech Stack:** React Native, Expo, TypeScript, Jest, react-test-renderer, `@expo/vector-icons`.

## Global Constraints

- Preserve Kondor's visual identity: graphite backgrounds, dark cards, purple accents, restrained warning/status colors.
- Use Apple Human Interface Guidelines as a layout-quality reference, not as a visual clone.
- Keep the first migration limited to `SettingsScreen`, `SecurityPrivacyScreen`, and the touched send-warning area in `SendScreen`.
- Do not change navigation structure, wallet flows, authentication behavior, send behavior, or persisted setting names.
- Do not introduce a third-party component library.
- Do not rename lower-level storage/service APIs such as `sendConfirmationRequired`.
- Do not reset or discard the existing dirty send-biometric UI work.

---

## File Structure

- Create `src/theme/layout.ts` for screen, header, card, row, separator, text, and warning layout tokens.
- Create `src/components/AppHeader.tsx` for the centered title plus back-button header pattern.
- Create `src/components/InfoCard.tsx` for explanatory card blocks.
- Create `src/components/WarningInline.tsx` for compact status/warning rows.
- Create `src/components/settings/SettingsSection.tsx` for grouped settings cards.
- Create `src/components/settings/SettingsRow.tsx` for label/helper/icon/trailing-control settings rows.
- Create `src/components/settings/index.ts` for settings primitive exports.
- Create `src/components/__tests__/walletLayoutPrimitives.test.tsx` for primitive behavior tests.
- Modify `src/screens/SettingsScreen.tsx` to use `AppHeader`, `SettingsSection`, and `SettingsRow`.
- Modify `src/screens/__tests__/SettingsScreen.test.tsx` to verify the migrated screen uses the shared settings primitives while preserving existing behavior.
- Modify `src/screens/SecurityPrivacyScreen.tsx` to use `AppHeader`, `InfoCard`, `SettingsSection`, `SettingsRow`, and `WarningInline`.
- Modify `src/screens/__tests__/SecurityPrivacyScreen.test.tsx` to verify the migrated security layout primitives and existing send-biometric behavior.
- Modify `src/screens/SendScreen.tsx` to use `WarningInline` for the existing send-biometric warning when extraction stays local.
- Modify `src/screens/__tests__/SendScreen.test.tsx` to verify the shared warning primitive is rendered when send biometrics are off.

---

### Task 1: Shared Layout Tokens And Primitives

**Files:**
- Create: `src/theme/layout.ts`
- Create: `src/components/AppHeader.tsx`
- Create: `src/components/InfoCard.tsx`
- Create: `src/components/WarningInline.tsx`
- Create: `src/components/settings/SettingsSection.tsx`
- Create: `src/components/settings/SettingsRow.tsx`
- Create: `src/components/settings/index.ts`
- Create: `src/components/__tests__/walletLayoutPrimitives.test.tsx`

**Interfaces:**
- Produces: `layout` exported from `src/theme/layout.ts`
- Produces: `AppHeader(props: AppHeaderProps): JSX.Element`
- Produces: `InfoCard(props: InfoCardProps): JSX.Element`
- Produces: `WarningInline(props: WarningInlineProps): JSX.Element`
- Produces: `SettingsSection(props: SettingsSectionProps): JSX.Element`
- Produces: `SettingsRow(props: SettingsRowProps): JSX.Element`
- Consumes: existing `colors` from `src/theme/colors.ts`

- [ ] **Step 1: Write the failing primitive tests**

Create `src/components/__tests__/walletLayoutPrimitives.test.tsx`:

```tsx
import React from 'react';
import { Switch, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { AppHeader } from '../AppHeader';
import { InfoCard } from '../InfoCard';
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

  it('renders compact inline warnings with consistent copy', async () => {
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<WarningInline text="Send biometrics are off" />);
    });

    expect(renderedText(renderer!)).toContain('Send biometrics are off');
    expect(renderer!.root.findByProps({ testID: 'warning-inline' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the primitive tests and verify they fail**

Run:

```bash
npm test -- --runInBand src/components/__tests__/walletLayoutPrimitives.test.tsx
```

Expected: FAIL because `../AppHeader`, `../InfoCard`, `../WarningInline`, `../settings`, and `../../theme/layout` do not exist yet.

- [ ] **Step 3: Create the layout token module**

Create `src/theme/layout.ts`:

```ts
import { borderRadius, spacing } from './colors';

export const layout = {
  screen: {
    gutter: spacing.xl,
    bottomPadding: 40,
  },
  header: {
    horizontalPadding: spacing.xl,
    topPadding: spacing.md,
    bottomPadding: spacing.lg,
    sideButtonWidth: 40,
    iconSize: 28,
  },
  card: {
    padding: spacing.lg,
    radius: borderRadius.xl,
  },
  section: {
    gap: spacing.lg,
    titleTopPadding: spacing.lg,
    titleBottomPadding: spacing.sm,
  },
  row: {
    minHeight: 58,
    tallMinHeight: 72,
    horizontalPadding: spacing.lg,
    verticalPadding: spacing.md,
    iconSize: 22,
    iconColumnWidth: 34,
    accessoryGap: spacing.sm,
    controlColumnWidth: 66,
    labelHelperGap: 2,
  },
  separator: {
    insetWithIcon: 50,
  },
  text: {
    helperTopMargin: 2,
  },
  warning: {
    gap: spacing.sm,
    topPadding: spacing.md,
    horizontalPadding: spacing.md,
    verticalPadding: 9,
    radius: borderRadius.md,
  },
};

export default layout;
```

- [ ] **Step 4: Create `AppHeader`**

Create `src/components/AppHeader.tsx`:

```tsx
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { layout } from '../theme/layout';

type AppHeaderProps = {
  title: string;
  onBack: () => void;
  backAccessibilityLabel?: string;
  rightAccessory?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export const AppHeader = ({
  title,
  onBack,
  backAccessibilityLabel = 'Go back',
  rightAccessory,
  style,
}: AppHeaderProps) => (
  <View style={[styles.header, style]} testID="app-header">
    <Pressable
      style={({ pressed }) => [styles.sideButton, pressed ? styles.pressed : null]}
      onPress={onBack}
      accessibilityRole="button"
      accessibilityLabel={backAccessibilityLabel}
      hitSlop={8}
    >
      <Ionicons name="chevron-back" size={layout.header.iconSize} color={colors.purple} />
    </Pressable>
    <Text style={styles.title}>{title}</Text>
    <View style={styles.sideButton}>{rightAccessory}</View>
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.header.horizontalPadding,
    paddingTop: layout.header.topPadding,
    paddingBottom: layout.header.bottomPadding,
  },
  sideButton: {
    width: layout.header.sideButtonWidth,
    minHeight: layout.header.sideButtonWidth,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.65,
  },
});
```

- [ ] **Step 5: Create `InfoCard`**

Create `src/components/InfoCard.tsx`:

```tsx
import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import colors from '../theme/colors';
import { layout } from '../theme/layout';

type InfoCardProps = {
  title: string;
  body?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const InfoCard = ({
  title,
  body,
  children,
  style,
  testID = 'info-card',
}: InfoCardProps) => (
  <View style={[styles.card, style]} testID={testID}>
    <Text style={styles.title}>{title}</Text>
    {body ? <Text style={styles.body}>{body}</Text> : null}
    {children ? <View style={styles.children}>{children}</View> : null}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: layout.card.radius,
    padding: layout.card.padding,
    marginBottom: layout.section.gap,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  children: {
    marginTop: layout.row.verticalPadding,
  },
});
```

- [ ] **Step 6: Create `WarningInline`**

Create `src/components/WarningInline.tsx`:

```tsx
import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { layout } from '../theme/layout';

type WarningInlineVariant = 'warning' | 'error' | 'success';

type WarningInlineProps = {
  text: string;
  variant?: WarningInlineVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

const variantColors: Record<WarningInlineVariant, string> = {
  warning: colors.warning,
  error: colors.error,
  success: colors.success,
};

export const WarningInline = ({
  text,
  variant = 'warning',
  icon = 'warning-outline',
  style,
  textStyle,
  testID = 'warning-inline',
}: WarningInlineProps) => {
  const color = variantColors[variant];

  return (
    <View style={[styles.container, variant === 'warning' ? styles.warningBackground : null, style]} testID={testID}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.text, { color }, textStyle]}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.warning.gap,
    borderWidth: 1,
    borderRadius: layout.warning.radius,
    paddingHorizontal: layout.warning.horizontalPadding,
    paddingVertical: layout.warning.verticalPadding,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  warningBackground: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});
```

- [ ] **Step 7: Create `SettingsSection`**

Create `src/components/settings/SettingsSection.tsx`:

```tsx
import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import colors from '../../theme/colors';
import { layout } from '../../theme/layout';

type SettingsSectionProps = {
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const SettingsSection = ({
  title,
  children,
  style,
  testID,
}: SettingsSectionProps) => (
  <View style={[styles.section, style]} testID={testID ?? (title ? `settings-section-${title}` : 'settings-section')}>
    {title ? <Text style={styles.title}>{title}</Text> : null}
    {children}
  </View>
);

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.card,
    borderRadius: layout.card.radius,
    marginBottom: layout.section.gap,
    overflow: 'hidden',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: layout.row.horizontalPadding,
    paddingTop: layout.section.titleTopPadding,
    paddingBottom: layout.section.titleBottomPadding,
    textTransform: 'uppercase',
  },
});
```

- [ ] **Step 8: Create `SettingsRow`**

Create `src/components/settings/SettingsRow.tsx`:

```tsx
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { layout } from '../../theme/layout';

type SettingsRowHeight = 'default' | 'tall';

type SettingsRowProps = {
  label: string;
  helperText?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  destructive?: boolean;
  value?: string;
  control?: React.ReactNode;
  selected?: boolean;
  showChevron?: boolean;
  showSeparator?: boolean;
  minHeight?: SettingsRowHeight;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

export const SettingsRow = ({
  label,
  helperText,
  icon,
  iconColor,
  destructive = false,
  value,
  control,
  selected = false,
  showChevron = true,
  showSeparator = false,
  minHeight = 'default',
  onPress,
  disabled = false,
  style,
  accessibilityLabel,
  testID,
}: SettingsRowProps) => {
  const textColor = destructive ? colors.error : colors.textPrimary;
  const resolvedIconColor = iconColor ?? (destructive ? colors.error : colors.purple);
  const shouldShowChevron = Boolean(showChevron && onPress && !control && !selected);

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.row,
          minHeight === 'tall' ? styles.tallRow : styles.defaultRow,
          disabled ? styles.disabled : null,
          onPress && pressed ? styles.pressed : null,
          style,
        ]}
        onPress={onPress}
        disabled={disabled || !onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel}
        testID={testID ?? `settings-row-${label}`}
      >
        <View style={styles.left}>
          {icon ? (
            <View style={styles.iconColumn}>
              <Ionicons name={icon} size={layout.row.iconSize} color={resolvedIconColor} />
            </View>
          ) : null}
          <View style={styles.copy}>
            <Text style={[styles.label, { color: textColor }]}>{label}</Text>
            {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
          </View>
        </View>

        {control ? (
          <View style={[styles.trailingControl, { width: layout.row.controlColumnWidth }]} testID="settings-row-trailing-control">
            {control}
          </View>
        ) : value ? (
          <View style={styles.trailingValue}>
            <Text style={styles.value}>{value}</Text>
            {shouldShowChevron ? <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} /> : null}
          </View>
        ) : selected ? (
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
        ) : shouldShowChevron ? (
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        ) : null}
      </Pressable>
      {showSeparator ? <View style={styles.separator} /> : null}
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: layout.row.horizontalPadding,
    paddingVertical: layout.row.verticalPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.row.accessoryGap,
  },
  defaultRow: {
    minHeight: layout.row.minHeight,
  },
  tallRow: {
    minHeight: layout.row.tallMinHeight,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  iconColumn: {
    width: layout.row.iconColumnWidth,
    alignItems: 'flex-start',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  helper: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: layout.text.helperTopMargin,
  },
  trailingControl: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  trailingValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.row.accessoryGap,
    flexShrink: 0,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: layout.separator.insetWithIcon,
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.6,
  },
});
```

- [ ] **Step 9: Create the settings primitive export**

Create `src/components/settings/index.ts`:

```ts
export { SettingsSection } from './SettingsSection';
export { SettingsRow } from './SettingsRow';
```

- [ ] **Step 10: Run primitive tests and verify they pass**

Run:

```bash
npm test -- --runInBand src/components/__tests__/walletLayoutPrimitives.test.tsx
```

Expected: PASS with 4 tests.

- [ ] **Step 11: Commit Task 1**

Run:

```bash
git add src/theme/layout.ts src/components/AppHeader.tsx src/components/InfoCard.tsx src/components/WarningInline.tsx src/components/settings/SettingsSection.tsx src/components/settings/SettingsRow.tsx src/components/settings/index.ts src/components/__tests__/walletLayoutPrimitives.test.tsx
git commit -m "feat: add wallet layout primitives"
```

---

### Task 2: Migrate Settings Screen

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/screens/__tests__/SettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `AppHeader`
- Consumes: `SettingsSection`
- Consumes: `SettingsRow`
- Preserves: `SettingsItem` and `SettingsSection` screen data shape, except rename the local `SettingsSection` type to avoid colliding with the imported component.

- [ ] **Step 1: Write the failing Settings migration test**

In `src/screens/__tests__/SettingsScreen.test.tsx`, add these assertions inside `renders the consolidated settings index required for parity` after the existing text assertions:

```tsx
expect(renderer!.root.findByProps({ testID: 'app-header' })).toBeTruthy();
expect(renderer!.root.findByProps({ testID: 'settings-section-Wallet' })).toBeTruthy();
expect(renderer!.root.findByProps({ testID: 'settings-section-Security' })).toBeTruthy();
expect(renderer!.root.findByProps({ testID: 'settings-row-Security & Privacy' })).toBeTruthy();
expect(renderer!.root.findByProps({ testID: 'settings-row-Network' })).toBeTruthy();
```

- [ ] **Step 2: Run the Settings screen test and verify it fails**

Run:

```bash
npm test -- --runInBand src/screens/__tests__/SettingsScreen.test.tsx
```

Expected: FAIL because `app-header` and `settings-section-*` test IDs are not rendered by `SettingsScreen` yet.

- [ ] **Step 3: Update Settings screen imports and local type names**

In `src/screens/SettingsScreen.tsx`, replace the local component imports with:

```tsx
import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { SettingsRow, SettingsSection } from '../components/settings';
import { useWalletStore } from '../stores/walletStore';
import { useNetworkStore } from '../stores/networkStore';
import colors from '../theme/colors';
import { layout } from '../theme/layout';
```

Rename the local section type:

```tsx
type SettingsItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  value?: string;
  destructive?: boolean;
};

type SettingsGroup = {
  title: string;
  items: SettingsItem[];
};
```

Update the sections declaration:

```tsx
const sections: SettingsGroup[] = [
```

- [ ] **Step 4: Replace the Settings screen JSX with shared primitives**

In `src/screens/SettingsScreen.tsx`, replace the `return` body with:

```tsx
return (
  <Screen scroll={false}>
    <View style={styles.container}>
      <AppHeader title="Settings" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section) => (
          <SettingsSection key={section.title} title={section.title}>
            {section.items.map((item, index) => {
              const color = item.destructive ? colors.error : colors.purple;

              return (
                <SettingsRow
                  key={item.label}
                  label={item.label}
                  icon={item.icon}
                  iconColor={color}
                  value={item.value}
                  destructive={item.destructive}
                  onPress={item.onPress}
                  showSeparator={index < section.items.length - 1}
                />
              );
            })}
          </SettingsSection>
        ))}
      </ScrollView>
    </View>
  </Screen>
);
```

- [ ] **Step 5: Reduce Settings local styles to screen-only layout**

Replace the `styles` object in `src/screens/SettingsScreen.tsx` with:

```tsx
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: layout.screen.gutter,
  },
  contentContainer: {
    paddingBottom: layout.screen.bottomPadding,
  },
});
```

- [ ] **Step 6: Run the Settings screen test and verify it passes**

Run:

```bash
npm test -- --runInBand src/screens/__tests__/SettingsScreen.test.tsx
```

Expected: PASS with the existing Settings behavior preserved and the new primitive test IDs present.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add src/screens/SettingsScreen.tsx src/screens/__tests__/SettingsScreen.test.tsx
git commit -m "refactor: migrate settings screen layout"
```

---

### Task 3: Migrate Security And Privacy Screen

**Files:**
- Modify: `src/screens/SecurityPrivacyScreen.tsx`
- Modify: `src/screens/__tests__/SecurityPrivacyScreen.test.tsx`

**Interfaces:**
- Consumes: `AppHeader`
- Consumes: `InfoCard`
- Consumes: `SettingsSection`
- Consumes: `SettingsRow`
- Consumes: `WarningInline`
- Preserves: `handleSendConfirmationToggle(nextRequired?: boolean): void`
- Preserves: `handleTransactionAuthorizationModePress(mode: TransactionAuthorizationMode): Promise<void>`
- Preserves: secret reveal and copy alert flows.

- [ ] **Step 1: Write the failing Security & Privacy migration test**

In `src/screens/__tests__/SecurityPrivacyScreen.test.tsx`, add these assertions to `shows a clear biometric approval control for manual sends` after the existing switch assertions:

```tsx
expect(renderer!.root.findByProps({ testID: 'app-header' })).toBeTruthy();
expect(renderer!.root.findByProps({ testID: 'settings-row-Require biometrics for sends' })).toBeTruthy();
expect(renderer!.root.findByProps({ testID: 'settings-row-trailing-control' })).toBeTruthy();
```

In `warns before turning off manual send biometrics`, add this assertion after the existing warning-copy assertion:

```tsx
expect(renderer!.root.findByProps({ testID: 'warning-inline' })).toBeTruthy();
```

- [ ] **Step 2: Run the Security & Privacy test and verify it fails**

Run:

```bash
npm test -- --runInBand src/screens/__tests__/SecurityPrivacyScreen.test.tsx
```

Expected: FAIL because `SecurityPrivacyScreen` does not render the shared primitive test IDs yet.

- [ ] **Step 3: Update Security & Privacy imports**

In `src/screens/SecurityPrivacyScreen.tsx`, replace the component imports with:

```tsx
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { InfoCard } from '../components/InfoCard';
import { WarningInline } from '../components/WarningInline';
import { SettingsRow, SettingsSection } from '../components/settings';
import { HapticFeedback } from '../lib/haptics';
import { copyWithAutoClear } from '../lib/clipboard';
import { sanitizeErrorForUser } from '../lib/logger';
import { useWalletStore } from '../stores/walletStore';
```

Keep the existing service imports and `colors` import, and add:

```tsx
import { layout } from '../theme/layout';
```

- [ ] **Step 4: Replace the Security & Privacy JSX with shared primitives**

In `src/screens/SecurityPrivacyScreen.tsx`, replace the JSX returned inside `<Screen scroll={false}>` with:

```tsx
<View style={styles.container}>
  <AppHeader title="Security & Privacy" onBack={() => navigation.goBack()} />

  <ScrollView
    style={styles.content}
    contentContainerStyle={styles.contentContainer}
    showsVerticalScrollIndicator={false}
  >
    <InfoCard
      title="Sensitive Wallet Data"
      body="Each reveal and copy action requires device authentication before the data is shown or moved to the clipboard."
    />

    <SettingsSection>
      <SettingsRow
        label="Require biometrics for sends"
        helperText="Manual sends ask for device authentication before broadcasting."
        minHeight="tall"
        control={
          <Switch
            accessibilityLabel="Require biometrics for sends"
            value={sendConfirmationRequired}
            onValueChange={handleSendConfirmationToggle}
            trackColor={{
              false: colors.border,
              true: colors.purple,
            }}
            thumbColor={colors.textPrimary}
            ios_backgroundColor={colors.border}
          />
        }
        showChevron={false}
      />
      {!sendConfirmationRequired && (
        <WarningInline
          text="Manual sends will skip device authentication."
          style={styles.sectionWarning}
        />
      )}
    </SettingsSection>

    <InfoCard
      title="Transaction Authorization"
      body="Remember manual send and native swap authorization briefly in memory. dApp and WalletConnect approvals still require confirmation."
    >
      <View style={styles.authorizationOptions}>
        {getTransactionAuthorizationOptions().map((option, index, options) => (
          <SettingsRow
            key={option.mode}
            label={option.label}
            helperText={option.detail}
            minHeight="tall"
            selected={transactionAuthorizationMode === option.mode}
            showChevron={false}
            showSeparator={index < options.length - 1}
            onPress={() => void handleTransactionAuthorizationModePress(option.mode)}
          />
        ))}
      </View>
    </InfoCard>

    <SettingsSection>
      {secretActions.map((action, index) => (
        <SettingsRow
          key={action.title}
          label={`View ${action.title}`}
          helperText="Authenticate to reveal or copy"
          icon={action.icon}
          onPress={() => handleRevealSecret(action)}
          disabled={isLoading}
          showSeparator={index < secretActions.length - 1}
        />
      ))}
    </SettingsSection>
  </ScrollView>
</View>
```

- [ ] **Step 5: Replace Security & Privacy styles with local screen-only styles**

Replace the `styles` object in `src/screens/SecurityPrivacyScreen.tsx` with:

```tsx
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: layout.screen.gutter,
  },
  contentContainer: {
    paddingBottom: layout.screen.bottomPadding,
  },
  authorizationOptions: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionWarning: {
    marginHorizontal: layout.row.horizontalPadding,
    marginBottom: layout.row.verticalPadding,
  },
});
```

- [ ] **Step 6: Run the Security & Privacy test and verify it passes**

Run:

```bash
npm test -- --runInBand src/screens/__tests__/SecurityPrivacyScreen.test.tsx
```

Expected: PASS with the existing secret reveal/copy tests, transaction authorization tests, send-biometric switch tests, and new primitive assertions passing.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add src/screens/SecurityPrivacyScreen.tsx src/screens/__tests__/SecurityPrivacyScreen.test.tsx
git commit -m "refactor: migrate security privacy layout"
```

---

### Task 4: Send Warning Integration And Final Verification

**Files:**
- Modify: `src/screens/SendScreen.tsx`
- Modify: `src/screens/__tests__/SendScreen.test.tsx`
- Verify: all files changed by Tasks 1-4.

**Interfaces:**
- Consumes: `WarningInline`
- Preserves: `sendConfirmationRequired` display condition.
- Preserves: existing send flow, backup notice flow, and button disabled behavior.

- [ ] **Step 1: Write the failing Send warning primitive test**

In `src/screens/__tests__/SendScreen.test.tsx`, locate the existing test that asserts `Send biometrics are off`. Add this assertion immediately after the text assertion:

```tsx
expect(renderer!.root.findByProps({ testID: 'warning-inline' })).toBeTruthy();
```

- [ ] **Step 2: Run the Send screen test and verify it fails**

Run:

```bash
npm test -- --runInBand src/screens/__tests__/SendScreen.test.tsx
```

Expected: FAIL because `SendScreen` still renders a local warning view instead of `WarningInline`.

- [ ] **Step 3: Import `WarningInline` in SendScreen**

In `src/screens/SendScreen.tsx`, add:

```tsx
import { WarningInline } from '../components/WarningInline';
```

- [ ] **Step 4: Replace the local send warning JSX**

In `src/screens/SendScreen.tsx`, replace:

```tsx
{!sendConfirmationRequired && (
  <View style={styles.sendConfirmationWarning}>
    <Ionicons name="warning-outline" size={16} color={colors.warning} />
    <Text style={styles.sendConfirmationWarningText}>
      Send biometrics are off
    </Text>
  </View>
)}
```

with:

```tsx
{!sendConfirmationRequired && (
  <WarningInline
    text="Send biometrics are off"
    style={styles.sendConfirmationWarning}
    textStyle={styles.sendConfirmationWarningText}
  />
)}
```

- [ ] **Step 5: Reduce the local Send warning styles**

In `src/screens/SendScreen.tsx`, replace the existing `sendConfirmationWarning` and `sendConfirmationWarningText` styles with:

```tsx
sendConfirmationWarning: {
  marginBottom: 12,
},
sendConfirmationWarningText: {
  color: colors.textSecondary,
},
```

- [ ] **Step 6: Run the focused pilot tests**

Run:

```bash
npm test -- --runInBand src/components/__tests__/walletLayoutPrimitives.test.tsx src/screens/__tests__/SettingsScreen.test.tsx src/screens/__tests__/SecurityPrivacyScreen.test.tsx src/screens/__tests__/SendScreen.test.tsx
```

Expected: PASS for the primitive tests and the three migrated screen test files.

- [ ] **Step 7: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 8: Run full Jest**

Run:

```bash
npm test -- --runInBand
```

Expected: PASS for the full Jest suite.

- [ ] **Step 9: Run diff hygiene**

Run:

```bash
git diff --check
```

Expected: PASS with no whitespace errors.

- [ ] **Step 10: Run changed-scope React Doctor**

Run:

```bash
npx -y react-doctor@latest . --verbose --scope changed
```

Expected: PASS or only known pre-existing warnings already documented in the active session. If React Doctor flags new warnings in `AppHeader`, `InfoCard`, `WarningInline`, `SettingsSection`, `SettingsRow`, `SettingsScreen`, `SecurityPrivacyScreen`, or the touched Send warning area, fix those warnings before committing Task 4.

- [ ] **Step 11: Commit Task 4**

Run:

```bash
git add src/screens/SendScreen.tsx src/screens/__tests__/SendScreen.test.tsx
git commit -m "refactor: use shared send warning layout"
```

- [ ] **Step 12: Confirm final repository state**

Run:

```bash
git status --short
```

Expected: no uncommitted files from the layout-system implementation. If unrelated user files appear, leave them untouched and mention them in the closeout.
