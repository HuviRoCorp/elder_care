// ============================================================================
// My Bookings — caregiver side
//
// GET /caregiver/bookings, no status filter, partitioned client-side into
// three sections. Confirm/Reject only ever show on a Request — that
// transition is caregiver/admin-only server-side (updateBookingStatus,
// bookings.service.js), and every row here is already the caller's own
// assigned booking, so the buttons are always safe to show.
//
// Cancel is also shown on Confirmed/In progress bookings — the backend
// permits the assigned caregiver to cancel same as the elderly owner or
// original booker (a caregiver who falls ill needs a way to say so rather
// than leaving a confirmed visit the family is still expecting). Not shown
// on Requests — reject is the equivalent action there.
//
// Schedule Visit shows only on status === 'confirmed', not 'active' —
// createSchedule (backend) doesn't itself check booking status, so this is
// the gate. See BUILD_LOG.md.
// ============================================================================

import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listBookings, updateBookingStatus } from '../api/bookings';
import { NetworkError } from '../../shared/api/client';
import { colors, spacing, type } from '../../shared/ui/theme';
import { bookingStatusLabel, recurrenceLabel, formatDate } from '../bookingFormat';

export function CaregiverBookingsScreen({ navigation }) {
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

  async function handleStatusChange(id, status) {
    setBusyId(id);
    try {
      await updateBookingStatus(id, { status });
      setConfirmCancelId(null);
      await load();
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof NetworkError ? 'Could not reach the server. Please try again.' : 'Could not update that booking.',
      });
    } finally {
      setBusyId(null);
    }
  }

  const requests = bookings.filter((b) => b.status === 'requested');
  const confirmed = bookings.filter((b) => b.status === 'confirmed' || b.status === 'active');
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

        {!loading && (
          <>
            <Text style={styles.sectionHeading}>Requests</Text>
            {requests.length === 0 && <EmptyCard text="No new booking requests." />}
            {requests.map((b) => (
              <BookingCard key={b.id} booking={b} busy={busyId === b.id}>
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => handleStatusChange(b.id, 'rejected')}
                    accessibilityRole="button"
                    style={styles.declineButton}
                  >
                    <Text style={styles.declineButtonText}>Decline</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleStatusChange(b.id, 'confirmed')}
                    accessibilityRole="button"
                    style={styles.acceptButton}
                  >
                    <Text style={styles.acceptButtonText}>Confirm</Text>
                  </Pressable>
                </View>
              </BookingCard>
            ))}

            <Text style={styles.sectionHeading}>Confirmed</Text>
            {confirmed.length === 0 && <EmptyCard text="No confirmed visits right now." />}
            {confirmed.map((b) =>
              confirmCancelId === b.id ? (
                <BookingCard key={b.id} booking={b} busy={busyId === b.id}>
                  <View style={styles.confirmBlock}>
                    <Text style={styles.confirmText}>Cancel this booking with {b.elderlyName}?</Text>
                    <View style={styles.confirmButtons}>
                      <Pressable onPress={() => setConfirmCancelId(null)} accessibilityRole="button" style={styles.confirmNoButton}>
                        <Text style={styles.confirmNoButtonText}>Keep It</Text>
                      </Pressable>
                      <Pressable onPress={() => handleStatusChange(b.id, 'cancelled')} accessibilityRole="button" style={styles.confirmYesButton}>
                        <Text style={styles.confirmYesButtonText}>Yes, Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                </BookingCard>
              ) : (
                <BookingCard key={b.id} booking={b} busy={busyId === b.id}>
                  {b.status === 'confirmed' && (
                    <Pressable
                      onPress={() =>
                        navigation.navigate('ScheduleVisit', {
                          bookingId: b.id,
                          caregiverId: b.caregiverId,
                          caregiverName: b.caregiverName,
                          elderlyUserId: b.elderlyUserId,
                          elderlyName: b.elderlyName,
                        })
                      }
                      accessibilityRole="button"
                      style={styles.scheduleButton}
                    >
                      <Text style={styles.scheduleButtonText}>Schedule Visit</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setConfirmCancelId(b.id)} accessibilityRole="button" style={styles.cancelButton}>
                    <Text style={styles.cancelButtonText}>Cancel Booking</Text>
                  </Pressable>
                </BookingCard>
              )
            )}

            <Text style={styles.sectionHeading}>Past</Text>
            {past.length === 0 && <EmptyCard text="No past bookings yet." />}
            {past.map((b) => (
              <BookingCard key={b.id} booking={b} busy={false} />
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

function BookingCard({ booking, busy, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardName}>{booking.elderlyName}</Text>
      <Text style={styles.cardMeta}>{bookingStatusLabel(booking.status)}</Text>
      <Text style={styles.cardMeta}>
        {formatDate(booking.startDate)}
        {booking.endDate ? ` – ${formatDate(booking.endDate)}` : ''} · {recurrenceLabel(booking.recurrence)}
      </Text>
      {booking.hoursPerVisit ? <Text style={styles.cardMeta}>{booking.hoursPerVisit} hours per visit</Text> : null}
      {booking.specialInstructions ? <Text style={styles.cardInstructions}>"{booking.specialInstructions}"</Text> : null}

      {busy ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : children}
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
  sectionHeading: { fontSize: type.heading, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
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
  cardInstructions: { fontSize: type.small + 1, color: colors.text, fontStyle: 'italic', marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  declineButton: { flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: colors.danger, paddingVertical: 12, alignItems: 'center' },
  declineButtonText: { fontSize: type.body - 1, fontWeight: '800', color: colors.danger },
  acceptButton: { flex: 1, backgroundColor: colors.success, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  acceptButtonText: { fontSize: type.body - 1, fontWeight: '800', color: '#FFFFFF' },
  scheduleButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  scheduleButtonText: { fontSize: type.body - 1, fontWeight: '800', color: '#FFFFFF' },
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
