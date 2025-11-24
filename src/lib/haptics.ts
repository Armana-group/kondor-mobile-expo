import * as Haptics from 'expo-haptics';

/**
 * Haptic feedback utilities for Kondor Mobile
 * Provides consistent haptic patterns across the app
 */

export const HapticFeedback = {
  // Success feedback - for successful operations
  success: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  // Error feedback - for failed operations
  error: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },

  // Warning feedback - for important alerts
  warning: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },

  // Light impact - for button presses
  light: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  // Medium impact - for toggle switches
  medium: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },

  // Heavy impact - for significant actions
  heavy: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },

  // Selection changed - for picker/selector changes
  selection: async () => {
    await Haptics.selectionAsync();
  },

  // Transaction feedback patterns
  transactionSent: async () => {
    // Custom pattern for sending transactions
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 200);
  },

  transactionFailed: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },

  // Wallet operation patterns
  walletCreated: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  walletLocked: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },

  walletUnlocked: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  // Authentication patterns
  authSuccess: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  authFailed: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
};

// Hook for using haptic feedback in components
export const useHapticFeedback = () => {
  return HapticFeedback;
};