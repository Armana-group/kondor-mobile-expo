import React from 'react';
import { StyleSheet } from 'react-native';
import type {
  BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { NativeMaterialSurface } from '../components/NativeMaterialSurface';
import { NativeTabIcon } from '../components/NativeTabIcon';
import colors from '../theme/colors';

type NativeTabSymbol = React.ComponentProps<typeof NativeTabIcon>['symbol'];
type TabBarIconRenderProps = {
  focused: boolean;
  color: string;
  size: number;
};

export const TAB_BAR_SYMBOLS = {
  home: {
    ios: 'house.fill',
    android: 'home_filled',
  },
  collectibles: {
    ios: 'square.grid.2x2.fill',
    android: 'grid_view',
  },
  swap: {
    ios: 'arrow.left.arrow.right',
    android: 'swap_horiz',
  },
  apps: {
    ios: 'circle.grid.3x3.fill',
    android: 'apps',
  },
} satisfies Record<string, NativeTabSymbol>;

export function createTabBarIcon(symbol: NativeTabSymbol) {
  return ({ focused, color }: TabBarIconRenderProps) => (
    <NativeTabIcon focused={focused} color={color} symbol={symbol} />
  );
}

export function getTabNavigatorScreenOptions(): BottomTabNavigationOptions {
  return {
    headerShown: false,
    tabBarStyle: styles.tabBar,
    tabBarBackground: () => (
      <NativeMaterialSurface
        pointerEvents="none"
        variant="tabBar"
        style={styles.tabBarBackground}
        testID="native-tab-bar-background"
      />
    ),
    tabBarActiveTintColor: colors.purple,
    tabBarInactiveTintColor: colors.textTertiary,
    tabBarLabelStyle: styles.tabBarLabel,
    tabBarHideOnKeyboard: true,
  };
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 18,
    height: 68,
    paddingTop: 7,
    paddingBottom: 9,
    borderTopWidth: 0,
    borderRadius: 34,
    backgroundColor: 'transparent',
    boxShadow: '0px 12px 22px rgba(0, 0, 0, 0.18)',
  },
  tabBarBackground: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 0,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});
