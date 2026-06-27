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
