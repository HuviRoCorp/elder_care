// ============================================================================
// Visits — elderly and family, shared screen
//
// GET /caregiver/schedules, no params — scoped server-side: elderly sees
// their own, family sees their own plus every active linked elderly user's.
// Same embedded-attendance shape CaregiverScheduleScreen reads, so this
// screen never calls GET /caregiver/attendance separately either.
//
// Verify is elderly-self or family-with-hasManageCaregiversPermission only
// (attendance.routes.js requireAttendanceVerifyPermission) — caregiver is
// excluded there on purpose. The schedule list here is visible to any family
// member with an active link (broader than the verify permission itself,
// which additionally requires can_manage_caregivers = true), and that flag
// isn't part of the embedded schedule row, so a family viewer without it
// can't be told apart from one with it before pressing the button. The
// button is shown to any elderly or family viewer of a checked-out visit;
// a family member who lacks the permission gets a clear 403 message instead
// of the button silently doing nothing.
//
// Verified state is not persisted client-side across a reload: the schedule
// embed carries attendanceStatus/checkInAt/checkOutAt but not
// verified_by_family, so there is nothing to read that state back from
// without a second GET per row. A successful Verify flips that row to
// "Verified" for this screen session only (local component state); a fresh
// load shows "Verify" again, and re-pressing it is harmless — the backend
// PATCH just re-sets the same flag to TRUE. Flagged in BUILD_LOG.md rather
// than adding the extra per-row fetch this task asked to avoid.
// ============================================================================

import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listSchedules } from '../api/schedules';
import { verifyAttendance } from '../api/attendance';
import { ApiError, NetworkError } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthContext';
import { colors, spacing, type } from '../../shared/ui/theme';
import { formatDate } from '../bookingFormat';
import { attendanceStatusLabel, formatTime, computeDurationMinutes, formatDuration } from '../scheduleFormat';

export function VisitsScreen({ navigation }) {
  const { user } = useAuth();

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [verifiedIds, setVerifiedIds] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { schedules: list } = await listSchedules();
      setSchedules(list);
      setBanner(null);
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof NetworkError ? 'Could not reach the server.' : 'Could not load visits.',
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

  async function handleVerify(schedule) {
    setBusyId(schedule.id);
    try {
      await verifyAttendance(schedule.attendanceId);
      setVerifiedIds((prev) => new Set(prev).add(schedule.id));
      setBanner(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setBanner({ kind: 'error', text: "You don't have permission to verify visits for this elderly user." });
      } else {
        setBanner({
          kind: 'error',
          text: err instanceof NetworkError ? 'Could not reach the server. Please try again.' : 'Could not verify that visit.',
        });
      }
    } finally {
      setBusyId(null);
    }
  }

  const canVerify = user.role === 'elderly' || user.role === 'family';

  const upcoming = schedules.filter((s) => s.status === 'scheduled');
  const past = schedules.filter((s) => s.status !== 'scheduled');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.backRow}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>Visits</Text>

        {banner && (
          <Pressable onPress={() => setBanner(null)} style={styles.banner}>
            <Text style={styles.bannerText}>{banner.text}</Text>
          </Pressable>
        )}

        {loading && <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />}

        {!loading && (
          <>
            <Text style={styles.sectionHeading}>Upcoming</Text>
            {upcoming.length === 0 && <EmptyCard text="No upcoming visits." />}
            {upcoming.map((s) => (
              <VisitCard
                key={s.id}
                schedule={s}
                busy={busyId === s.id}
                canVerify={canVerify}
                verified={verifiedIds.has(s.id)}
                onVerify={() => handleVerify(s)}
                onViewTasks={() =>
                  navigation.navigate('ScheduleTasks', {
                    scheduleId: s.id,
                    elderlyUserId: s.elderlyUserId,
                    elderlyName: s.elderlyName,
                    caregiverId: s.caregiverId,
                  })
                }
                onViewReport={() =>
                  navigation.navigate('Report', {
                    elderlyUserId: s.elderlyUserId,
                    caregiverId: s.caregiverId,
                    elderlyName: s.elderlyName,
                    caregiverName: s.caregiverName,
                    visitDate: s.visitDate,
                  })
                }
              />
            ))}

            <Text style={styles.sectionHeading}>Past</Text>
            {past.length === 0 && <EmptyCard text="No past visits yet." />}
            {past.map((s) => (
              <VisitCard
                key={s.id}
                schedule={s}
                busy={busyId === s.id}
                canVerify={canVerify}
                verified={verifiedIds.has(s.id)}
                onVerify={() => handleVerify(s)}
                onViewTasks={() =>
                  navigation.navigate('ScheduleTasks', {
                    scheduleId: s.id,
                    elderlyUserId: s.elderlyUserId,
                    elderlyName: s.elderlyName,
                    caregiverId: s.caregiverId,
                  })
                }
                onViewReport={() =>
                  navigation.navigate('Report', {
                    elderlyUserId: s.elderlyUserId,
                    caregiverId: s.caregiverId,
                    elderlyName: s.elderlyName,
                    caregiverName: s.caregiverName,
                    visitDate: s.visitDate,
                  })
                }
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyCard({ text }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function VisitCard({ schedule, busy, canVerify, verified, onVerify, onViewTasks, onViewReport }) {
  const checkedOut = !!schedule.checkOutAt;
  const duration = checkedOut ? computeDurationMinutes(schedule.checkInAt, schedule.checkOutAt) : null;
  const showVerify = canVerify && checkedOut && !verified;

  return (
    <View style={styles.card}>
      <Text style={styles.cardName}>{schedule.caregiverName}</Text>
      <Text style={styles.cardMeta}>
        {formatDate(schedule.visitDate)} · {formatTime(schedule.startTime)} – {formatTime(schedule.endTime)}
      </Text>
      <Text style={styles.cardMeta}>{attendanceStatusLabel(schedule.attendanceStatus)}</Text>
      {checkedOut && duration != null && <Text style={styles.cardMeta}>Duration: {formatDuration(duration)}</Text>}
      {verified && <Text style={styles.verifiedText}>✓ Verified</Text>}

      <View style={styles.linkRow}>
        <Pressable onPress={onViewTasks} accessibilityRole="button" style={styles.taskLink}>
          <Text style={styles.taskLinkText}>Tasks</Text>
        </Pressable>
        {checkedOut && (
          <Pressable onPress={onViewReport} accessibilityRole="button" style={styles.taskLink}>
            <Text style={styles.taskLinkText}>Activity Report</Text>
          </Pressable>
        )}
      </View>

      {busy && <ActivityIndicator color={colors.primary} style={styles.spinner} />}

      {!busy && showVerify && (
        <Pressable onPress={onVerify} accessibilityRole="button" style={styles.verifyButton}>
          <Text style={styles.verifyButtonText}>Verify This Visit Happened</Text>
        </Pressable>
      )}
    </View>
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
  sectionHeading: { fontSize: type.heading, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, padding: spacing.md },
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
  verifiedText: { fontSize: type.body - 1, fontWeight: '800', color: colors.success, marginTop: 4 },
  linkRow: { flexDirection: 'row', gap: spacing.md },
  taskLink: { paddingVertical: 4 },
  taskLinkText: { fontSize: type.small + 1, fontWeight: '700', color: colors.primary },
  verifyButton: { backgroundColor: colors.success, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: spacing.sm },
  verifyButtonText: { fontSize: type.body - 1, fontWeight: '800', color: '#FFFFFF' },
});
