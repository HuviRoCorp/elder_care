// ============================================================================
// Caregiver verification queue — admin side
//
// GET /caregiver/verification-queue, oldest-first. Approve/Reject call the
// same PATCH /caregiver/:id/verification endpoint the module already had —
// no new write path, just a screen to reach it from. Direct action, no
// confirm-step, same pattern as CaregiverBookingsScreen's Confirm/Decline:
// this isn't a delete, and a wrong call is corrected by re-running the
// action the other way.
// ============================================================================

import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listPendingCaregivers, updateCaregiverVerification } from '../api/caregivers';
import { NetworkError } from '../../shared/api/client';
import { colors, spacing, type } from '../../shared/ui/theme';

export function CaregiverVerificationScreen({ navigation }) {
  const [caregivers, setCaregivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { caregivers: list } = await listPendingCaregivers();
      setCaregivers(list);
      setBanner(null);
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof NetworkError ? 'Could not reach the server.' : 'Could not load the verification queue.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleDecision(id, status) {
    setBusyId(id);
    try {
      await updateCaregiverVerification(id, status);
      await load();
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof NetworkError ? 'Could not reach the server. Please try again.' : 'Could not update that caregiver.',
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.backRow}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>Verification Queue</Text>

        {banner && (
          <Pressable onPress={() => setBanner(null)} style={styles.banner}>
            <Text style={styles.bannerText}>{banner.text}</Text>
          </Pressable>
        )}

        {loading && <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />}

        {!loading && caregivers.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No caregivers awaiting verification.</Text>
          </View>
        )}

        {!loading &&
          caregivers.map((c) => (
            <View key={c.id} style={styles.card}>
              <Text style={styles.cardName}>{c.fullName}</Text>
              <Text style={styles.cardMeta}>{c.serviceAreaCity || 'No city listed'}</Text>
              {c.experienceYears != null && (
                <Text style={styles.cardMeta}>{c.experienceYears} years experience</Text>
              )}
              {c.qualifications ? <Text style={styles.cardMeta}>{c.qualifications}</Text> : null}
              {c.specializations.length > 0 && (
                <Text style={styles.cardMeta}>Specializations: {c.specializations.join(', ')}</Text>
              )}
              {c.languages.length > 0 && <Text style={styles.cardMeta}>Languages: {c.languages.join(', ')}</Text>}
              {c.hourlyRate != null && (
                <Text style={styles.cardMeta}>
                  {c.currency} {c.hourlyRate}/hr
                </Text>
              )}

              {busyId === c.id ? (
                <ActivityIndicator color={colors.primary} style={styles.spinner} />
              ) : (
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => handleDecision(c.id, 'rejected')}
                    accessibilityRole="button"
                    style={styles.rejectButton}
                  >
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDecision(c.id, 'verified')}
                    accessibilityRole="button"
                    style={styles.approveButton}
                  >
                    <Text style={styles.approveButtonText}>Approve</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  backRow: { paddingVertical: spacing.xs },
  backText: { fontSize: type.body, color: colors.primary, fontWeight: '700' },
  title: { fontSize: type.title, fontWeight: '900', color: colors.text },
  banner: { borderRadius: 12, padding: spacing.md, borderWidth: 1.5, backgroundColor: '#FEE2E2', borderColor: colors.danger },
  bannerText: { fontSize: type.body - 1, fontWeight: '700', textAlign: 'center', color: colors.danger },
  spinner: { marginVertical: spacing.sm },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
  },
  emptyText: { fontSize: type.body - 1, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  cardName: { fontSize: type.heading, fontWeight: '800', color: colors.text },
  cardMeta: { fontSize: type.body - 1, color: colors.textMuted },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  rejectButton: { flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: colors.danger, paddingVertical: 12, alignItems: 'center' },
  rejectButtonText: { fontSize: type.body - 1, fontWeight: '800', color: colors.danger },
  approveButton: { flex: 1, backgroundColor: colors.success, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  approveButtonText: { fontSize: type.body - 1, fontWeight: '800', color: '#FFFFFF' },
});
