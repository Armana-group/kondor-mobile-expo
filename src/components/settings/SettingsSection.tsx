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
