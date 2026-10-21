// ============================================================================
// Care Plan — view
//
// Shared by every viewer role. GET /caregiver/care-plans/elderly/:id is
// scoped server-side (care-plans.routes.js requireCarePlanReadPermission):
// the elderly user themselves, a family member with
// hasManageCaregiversPermission, or a caregiver with a real assignment to
// this elderly user (a confirmed/active/completed booking, or a schedule).
//
// There is no read-only family tier — the same flag that grants a family
// member read access grants write access too, so any family/elderly/admin
// viewer who successfully loads this screen can also edit. The only viewer
// who is genuinely locked out of editing is a caregiver: PATCH/POST both
// exclude that role at the route's requireRole gate, not just at the
// permission-function level. canEdit below reflects that exactly — no
// separate view-vs-edit distinction exists to check for family/elderly.
// A proper view-only tier is a real product question, not built here — see
// BUILD_LOG.md.
//
// Allergies and medications render in a highlighted block above everything
// else — what someone arriving for a visit needs first, not item N in a
// scroll of fields.
// ============================================================================

import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listCarePlansForElderly } from '../api/carePlans';
import { NetworkError } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthContext';
import { colors, spacing, type } from '../../shared/ui/theme';
import { formatDate } from '../bookingFormat';
import { carePlanStatusLabel, pickCurrentCarePlan } from '../carePlanFormat';

export function CarePlanScreen({ navigation, route }) {
  const { user } = useAuth();
  const elderlyUserId = route.params?.elderlyUserId || user.id;
  const elderlyName = route.params?.elderlyName || (elderlyUserId === user.id ? user.fullName : null);

  const [carePlans, setCarePlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { carePlans: list } = await listCarePlansForElderly(elderlyUserId);
      setCarePlans(list);
      setBanner(null);
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof NetworkError ? 'Could not reach the server.' : "Could not load this care plan.",
      });
    } finally {
      setLoading(false);
    }
  }, [elderlyUserId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const canEdit = user.role !== 'caregiver';
  const plan = pickCurrentCarePlan(carePlans);
  const otherPlansCount = carePlans.length - (plan ? 1 : 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.backRow}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Care Plan{elderlyName ? ` — ${elderlyName}` : ''}</Text>
          {!canEdit && (
            <View style={styles.readOnlyBadge}>
              <Text style={styles.readOnlyBadgeText}>View only</Text>
            </View>
          )}
        </View>

        {banner && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{banner.text}</Text>
          </View>
        )}

        {loading && <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />}

        {!loading && !plan && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No care plan on file yet.</Text>
            {canEdit && (
              <Pressable
                onPress={() => navigation.navigate('CarePlanForm', { elderlyUserId, elderlyName, carePlan: null })}
                accessibilityRole="button"
                style={styles.editButton}
              >
                <Text style={styles.editButtonText}>Create Care Plan</Text>
              </Pressable>
            )}
          </View>
        )}

        {!loading && plan && (
          <>
            <View style={styles.alertCard}>
              <Text style={styles.alertHeading}>⚠ Allergies</Text>
              <Text style={styles.alertText}>{plan.allergies || 'None recorded'}</Text>
              <View style={styles.alertDivider} />
              <Text style={styles.alertHeading}>💊 Current Medications</Text>
              <Text style={styles.alertText}>{plan.medications || 'None recorded'}</Text>
            </View>

            <View style={styles.card}>
              <Row label="Status" value={carePlanStatusLabel(plan.status)} />
              {plan.startDate ? <Row label="Start" value={formatDate(plan.startDate)} /> : null}
              {plan.endDate ? <Row label="End" value={formatDate(plan.endDate)} /> : null}
            </View>

            {plan.medicalConditions ? (
              <InfoCard heading="Medical Conditions" text={plan.medicalConditions} />
            ) : null}
            {plan.mobilityNotes ? <InfoCard heading="Mobility Notes" text={plan.mobilityNotes} /> : null}
            {plan.dietaryNotes ? <InfoCard heading="Dietary Notes" text={plan.dietaryNotes} /> : null}
            {plan.emergencyInstructions ? (
              <InfoCard heading="Emergency Instructions" text={plan.emergencyInstructions} />
            ) : null}
            {plan.description ? <InfoCard heading="Notes" text={plan.description} /> : null}

            {otherPlansCount > 0 && (
              <Text style={styles.otherPlansText}>
                {otherPlansCount} other care plan record{otherPlansCount === 1 ? '' : 's'} on file for this account.
              </Text>
            )}

            {canEdit && (
              <Pressable
                onPress={() => navigation.navigate('CarePlanForm', { elderlyUserId, elderlyName, carePlan: plan })}
                accessibilityRole="button"
                style={styles.editButton}
              >
                <Text style={styles.editButtonText}>Edit Care Plan</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function InfoCard({ heading, text }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardHeading}>{heading}</Text>
      <Text style={styles.cardText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  backRow: { paddingVertical: spacing.xs },
  backText: { fontSize: type.body, color: colors.primary, fontWeight: '700' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontSize: type.title, fontWeight: '900', color: colors.text, flexShrink: 1 },
  readOnlyBadge: { backgroundColor: colors.border, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  readOnlyBadgeText: { fontSize: type.small, fontWeight: '800', color: colors.textMuted },
  banner: { borderRadius: 12, padding: spacing.md, borderWidth: 1.5, backgroundColor: '#FEE2E2', borderColor: colors.danger },
  bannerText: { fontSize: type.body - 1, fontWeight: '700', textAlign: 'center', color: colors.danger },
  spinner: { marginVertical: spacing.xl },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyText: { fontSize: type.body, color: colors.textMuted, lineHeight: 23 },
  alertCard: {
    backgroundColor: colors.warningBg,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.warning,
    padding: spacing.md,
    gap: 4,
  },
  alertHeading: { fontSize: type.body - 1, fontWeight: '900', color: colors.warning },
  alertText: { fontSize: type.body, color: colors.text, lineHeight: 23, marginBottom: 4 },
  alertDivider: { height: 1, backgroundColor: colors.warning, opacity: 0.3, marginVertical: spacing.xs },
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
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { fontSize: type.body - 1, color: colors.textMuted, fontWeight: '600' },
  rowValue: { fontSize: type.body - 1, color: colors.text, fontWeight: '700' },
  otherPlansText: { fontSize: type.small, color: colors.textMuted, textAlign: 'center' },
  editButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  editButtonText: { fontSize: type.body, fontWeight: '800', color: '#FFFFFF' },
});
