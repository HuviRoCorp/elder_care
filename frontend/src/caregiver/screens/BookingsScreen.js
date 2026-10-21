// ============================================================================
// My Bookings — elderly and family, shared screen
//
// GET /caregiver/bookings needs no elderlyUserId param — listBookingsForUser
// (bookings.service.js) already scopes server-side: an elderly caller sees
// their own, a family caller sees everything they booked plus every active
// linked elderly user's bookings. That second half is exactly why Cancel
// can't just be "show it on every row" here — a family member sees bookings
// they didn't make (the elderly user's own, or another family member's).
//
// PATCH /caregiver/bookings/:id/status permits cancelling to the elderly
// owner, the original booker, the assigned caregiver, or admin — not every
// linked family member. Mirrored client-side rather than letting a 403
// surface: Cancel only renders when the signed-in user is the elderly owner
// (elderly caller) or the one who made this specific booking (family
// caller). A family member viewing a booking someone else made — the
// elderly user themselves, or another relative — sees no Cancel button.
// ============================================================================

import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listBookings, updateBookingStatus } from '../api/bookings';
import { NetworkError } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthContext';
import { colors, spacing, type } from '../../shared/ui/theme';
import { bookingStatusLabel, recurrenceLabel, formatDate } from '../bookingFormat';

const CANCELLABLE_STATUSES = ['requested', 'confirmed', 'active'];

