import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { NativeMaterialSurface } from './NativeMaterialSurface';
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
  <NativeMaterialSurface variant="card" style={[styles.card, style]} testID={testID}>
    <Text style={styles.title}>{title}</Text>
    {body ? <Text style={styles.body}>{body}</Text> : null}
    {children ? <View style={styles.children}>{children}</View> : null}
  </NativeMaterialSurface>
);

const styles = StyleSheet.create({
  card: {
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
