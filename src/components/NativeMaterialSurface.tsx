import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { BlurView, type BlurTint } from 'expo-blur';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type GlassStyle,
} from 'expo-glass-effect';
import colors, { borderRadius } from '../theme/colors';
import {
  resolveNativeMaterialMode,
  type NativeMaterialChoice,
  type NativeMaterialVariant,
} from './nativeMaterial';

type NativeMaterialSurfaceProps = ViewProps & {
  children?: React.ReactNode;
  material?: NativeMaterialChoice;
  variant?: NativeMaterialVariant;
  style?: StyleProp<ViewStyle>;
};

type MaterialVariantConfig = {
  glassEffectStyle: GlassStyle;
  tintColor: string;
  blurIntensity: number;
  blurTint: BlurTint;
};

const VARIANT_CONFIG: Record<NativeMaterialVariant, MaterialVariantConfig> = {
  card: {
    glassEffectStyle: 'regular',
    tintColor: 'rgba(34, 34, 38, 0.64)',
    blurIntensity: 46,
    blurTint: 'systemMaterialDark',
  },
  header: {
    glassEffectStyle: 'regular',
    tintColor: 'rgba(28, 28, 30, 0.58)',
    blurIntensity: 36,
    blurTint: 'systemThinMaterialDark',
  },
  tabBar: {
    glassEffectStyle: 'regular',
    tintColor: 'rgba(24, 24, 26, 0.74)',
    blurIntensity: 74,
    blurTint: 'systemChromeMaterialDark',
  },
  compact: {
    glassEffectStyle: 'regular',
    tintColor: 'rgba(39, 39, 42, 0.58)',
    blurIntensity: 38,
    blurTint: 'systemThinMaterialDark',
  },
};

function readGlassAvailability() {
  try {
    return {
      isGlassEffectAPIAvailable: isGlassEffectAPIAvailable(),
      isLiquidGlassAvailable: isLiquidGlassAvailable(),
    };
  } catch {
    return {
      isGlassEffectAPIAvailable: false,
      isLiquidGlassAvailable: false,
    };
  }
}

export const NativeMaterialSurface = ({
  children,
  material = 'auto',
  variant = 'card',
  style,
  ...viewProps
}: NativeMaterialSurfaceProps) => {
  const config = VARIANT_CONFIG[variant];
  const materialMode = material === 'auto'
    ? resolveNativeMaterialMode({
      platform: Platform.OS,
      ...readGlassAvailability(),
    })
    : material;
  const surfaceStyle = [styles.surface, styles[variant], style];

  if (materialMode === 'glass') {
    return (
      <GlassView
        {...viewProps}
        glassEffectStyle={config.glassEffectStyle}
        tintColor={config.tintColor}
        colorScheme="dark"
        style={surfaceStyle}
      >
        {children}
      </GlassView>
    );
  }

  if (materialMode === 'blur') {
    return (
      <BlurView
        {...viewProps}
        intensity={config.blurIntensity}
        tint={config.blurTint}
        style={surfaceStyle}
      >
        {children}
      </BlurView>
    );
  }

  return (
    <View {...viewProps} style={surfaceStyle}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  surface: {
    overflow: 'hidden',
    backgroundColor: colors.glassFallback,
    borderColor: colors.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: {
    borderRadius: borderRadius.xl,
  },
  header: {
    borderRadius: borderRadius.full,
  },
  tabBar: {
    borderRadius: borderRadius.full,
  },
  compact: {
    borderRadius: borderRadius.lg,
  },
});