export function BookingsScreen({ navigation }) {
  const { user } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [confirmCancelId, setConfirmCancelId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { bookings: list } = await listBookings();
      setBookings(list);
      setBanner(null);
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof NetworkError ? 'Could not reach the server.' : 'Could not load your bookings.',
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

  function canCancel(booking) {
    if (!CANCELLABLE_STATUSES.includes(booking.status)) return false;
    if (user.role === 'elderly') return booking.elderlyUserId === user.id;
    return booking.bookedByUserId === user.id;
  }

  // Scheduling is only offered from a confirmed booking — createSchedule
  // (backend) does not itself check the booking's status, so this is the
  // gate. Ownership mirrors canCancel: conservative, hides rather than
  // risking a 403 for a family viewer who isn't the one who booked it.
  function canSchedule(booking) {
    if (booking.status !== 'confirmed') return false;
    if (user.role === 'elderly') return booking.elderlyUserId === user.id;
    return booking.bookedByUserId === user.id;
  }

  // Reviewing mirrors the same conservative ownership check — createReview
  // (backend) also permits a manage-tier family member regardless of who
  // booked it, but that flag isn't checkable client-side any more than it is
  // for care plans or scheduling, so this stays the same hide-if-uncertain
  // rule as canCancel/canSchedule rather than over-showing the button.
  function canReview(booking) {
    if (booking.status !== 'completed') return false;
    if (user.role === 'elderly') return booking.elderlyUserId === user.id;
    return booking.bookedByUserId === user.id;
  }

  async function handleCancel(id) {
    setBusyId(id);
    try {
      await updateBookingStatus(id, { status: 'cancelled' });
      setConfirmCancelId(null);
      await load();
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof NetworkError ? 'Could not reach the server. Please try again.' : 'Could not cancel that booking.',
      });
    } finally {
      setBusyId(null);
    }
  }

  const requests = bookings.filter((b) => b.status === 'requested');
  const upcoming = bookings.filter((b) => b.status === 'confirmed' || b.status === 'active');
  const past = bookings.filter((b) => ['completed', 'cancelled', 'rejected'].includes(b.status));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.backRow}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>My Bookings</Text>

        {banner && (
          <Pressable onPress={() => setBanner(null)} style={[styles.banner, styles.bannerError]}>
            <Text style={[styles.bannerText, styles.bannerTextError]}>{banner.text}</Text>
          </Pressable>
        )}

        {loading && <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />}

        {!loading && bookings.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No bookings yet.</Text>
          </View>
        )}

        {!loading && requests.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Requests</Text>
            {requests.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                busy={busyId === b.id}
                canCancel={canCancel(b)}
                confirming={confirmCancelId === b.id}
                onRequestCancel={() => setConfirmCancelId(b.id)}
                onBackOut={() => setConfirmCancelId(null)}
                onConfirmCancel={() => handleCancel(b.id)}
              />
            ))}
          </>
        )}

        {!loading && upcoming.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Upcoming</Text>
            {upcoming.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                busy={busyId === b.id}
                canCancel={canCancel(b)}
                canSchedule={canSchedule(b)}
                confirming={confirmCancelId === b.id}
                onRequestCancel={() => setConfirmCancelId(b.id)}
                onBackOut={() => setConfirmCancelId(null)}
                onConfirmCancel={() => handleCancel(b.id)}
                onSchedule={() =>
                  navigation.navigate('ScheduleVisit', {
                    bookingId: b.id,
                    caregiverId: b.caregiverId,
                    caregiverName: b.caregiverName,
                    elderlyUserId: b.elderlyUserId,
                    elderlyName: b.elderlyName,
                  })
                }
              />
            ))}
          </>
        )}

        {!loading && past.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Past</Text>
            {past.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                busy={false}
                canCancel={false}
                canSchedule={false}
                canReview={canReview(b)}
                confirming={false}
                onReview={() =>
                  navigation.navigate('ReviewForm', {
                    bookingId: b.id,
                    caregiverId: b.caregiverId,
                    caregiverName: b.caregiverName,
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

function BookingRow({
  booking,
  busy,
  canCancel,
  canSchedule,
  canReview,
  confirming,
  onRequestCancel,
  onBackOut,
  onConfirmCancel,
  onSchedule,
  onReview,
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardName}>{booking.caregiverName}</Text>
      <Text style={styles.cardMeta}>{bookingStatusLabel(booking.status)}</Text>
      <Text style={styles.cardMeta}>
        {formatDate(booking.startDate)}
        {booking.endDate ? ` – ${formatDate(booking.endDate)}` : ''} · {recurrenceLabel(booking.recurrence)}
      </Text>
      {booking.hoursPerVisit ? <Text style={styles.cardMeta}>{booking.hoursPerVisit} hours per visit</Text> : null}

      {busy && <ActivityIndicator color={colors.danger} style={styles.spinner} />}

      {!busy && canSchedule && !confirming && (
        <Pressable onPress={onSchedule} accessibilityRole="button" style={styles.scheduleButton}>
          <Text style={styles.scheduleButtonText}>Schedule Visit</Text>
        </Pressable>
      )}

      {!busy && canReview && (
        <Pressable onPress={onReview} accessibilityRole="button" style={styles.reviewButton}>
          <Text style={styles.reviewButtonText}>Leave a Review</Text>
        </Pressable>
      )}

      {!busy && canCancel && !confirming && (
        <Pressable onPress={onRequestCancel} accessibilityRole="button" style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel Booking</Text>
        </Pressable>
      )}

      {!busy && canCancel && confirming && (
        <View style={styles.confirmBlock}>
          <Text style={styles.confirmText}>Cancel this booking with {booking.caregiverName}?</Text>
          <View style={styles.confirmButtons}>
            <Pressable onPress={onBackOut} accessibilityRole="button" style={styles.confirmNoButton}>
              <Text style={styles.confirmNoButtonText}>Keep It</Text>
            </Pressable>
            <Pressable onPress={onConfirmCancel} accessibilityRole="button" style={styles.confirmYesButton}>
              <Text style={styles.confirmYesButtonText}>Yes, Cancel</Text>
            </Pressable>
          </View>
        </View>
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
  banner: { borderRadius: 12, padding: spacing.md, borderWidth: 1.5 },
  bannerError: { backgroundColor: '#FEE2E2', borderColor: colors.danger },
  bannerText: { fontSize: type.body - 1, fontWeight: '700', textAlign: 'center' },
  bannerTextError: { color: colors.danger },
  spinner: { marginVertical: spacing.sm },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, padding: spacing.lg },
  emptyText: { fontSize: type.body, color: colors.textMuted, lineHeight: 23 },
  sectionHeading: { fontSize: type.heading, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
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
  scheduleButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  scheduleButtonText: { fontSize: type.body - 1, fontWeight: '800', color: '#FFFFFF' },
  reviewButton: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  reviewButtonText: { fontSize: type.body - 1, fontWeight: '800', color: colors.primary },
  cancelButton: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.danger,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  cancelButtonText: { fontSize: type.body - 1, fontWeight: '800', color: colors.danger },
  confirmBlock: { gap: spacing.sm, marginTop: spacing.sm },
  confirmText: { fontSize: type.body - 1, fontWeight: '700', color: colors.text, textAlign: 'center', lineHeight: 22 },
  confirmButtons: { flexDirection: 'row', gap: spacing.sm },
  confirmNoButton: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmNoButtonText: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  confirmYesButton: { flex: 1, backgroundColor: colors.danger, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  confirmYesButtonText: { fontSize: type.body - 1, fontWeight: '800', color: '#FFFFFF' },
});
