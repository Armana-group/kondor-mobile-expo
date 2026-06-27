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
