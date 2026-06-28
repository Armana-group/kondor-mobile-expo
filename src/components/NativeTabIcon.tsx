import React from 'react';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import semiBold from 'expo-symbols/androidWeights/semiBold';

type NativeTabSymbol = {
  ios: SFSymbol;
  android: AndroidSymbol;
};

type NativeTabIconProps = {
  focused: boolean;
  color: string;
  symbol: NativeTabSymbol;
  size?: number;
};

export const NativeTabIcon = ({
  focused,
  color,
  symbol,
  size = 24,
}: NativeTabIconProps) => (
  <SymbolView
    name={symbol}
    size={size}
    type={focused ? 'hierarchical' : 'monochrome'}
    scale="medium"
    weight={{
      ios: focused ? 'semibold' : 'regular',
      android: semiBold,
    }}
    tintColor={color}
  />
);
