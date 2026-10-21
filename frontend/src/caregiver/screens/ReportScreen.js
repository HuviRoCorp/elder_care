// ============================================================================
// Activity Report — read view, shared by every viewer role
//
// GET /caregiver/reports has no scheduleId filter, so "the report for this
// visit" is resolved the same way the backend's own uq_report_per_day
// constraint does: caregiverId + elderlyUserId + the visit's date. Fetched
// only when this screen is opened (from a visit row's link, or redirected
// here after a 409 duplicate_report on the create form) — not prefetched
// for every row on the list screens that link here, which would be an
// avoidable per-row fetch.
//
// Read-only — there is no PATCH/DELETE for activity_reports at all, so
// there's no edit control to build or hide here regardless of viewer role.
// ============================================================================

import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listActivityReports } from '../api/reports';
import { NetworkError } from '../../shared/api/client';
import { colors, spacing, type } from '../../shared/ui/theme';
import { formatDate } from '../bookingFormat';

export function ReportScreen({ navigation, route }) {
  const { elderlyUserId, caregiverId, elderlyName, caregiverName, visitDate } = route.params;

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { reports } = await listActivityReports({
        elderlyUserId,
        caregiverId,
        startDate: visitDate,
        endDate: visitDate,
      });
      setReport(reports[0] ?? null);
      setBanner(null);
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof NetworkError ? 'Could not reach the server.' : 'Could not load this report.',
      });
    } finally {
      setLoading(false);
    }
  }, [elderlyUserId, caregiverId, visitDate]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.backRow}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>Activity Report</Text>
        <Text style={styles.subtitle}>
          {caregiverName ? `${caregiverName} — ` : ''}
          {formatDate(visitDate)}
        </Text>

        {banner && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{banner.text}</Text>
          </View>
        )}

        {loading && <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />}

        {!loading && !report && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No activity report was logged for this visit yet.</Text>
          </View>
        )}

        {!loading && report && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardHeading}>Summary</Text>
              <Text style={styles.cardText}>{report.summary}</Text>
            </View>

            {report.mealsTaken ? <InfoRow label="Meals Taken" value={report.mealsTaken} /> : null}
            {report.medicationsGiven ? <InfoRow label="Medications Given" value={report.medicationsGiven} /> : null}
            {report.mood ? <InfoRow label="Mood" value={report.mood} /> : null}
            {report.sleepHours != null ? <InfoRow label="Sleep" value={`${report.sleepHours} hours`} /> : null}
            {report.concerns ? (
              <View style={styles.concernCard}>
                <Text style={styles.concernHeading}>⚠ Concerns</Text>
                <Text style={styles.concernText}>{report.concerns}</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardHeading}>{label}</Text>
      <Text style={styles.cardText}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  backRow: { paddingVertical: spacing.xs },
  backText: { fontSize: type.body, color: colors.primary, fontWeight: '700' },
  title: { fontSize: type.title, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: type.body, color: colors.textMuted },
  banner: { borderRadius: 12, padding: spacing.md, borderWidth: 1.5, backgroundColor: '#FEE2E2', borderColor: colors.danger },
  bannerText: { fontSize: type.body - 1, fontWeight: '700', textAlign: 'center', color: colors.danger },
  spinner: { marginVertical: spacing.xl },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, padding: spacing.lg },
  emptyText: { fontSize: type.body, color: colors.textMuted, lineHeight: 23 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeading: { fontSize: type.body - 1, fontWeight: '800', color: colors.text },
  cardText: { fontSize: type.body - 1, color: colors.text, lineHeight: 22 },
  concernCard: {
    backgroundColor: colors.warningBg,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.warning,
    padding: spacing.md,
    gap: spacing.sm,
  },
  concernHeading: { fontSize: type.body - 1, fontWeight: '900', color: colors.warning },
  concernText: { fontSize: type.body - 1, color: colors.text, lineHeight: 22 },
});
