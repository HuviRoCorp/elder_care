// ============================================================================
// Placeholder home screen
//
// Every role's home screen is this component with different words. It exists to
// make routing testable: sign in as an elderly user and you should land on the
// elderly screen, not the family one. It also prints the signed-in user and the
// backend's health, which between them prove the whole shell works — storage,
// token, request, and the role that drove the routing.
//
// Each of these gets replaced by a real screen in Phases 1, 2 and 5. Nothing
// here is meant to survive.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { health } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { API_URL } from '../config';
import { colors, spacing, type } from './theme';

export function PlaceholderScreen({ title, subtitle, comingSoon = [], actions = [] }) {
  const { user, signOut } = useAuth();
  const [backend, setBackend] = useState({ state: 'checking' });

  const checkBackend = useCallback(async () => {
    setBackend({ state: 'checking' });
    try {
      const result = await health();
      setBackend({ state: 'up', database: result.db?.database, latency: result.db?.latencyMs });
    } catch (err) {
      setBackend({ state: 'down', message: err.message });
    }
  }, []);

  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.card}>
          <Text style={styles.cardHeading}>Signed in as</Text>
          <Row label="Name" value={user?.fullName} />
          <Row label="Role" value={user?.role} />
          <Row label="Phone" value={user?.phone} />
          <Row label="Email" value={user?.email ?? 'none'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeading}>Backend</Text>
          <Row label="Address" value={API_URL} />
          {backend.state === 'checking' && <ActivityIndicator style={styles.spinner} />}
          {backend.state === 'up' && (
            <Row label="Status" value={`reachable — ${backend.database}, ${backend.latency}ms`} tone="success" />
          )}
          {backend.state === 'down' && <Row label="Status" value={backend.message} tone="danger" />}

          <Pressable style={styles.secondaryButton} onPress={checkBackend}>
            <Text style={styles.secondaryButtonText}>Check again</Text>
          </Pressable>
        </View>

        {actions.length > 0 && (
          <View style={styles.card}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                style={styles.actionButton}
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Text style={styles.actionButtonText}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {comingSoon.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Coming in later phases</Text>
            {comingSoon.map((item) => (
              <Text key={item} style={styles.listItem}>
                • {item}
              </Text>
            ))}
          </View>
        )}

        <Pressable style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, tone }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          tone === 'success' && { color: colors.success },
          tone === 'danger' && { color: colors.danger },
        ]}
      >
        {value ?? '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  title: { fontSize: type.title, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: type.body, color: colors.textMuted, marginTop: -spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeading: { fontSize: type.small, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { fontSize: type.body, color: colors.textMuted },
  rowValue: { fontSize: type.body, color: colors.text, flexShrink: 1, textAlign: 'right' },
  listItem: { fontSize: type.body, color: colors.text },
  spinner: { alignSelf: 'flex-start' },
  secondaryButton: { paddingVertical: spacing.sm },
  secondaryButtonText: { fontSize: type.body, color: colors.primary, fontWeight: '600' },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  actionButtonText: { fontSize: type.body, fontWeight: '700', color: '#FFFFFF' },
  signOutButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  signOutText: { fontSize: type.body, color: colors.danger, fontWeight: '600' },
});
