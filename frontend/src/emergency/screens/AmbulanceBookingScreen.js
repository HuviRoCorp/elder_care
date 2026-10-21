// ============================================================================
// Emergency Ambulance Booking Screen — ElderCare
//
// Simple, high-contrast, elderly-friendly screen to request an ambulance.
// Integrates GPS location capture with manual fallback, hospital quick selection,
// a review confirmation modal to prevent accidental requests, and double-tap protection.
// ============================================================================

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createAmbulanceBooking, getActiveAmbulanceBooking } from '../api/ambulance';
import { captureCurrentLocation } from '../../shared/location/captureLocation';
import { colors, spacing, type } from '../../shared/ui/theme';

const POPULAR_HOSPITALS = [
  'Apollo Hospital',
  'Fortis Hospital',
  'Manipal Hospital',
  'City General Hospital',
  'Nearest Emergency ER',
];

export function AmbulanceBookingScreen({ navigation }) {
  const [pickupAddress, setPickupAddress] = useState('');
  const [destinationHospital, setDestinationHospital] = useState('');
  const [notes, setNotes] = useState('');
  const [pickupCoords, setPickupCoords] = useState(null);

  const [loadingGps, setLoadingGps] = useState(false);
  const [gpsStatusText, setGpsStatusText] = useState(null);

  const [checkingActive, setCheckingActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Check if user already has an active ambulance booking on screen load
  useEffect(() => {
    (async () => {
      try {
        const { booking } = await getActiveAmbulanceBooking();
        if (booking) {
          navigation.replace('AmbulanceStatus', { bookingId: booking.id, initialBooking: booking });
          return;
        }
      } catch {
        // Non-blocking: allow user to continue if check fails
      } finally {
        setCheckingActive(false);
      }
    })();
  }, [navigation]);

  // Handle GPS location capture button
  async function handleGetGpsLocation() {
    setLoadingGps(true);
    setGpsStatusText('Fetching GPS location...');
    setError(null);

    const location = await captureCurrentLocation({ timeoutMs: 7000 });
    setLoadingGps(false);

    if (location) {
      setPickupCoords({ latitude: location.latitude, longitude: location.longitude });
      const coordsText = `GPS Location (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`;
      if (!pickupAddress) {
        setPickupAddress(coordsText);
      }
      setGpsStatusText('✓ GPS location captured');
    } else {
      setGpsStatusText('Could not get GPS fix. Please enter pickup address manually below.');
    }
  }

  function validate() {
    const errs = {};
    if (!pickupAddress.trim()) {
      errs.pickupAddress = 'Please provide a pickup location.';
    }
    if (!destinationHospital.trim()) {
      errs.destinationHospital = 'Please select or enter a destination hospital.';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleOpenReview() {
    setError(null);
    setFieldErrors({});

    if (!validate()) {
      return;
    }

    setShowConfirmModal(true);
  }

  async function handleConfirmSubmit() {
    setShowConfirmModal(false);
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        pickupAddress: pickupAddress.trim(),
        destinationHospital: destinationHospital.trim(),
        ...(pickupCoords ? { pickupLatitude: pickupCoords.latitude, pickupLongitude: pickupCoords.longitude } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };

      const { booking } = await createAmbulanceBooking(payload);
      navigation.replace('AmbulanceStatus', { bookingId: booking.id, initialBooking: booking });
    } catch (err) {
      if (err.name === 'NetworkError') {
        setError('Unable to connect to the ambulance service. Please check your network connection.');
      } else if (err.code === 'active_booking_exists' && err.details?.booking) {
        navigation.replace('AmbulanceStatus', {
          bookingId: err.details.booking.id,
          initialBooking: err.details.booking,
        });
      } else if (err.code === 'validation_failed' && Array.isArray(err.details)) {
        const mapped = {};
        err.details.forEach((d) => {
          if (d.field) mapped[d.field] = d.message;
        });
        setFieldErrors(mapped);
        setError('Please fix the errors highlighted below.');
      } else {
        setError(err.message || 'Could not request ambulance. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingActive) {
    return (
      <SafeAreaView style={styles.loadingSafe}>
        <ActivityIndicator size="large" color={colors.danger} />
        <Text style={styles.loadingText}>Checking ambulance status...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Emergency Ambulance</Text>
            <Text style={styles.subtitle}>
              Request an emergency ambulance immediately. Fill in pickup and destination details below.
            </Text>
          </View>

          {/* Global Error Notice */}
          {error ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Form */}
          <View style={styles.form}>
            {/* Pickup Location Group */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Pickup Location *</Text>

              {/* GPS Location Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.gpsButton,
                  loadingGps ? styles.gpsButtonDisabled : null,
                  pressed && !loadingGps ? styles.gpsButtonPressed : null,
                ]}
                onPress={handleGetGpsLocation}
                disabled={loadingGps}
                accessibilityRole="button"
                accessibilityLabel="Use current GPS location for pickup"
              >
                {loadingGps ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.gpsButtonText}>📍 Use My Current GPS Location</Text>
                )}
              </Pressable>

              {gpsStatusText ? <Text style={styles.gpsStatusText}>{gpsStatusText}</Text> : null}

              {/* Manual Pickup Address Input */}
              <TextInput
                style={[styles.input, styles.multilineInput, fieldErrors.pickupAddress ? styles.inputError : null]}
                value={pickupAddress}
                onChangeText={setPickupAddress}
                placeholder="Enter pickup address, house/apt #, street, landmark"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={2}
                accessibilityLabel="Pickup address"
              />
              {fieldErrors.pickupAddress ? (
                <Text style={styles.fieldErrorText}>{fieldErrors.pickupAddress}</Text>
              ) : null}
            </View>

            {/* Destination Hospital Group */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Destination Hospital *</Text>
              <Text style={styles.helperText}>Select a hospital or type a hospital name below:</Text>

              {/* Popular Hospital Selector Chips */}
              <View style={styles.chipRow}>
                {POPULAR_HOSPITALS.map((hosp) => {
                  const isSelected = destinationHospital === hosp;
                  return (
                    <Pressable
                      key={hosp}
                      style={[styles.chip, isSelected ? styles.chipSelected : null]}
                      onPress={() => setDestinationHospital(hosp)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select hospital ${hosp}`}
                    >
                      <Text style={[styles.chipText, isSelected ? styles.chipTextSelected : null]}>
                        {hosp}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                style={[styles.input, fieldErrors.destinationHospital ? styles.inputError : null]}
                value={destinationHospital}
                onChangeText={setDestinationHospital}
                placeholder="Or enter hospital name manually"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Destination hospital name"
              />
              {fieldErrors.destinationHospital ? (
                <Text style={styles.fieldErrorText}>{fieldErrors.destinationHospital}</Text>
              ) : null}
            </View>

            {/* Additional Notes (Optional) */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Additional Information (Optional)</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Wheelchair required, difficulty breathing, gate passcode"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={2}
                accessibilityLabel="Additional medical or access notes optional"
              />
            </View>

            {/* Request Primary Button */}
            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                submitting ? styles.submitButtonDisabled : null,
                pressed && !submitting ? styles.submitButtonPressed : null,
              ]}
              onPress={handleOpenReview}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Request emergency ambulance"
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>🚑 REQUEST AMBULANCE</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Review Before Submission Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm Ambulance Request</Text>
            <Text style={styles.modalSub}>
              Please confirm your emergency request details before submitting:
            </Text>

            <View style={styles.reviewBox}>
              <Text style={styles.reviewLabel}>Pickup Location:</Text>
              <Text style={styles.reviewValue}>{pickupAddress}</Text>

              <Text style={styles.reviewLabel}>Destination Hospital:</Text>
              <Text style={styles.reviewValue}>{destinationHospital}</Text>

              {notes.trim() ? (
                <>
                  <Text style={styles.reviewLabel}>Additional Information:</Text>
                  <Text style={styles.reviewValue}>{notes}</Text>
                </>
              ) : null}
            </View>

            <View style={styles.modalButtonRow}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setShowConfirmModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel request"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={styles.modalConfirmButton}
                onPress={handleConfirmSubmit}
                accessibilityRole="button"
                accessibilityLabel="Confirm emergency ambulance request"
              >
                <Text style={styles.modalConfirmText}>Request Now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingSafe: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: type.body,
    color: colors.textMuted,
  },
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: type.title + 2,
    fontWeight: '800',
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: type.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: type.body - 1,
    fontWeight: '600',
    textAlign: 'center',
  },
  form: {
    gap: spacing.lg,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: type.body,
    fontWeight: '700',
    color: colors.text,
  },
  helperText: {
    fontSize: type.small,
    color: colors.textMuted,
  },
  gpsButton: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  gpsButtonDisabled: {
    opacity: 0.6,
  },
  gpsButtonPressed: {
    backgroundColor: '#DBEAFE',
  },
  gpsButtonText: {
    color: colors.primary,
    fontSize: type.body,
    fontWeight: '700',
  },
  gpsStatusText: {
    fontSize: type.small,
    color: colors.success,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: type.body,
    color: colors.text,
    minHeight: 50,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: colors.danger,
  },
  fieldErrorText: {
    color: colors.danger,
    fontSize: type.small,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: type.small + 1,
    color: colors.text,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    marginTop: spacing.md,
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonPressed: {
    opacity: 0.85,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: type.body + 2,
    fontWeight: '800',
    letterSpacing: 0.5,
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
  reviewBox: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: spacing.md,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reviewLabel: {
    fontSize: type.small,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  reviewValue: {
    fontSize: type.body,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 6,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: type.body,
    color: colors.text,
    fontWeight: '700',
  },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: type.body,
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
