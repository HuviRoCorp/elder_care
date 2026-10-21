// ============================================================================
// Emergency Ambulance Status View — ElderCare
//
// Displays real-time status of an active or recent ambulance booking.
// Shows driver details, vehicle number, ETA, call driver action, and status refreshing.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cancelAmbulanceBooking, getAmbulanceBooking, getActiveAmbulanceBooking } from '../api/ambulance';
import { colors, spacing, type } from '../../shared/ui/theme';

export function AmbulanceStatusScreen({ route, navigation }) {
  const initialBooking = route?.params?.initialBooking ?? null;
  const bookingId = route?.params?.bookingId ?? initialBooking?.id;

  const [booking, setBooking] = useState(initialBooking);
  const [loading, setLoading] = useState(!initialBooking);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(async () => {
    setError(null);
    try {
      if (bookingId) {
        const { booking: updated } = await getAmbulanceBooking(bookingId);
        setBooking(updated);
      } else {
        const { booking: active } = await getActiveAmbulanceBooking();
        setBooking(active);
      }
    } catch (err) {
      setError(err.message || 'Could not update booking status.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchStatus();
  }

  async function handleConfirmCancel() {
    if (!booking) return;
    setShowCancelModal(false);
    setCancelling(true);
    setError(null);

    try {
      const { booking: updated } = await cancelAmbulanceBooking(booking.id);
      setBooking(updated);
    } catch (err) {
      setError(err.message || 'Could not cancel ambulance request.');
    } finally {
      setCancelling(false);
    }
  }

  function handleCallDriver() {
    if (booking?.driverPhone) {
      Linking.openURL(`tel:${booking.driverPhone}`).catch(() => {
        setError('Could not open phone dialer.');
      });
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centerSafe}>
        <ActivityIndicator size="large" color={colors.danger} />
        <Text style={styles.loadingText}>Loading ambulance status...</Text>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.centerSafe}>
        <Text style={styles.noBookingTitle}>No Active Ambulance Request</Text>
        <Text style={styles.noBookingSub}>You currently do not have an active ambulance request.</Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => navigation.navigate('AmbulanceBooking')}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Request Ambulance</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const isCompleted = booking.status === 'completed';
  const isCancelled = booking.status === 'cancelled';
  const isActive = !isCompleted && !isCancelled;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Ambulance Status</Text>
          <View style={[styles.statusBadge, isCancelled ? styles.badgeCancelled : isCompleted ? styles.badgeCompleted : styles.badgeActive]}>
            <Text style={styles.statusBadgeText}>
              {booking.status.toUpperCase().replace('_', ' ')}
            </Text>
          </View>
        </View>

        {/* Error Banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ETA & Driver Info Card */}
        <View style={styles.statusCard}>
          {isActive ? (
            <View style={styles.etaContainer}>
              <Text style={styles.etaLabel}>Estimated Arrival Time</Text>
              <Text style={styles.etaValue}>
                {booking.etaMinutes ? `${booking.etaMinutes} mins` : 'Dispatched'}
              </Text>
              <Text style={styles.etaSub}>An emergency ambulance is on the way to your location.</Text>
            </View>
          ) : isCancelled ? (
            <Text style={styles.cancelledText}>This ambulance request was cancelled.</Text>
          ) : (
            <Text style={styles.completedText}>This ambulance request has been completed.</Text>
          )}

          {/* Driver & Vehicle Details */}
          {booking.driverName ? (
            <View style={styles.driverSection}>
              <Text style={styles.sectionHeader}>Assigned Driver & Vehicle</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Driver:</Text>
                <Text style={styles.detailValue}>{booking.driverName}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Vehicle No:</Text>
                <Text style={styles.detailValue}>{booking.vehicleNumber ?? 'Emergency Unit'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Provider:</Text>
                <Text style={styles.detailValue}>{booking.providerName ?? 'Emergency Fleet'}</Text>
              </View>

              {booking.driverPhone && isActive ? (
                <Pressable
                  style={styles.callButton}
                  onPress={handleCallDriver}
                  accessibilityRole="button"
                  accessibilityLabel="Call driver directly"
                >
                  <Text style={styles.callButtonText}>📞 Call Driver ({booking.driverPhone})</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Location & Destination Details */}
          <View style={styles.locationSection}>
            <Text style={styles.sectionHeader}>Trip Details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Pickup Location:</Text>
              <Text style={styles.detailValue}>{booking.pickupAddress}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Destination:</Text>
              <Text style={styles.detailValue}>{booking.destinationHospital}</Text>
            </View>
            {booking.notes ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Notes:</Text>
                <Text style={styles.detailValue}>{booking.notes}</Text>
              </View>
            ) : null}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reference ID:</Text>
              <Text style={styles.detailValue}>{booking.providerReference ?? booking.id.slice(0, 8)}</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionColumn}>
          {isActive ? (
            <Pressable
              style={styles.refreshButton}
              onPress={handleRefresh}
              disabled={refreshing}
              accessibilityRole="button"
            >
              {refreshing ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.refreshButtonText}>🔄 Refresh Status</Text>
              )}
            </Pressable>
          ) : null}

          {isActive ? (
            <Pressable
              style={styles.cancelRequestButton}
              onPress={() => setShowCancelModal(true)}
              disabled={cancelling}
              accessibilityRole="button"
            >
              {cancelling ? (
                <ActivityIndicator color={colors.danger} />
              ) : (
                <Text style={styles.cancelRequestText}>Cancel Request</Text>
              )}
            </Pressable>
          ) : null}

          <Pressable
            style={styles.homeButton}
            onPress={() => navigation.navigate('ElderlyHome')}
            accessibilityRole="button"
          >
            <Text style={styles.homeButtonText}>Back to Home</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Cancel Confirmation Modal */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel Ambulance Request?</Text>
            <Text style={styles.modalSub}>
              Are you sure you want to cancel this emergency ambulance dispatch?
            </Text>
            <View style={styles.modalButtonRow}>
              <Pressable
                style={styles.modalKeepButton}
                onPress={() => setShowCancelModal(false)}
                accessibilityRole="button"
              >
                <Text style={styles.modalKeepText}>No, Keep Active</Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirmCancelButton}
                onPress={handleConfirmCancel}
                accessibilityRole="button"
              >
                <Text style={styles.modalConfirmCancelText}>Yes, Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centerSafe: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: type.body,
    color: colors.textMuted,
  },
  noBookingTitle: {
    fontSize: type.heading,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  noBookingSub: {
    fontSize: type.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: type.body,
    fontWeight: '700',
  },
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  header: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    fontSize: type.heading + 2,
    fontWeight: '800',
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeActive: {
    backgroundColor: '#DCFCE7',
  },
  badgeCompleted: {
    backgroundColor: '#DBEAFE',
  },
  badgeCancelled: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: type.small + 1,
    fontWeight: '800',
    color: colors.text,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: spacing.md,
    borderRadius: 10,
  },
  errorText: {
    color: colors.danger,
    fontSize: type.body - 1,
    textAlign: 'center',
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  etaContainer: {
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  etaLabel: {
    fontSize: type.small,
    color: colors.danger,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  etaValue: {
    fontSize: type.title + 8,
    fontWeight: '900',
    color: colors.danger,
    marginVertical: 4,
  },
  etaSub: {
    fontSize: type.small,
    color: colors.textMuted,
    textAlign: 'center',
  },
  cancelledText: {
    fontSize: type.body,
    color: colors.danger,
    fontWeight: '700',
    textAlign: 'center',
  },
  completedText: {
    fontSize: type.body,
    color: colors.success,
    fontWeight: '700',
    textAlign: 'center',
  },
  driverSection: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  locationSection: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  sectionHeader: {
    fontSize: type.body,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  detailLabel: {
    fontSize: type.body - 1,
    color: colors.textMuted,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: type.body - 1,
    color: colors.text,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  callButton: {
    backgroundColor: colors.success,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: type.body,
    fontWeight: '800',
  },
  actionColumn: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  refreshButton: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: colors.primary,
    fontSize: type.body,
    fontWeight: '700',
  },
  cancelRequestButton: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelRequestText: {
    color: colors.danger,
    fontSize: type.body,
    fontWeight: '700',
  },
  homeButton: {
    backgroundColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  homeButtonText: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: type.heading,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  modalSub: {
    fontSize: type.body - 1,
    color: colors.textMuted,
    textAlign: 'center',
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  modalKeepButton: {
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalKeepText: {
    fontSize: type.body - 1,
    color: colors.text,
    fontWeight: '700',
  },
  modalConfirmCancelButton: {
    flex: 1,
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalConfirmCancelText: {
    fontSize: type.body - 1,
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
