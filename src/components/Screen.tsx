import React from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView, type Edges } from 'react-native-safe-area-context';
import colors from '../theme/colors';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  keyboardAvoiding?: boolean;
  safeAreaEdges?: Edges;
}

export const Screen: React.FC<ScreenProps> = ({
  children,
  scroll = true,
  style,
  contentContainerStyle,
  keyboardAvoiding = true,
  safeAreaEdges,
}) => {
  const content = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.scrollContent,
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.container, style]}>
      {children}
    </View>
  );

  if (keyboardAvoiding) {
    return (
      <SafeAreaView style={styles.safeArea} edges={safeAreaEdges}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {content}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, style]} edges={safeAreaEdges}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      {content}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
