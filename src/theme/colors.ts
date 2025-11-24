/**
 * Kondor 2 Design System Colors
 * Matching the Chrome extension for visual continuity
 */

export const colors = {
  // Backgrounds
  background: '#111111',      // Slightly lighter black
  card: '#1A1A1A',            // Card backgrounds
  elevated: '#272727',        // neutral-800 - Elevated surfaces, hover states
  border: '#404040',          // neutral-700 - Borders, dividers

  // Text
  textPrimary: '#FFFFFF',     // white - Primary text
  textSecondary: '#A3A3A3',   // neutral-400 - Secondary text
  textTertiary: '#737373',    // neutral-500 - Tertiary text
  textMuted: '#525252',       // neutral-600 - Muted text

  // Accent
  purple: '#A855F7',          // purple-500 - Active indicators, accents
  purpleLight: 'rgba(168, 85, 247, 0.2)', // purple-500/20 - Background accents

  // Status
  success: '#22C55E',         // green-500
  error: '#EF4444',           // red-500
  warning: '#F59E0B',         // amber-500

  // Legacy (for gradual migration)
  primary: '#A855F7',         // Main accent color
  secondary: '#272727',       // Secondary backgrounds
};

// Semantic color mappings
export const semanticColors = {
  // Navigation
  tabActive: colors.purple,
  tabInactive: colors.textSecondary,

  // Transactions
  sent: colors.error,
  received: colors.success,

  // Mana bar
  manaLow: colors.error,
  manaMedium: colors.warning,
  manaHigh: colors.success,

  // Buttons
  buttonPrimary: colors.purple,
  buttonSecondary: colors.elevated,
  buttonDestructive: colors.error,
};

// Spacing (matching Tailwind defaults)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
};

// Border radius
export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export default colors;
