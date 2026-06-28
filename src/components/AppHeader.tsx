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
import { NativeMaterialSurface } from './NativeMaterialSurface';
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
  <NativeMaterialSurface
    variant="header"
    style={[styles.headerChrome, style]}
    testID="app-header"
  >
    <View style={styles.headerContent}>
      <Pressable
        style={({ pressed }) => [styles.sideButton, pressed ? styles.pressed : null]}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={backAccessibilityLabel}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={layout.header.iconSize} color={colors.purple} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.title, styles.titleFlexible]}>
        {title}
      </Text>
      <View style={styles.sideButton}>{rightAccessory}</View>
    </View>
  </NativeMaterialSurface>
);

const styles = StyleSheet.create({
  headerChrome: {
    marginHorizontal: layout.header.horizontalPadding,
    marginTop: layout.header.topPadding,
    marginBottom: layout.header.bottomPadding,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 4,
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
  titleFlexible: {
    flex: 1,
    flexShrink: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  pressed: {
    opacity: 0.65,
  },
});
