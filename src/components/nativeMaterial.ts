import type { PlatformOSType } from 'react-native';

export type NativeMaterialMode = 'glass' | 'blur' | 'solid';
export type NativeMaterialChoice = NativeMaterialMode | 'auto';
export type NativeMaterialVariant = 'card' | 'header' | 'tabBar' | 'compact';

type ResolveNativeMaterialModeParams = {
  platform: PlatformOSType;
  isGlassEffectAPIAvailable: boolean;
  isLiquidGlassAvailable: boolean;
};

export function resolveNativeMaterialMode({
  platform,
  isGlassEffectAPIAvailable: glassApiAvailable,
  isLiquidGlassAvailable: liquidGlassAvailable,
}: ResolveNativeMaterialModeParams): NativeMaterialMode {
  if (platform !== 'ios') {
    return 'solid';
  }

  return glassApiAvailable && liquidGlassAvailable ? 'glass' : 'blur';
}
