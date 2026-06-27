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
