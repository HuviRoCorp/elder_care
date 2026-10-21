// Shown while stored tokens are being read and confirmed on launch. Without it
// a returning user sees the login screen flash before being replaced by their
// home screen.

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '../ui/theme';

export function LoadingScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.label}>ElderCare</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  label: { fontSize: type.heading, color: colors.textMuted },
});
