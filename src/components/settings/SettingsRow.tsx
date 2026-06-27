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
  const separatorInset = icon ? layout.separator.insetWithIcon : 0;

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
      {showSeparator ? (
        <View
          style={[styles.separator, { marginLeft: separatorInset }]}
          testID={testID ? `${testID}-separator` : `settings-row-separator-${label}`}
        />
      ) : null}
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
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.6,
  },
});
