// ============================================================================
// Hybrid Fall Detection Screen — ElderCare
//
// State-of-the-art, elderly-friendly emergency fall protection interface.
// Combines automatic motion monitoring (via phone motion sensors) with a
// prominent manual "I FELL" emergency trigger button.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cancelAlert, createFallAlert, listAlerts } from '../api/alerts';
import { captureCurrentLocation } from '../../shared/location/captureLocation';
import {
  checkSensorAvailability,
  FALL_SENSOR_CONFIG,
  startFallDetection,
} from '../services/fallSensorService';
import { colors, spacing, type } from '../../shared/ui/theme';

export function FallDetectionScreen({ navigation }) {
  const [activeAlert, setActiveAlert] = useState(null);
  const [checkingActive, setCheckingActive] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [statusBanner, setStatusBanner] = useState(null);

  // Sensor state
  const [sensorAvailable, setSensorAvailable] = useState(false);
  const [autoDetectionEnabled, setAutoDetectionEnabled] = useState(true);
  const [showAutoFallModal, setShowAutoFallModal] = useState(false);
  const [countdown, setCountdown] = useState(FALL_SENSOR_CONFIG.COUNTDOWN_SECONDS);

  // Refs for timers and active state
  const countdownTimerRef = useRef(null);
  const activeAlertRef = useRef(activeAlert);
  const autoModalOpenRef = useRef(showAutoFallModal);

  useEffect(() => {
    activeAlertRef.current = activeAlert;
  }, [activeAlert]);

  useEffect(() => {
    autoModalOpenRef.current = showAutoFallModal;
  }, [showAutoFallModal]);

  // Check active alerts and sensor availability on mount
  const initScreen = useCallback(async () => {
    try {
      const { alerts } = await listAlerts({ status: 'active', limit: 5 });
      const fallAlert = alerts.find((a) => a.alertType === 'fall');
      if (fallAlert) {
        setActiveAlert(fallAlert);
      }
    } catch {
      // Best effort check
    } finally {
      setCheckingActive(false);
    }

    const { available } = await checkSensorAvailability();
    setSensorAvailable(available);
  }, []);

  useEffect(() => {
    initScreen();
  }, [initScreen]);

  // Start motion sensor monitoring when auto detection is enabled
  useEffect(() => {
    if (!sensorAvailable || !autoDetectionEnabled || activeAlert || showAutoFallModal) {
      return;
    }

    const cleanupSensors = startFallDetection(() => {
      if (!activeAlertRef.current && !autoModalOpenRef.current) {
        triggerAutoFallCountdown();
      }
    });

    return () => {
      cleanupSensors();
    };
  }, [sensorAvailable, autoDetectionEnabled, activeAlert, showAutoFallModal]);

  // Clean up countdown timer on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, []);

  // Triggers the 10-second confirmation window countdown modal
  function triggerAutoFallCountdown() {
    setStatusBanner(null);
    setCountdown(FALL_SENSOR_CONFIG.COUNTDOWN_SECONDS);
    setShowAutoFallModal(true);

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          handleAutoFallTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // Automatic timeout handler (user did not respond in 10s)
  async function handleAutoFallTimeout() {
    setShowAutoFallModal(false);
    setSubmitting(true);
    setError(null);

    try {
      let location = null;
      try {
        const locResult = await captureCurrentLocation();
        if (locResult?.latitude && locResult?.longitude) {
          location = { latitude: locResult.latitude, longitude: locResult.longitude };
        }
      } catch {
        // Location failure does not block alert
      }

      const { alert } = await createFallAlert(
        location,
        'Automatic Fall Alert: Motion sensors detected a fall and 10-second countdown expired without response.'
      );
      setActiveAlert(alert);
      setStatusBanner('Emergency fall alert sent automatically.');
    } catch (err) {
      if (err.code === 'fall_already_active' && err.alert) {
        setActiveAlert(err.alert);
      } else {
        setError(err.message || 'Unable to send automatic fall alert.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // User taps "I'M OK" on automatic fall countdown modal
  function handleImOk() {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setShowAutoFallModal(false);
    setStatusBanner('Fall alert cancelled — glad you are OK!');
  }

  // User taps "SEND HELP NOW" on automatic fall countdown modal
  async function handleSendHelpNow() {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setShowAutoFallModal(false);
    await handleSendFallAlert('Automatic Motion-Triggered Fall Alert (User Confirmed Send)');
  }

  // Manual "I FELL" button submission
  async function handleSendFallAlert(customMessage) {
    setShowConfirmModal(false);
    setSubmitting(true);
    setError(null);

    try {
      let location = null;
      try {
        const locResult = await captureCurrentLocation();
        if (locResult?.latitude && locResult?.longitude) {
          location = { latitude: locResult.latitude, longitude: locResult.longitude };
        }
      } catch {
        // Best effort location
      }

      const { alert } = await createFallAlert(
        location,
        customMessage || 'Manual Fall Alert: User pressed the I FELL emergency button.'
      );
      setActiveAlert(alert);
      setStatusBanner('Emergency fall alert sent successfully.');
    } catch (err) {
      if (err.code === 'fall_already_active' && err.alert) {
        setActiveAlert(err.alert);
      } else {
        setError(err.message || 'Unable to send emergency fall alert. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelActiveAlert() {
    if (!activeAlert?.id) return;
    setCancelling(true);
    try {
      await cancelAlert(activeAlert.id, 'User cancelled fall alert');
      setActiveAlert(null);
      setStatusBanner('Active fall alert resolved.');
    } catch (err) {
      setError(err.message || 'Could not cancel alert.');
    } finally {
      setCancelling(false);
    }
  }

  if (checkingActive) {
    return (
      <SafeAreaView style={styles.centerSafe}>
        <ActivityIndicator size="large" color={colors.danger} />
        <Text style={styles.loadingText}>Loading fall protection status...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Screen Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Fall Detection</Text>
          <Text style={styles.subtitle}>Automatic + Manual Emergency Protection</Text>
        </View>

        {/* Status / Success Banner */}
        {statusBanner ? (
          <View style={styles.statusBanner}>
            <Text style={styles.statusBannerText}>{statusBanner}</Text>
          </View>
        ) : null}

        {/* Error Banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Active Alert State */}
        {activeAlert ? (
          <View style={styles.activeCard}>
            <Text style={styles.activeCardIcon}>🚨</Text>
            <Text style={styles.activeCardTitle}>Emergency Fall Alert Active</Text>
            <Text style={styles.activeCardSub}>
              Your emergency contacts are being notified. Assistance is on the way.
            </Text>

            <View style={styles.activeDetailsBox}>
              <Text style={styles.activeDetailText}>
                📍 Location: {activeAlert.latitude ? 'Shared (GPS Available)' : 'Location Unavailable'}
              </Text>
              <Text style={styles.activeDetailText}>
                🕒 Triggered: {new Date(activeAlert.triggeredAt).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && styles.cancelButtonPressed,
                cancelling && styles.buttonDisabled,
              ]}
              onPress={handleCancelActiveAlert}
              disabled={cancelling}
              accessibilityRole="button"
              accessibilityLabel="Cancel active fall alert"
            >
              {cancelling ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Text style={styles.cancelButtonText}>Cancel Alert (False Alarm)</Text>
              )}
            </Pressable>
          </View>
        ) : (
          /* Normal Protection View */
          <View style={styles.triggerContainer}>
            {/* Automatic Motion Protection Card */}
            <View style={styles.autoCard}>
              <View style={styles.autoCardHeader}>
                <View style={styles.autoTitleGroup}>
                  <Text style={styles.autoCardIcon}>📱</Text>
                  <Text style={styles.autoCardTitle}>Automatic Motion Monitor</Text>
                </View>

                {sensorAvailable ? (
                  <Switch
                    value={autoDetectionEnabled}
                    onValueChange={setAutoDetectionEnabled}
                    trackColor={{ false: '#D1D5DB', true: '#BFDBFE' }}
                    thumbColor={autoDetectionEnabled ? colors.primary : '#9CA3AF'}
                    accessibilityLabel="Toggle automatic fall detection motion monitor"
                  />
                ) : null}
              </View>

              <View style={styles.statusPillBox}>
                <Text style={styles.autoCardStatusPill}>
                  {sensorAvailable
                    ? autoDetectionEnabled
                      ? '🟢 ACTIVE (Monitoring Motion)'
                      : '🟡 PAUSED'
                    : '⚠️ SENSORS UNAVAILABLE'}
                </Text>
              </View>

              <Text style={styles.autoCardDesc}>
                {sensorAvailable
                  ? 'Your phone continuously monitors motion for possible falls. If an unusual fall is detected, a 10-second confirmation window starts before requesting emergency help.'
                  : 'Automatic motion sensors are unavailable on this device. Use the manual emergency button below.'}
              </Text>
            </View>

            {/* Primary "I FELL" Action Button */}
            <Pressable
              style={({ pressed }) => [
                styles.fellButton,
                pressed && styles.fellButtonPressed,
                submitting && styles.buttonDisabled,
              ]}
              onPress={() => setShowConfirmModal(true)}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Manually report that I have fallen. Tap for emergency help."
            >
              {submitting ? (
                <View style={styles.submittingContainer}>
                  <ActivityIndicator size="large" color="#FFFFFF" />
                  <Text style={styles.submittingText}>Sending Alert...</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.fellButtonIcon}>🍂</Text>
                  <Text style={styles.fellButtonText}>I FELL</Text>
                  <Text style={styles.fellButtonSub}>Tap for Emergency Help</Text>
                </>
              )}
            </Pressable>

            <Text style={styles.disclaimerText}>
              Note: The I FELL button is your direct manual emergency trigger. Tap to notify your contacts immediately.
            </Text>
          </View>
        )}

        {/* Other Emergency Options */}
        <View style={styles.shortcutsSection}>
          <Text style={styles.shortcutsTitle}>Other Emergency Options</Text>

          <Pressable
            style={({ pressed }) => [
              styles.shortcutButton,
              pressed && styles.shortcutButtonPressed,
            ]}
            onPress={() => navigation.navigate('AmbulanceBooking')}
            accessibilityRole="button"
          >
            <Text style={styles.shortcutText}>🚑 Request Emergency Ambulance</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.shortcutButton,
              pressed && styles.shortcutButtonPressed,
            ]}
            onPress={() => navigation.navigate('ResponseCenter')}
            accessibilityRole="button"
          >
            <Text style={styles.shortcutText}>📞 24/7 Emergency Response Center</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* 10-Second Automatic Fall Confirmation Countdown Modal */}
      <Modal
        visible={showAutoFallModal}
        transparent
        animationType="fade"
        onRequestClose={handleImOk}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, styles.autoModalBox]}>
            <Text style={styles.autoModalWarnIcon}>⚠️</Text>
            <Text style={styles.autoModalTitle}>POSSIBLE FALL DETECTED</Text>
            <Text style={styles.autoModalSubtitle}>Are you okay?</Text>

            <Text style={styles.autoModalBody}>
              We detected unusual phone movement. Emergency assistance will be contacted automatically if you do not respond.
            </Text>

            {/* Countdown Display */}
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownNumber}>{countdown}</Text>
              <Text style={styles.countdownLabel}>seconds remaining</Text>
            </View>

            <View style={styles.autoModalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.imOkButton,
                  pressed && styles.imOkButtonPressed,
                ]}
                onPress={handleImOk}
                accessibilityRole="button"
                accessibilityLabel="Cancel automatic emergency fall alert. I'm OK."
              >
                <Text style={styles.imOkButtonText}>I'M OK</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.sendHelpButton,
                  pressed && styles.sendHelpButtonPressed,
                ]}
                onPress={handleSendHelpNow}
                accessibilityRole="button"
                accessibilityLabel="Send emergency fall alert now"
              >
                <Text style={styles.sendHelpButtonText}>SEND HELP NOW</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manual "I FELL" Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalIcon}>⚠️</Text>
            <Text style={styles.modalTitle}>Send Emergency Fall Alert?</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to send a fall emergency alert to your emergency contacts?
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalCancelButton,
                  pressed && styles.modalCancelButtonPressed,
                ]}
                onPress={() => setShowConfirmModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel fall alert"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.modalConfirmButton,
                  pressed && styles.modalConfirmButtonPressed,
                ]}
                onPress={() => handleSendFallAlert()}
                accessibilityRole="button"
                accessibilityLabel="Confirm send emergency fall alert"
              >
                <Text style={styles.modalConfirmText}>YES, SEND ALERT</Text>
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
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    alignItems: 'center',
  },
  title: {
    fontSize: type.title + 2,
    fontWeight: '800',
    color: colors.danger,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: type.body - 1,
    color: colors.textMuted,
    textAlign: 'center',
  },
  statusBanner: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1.5,
    borderColor: colors.success,
    borderRadius: 12,
    padding: spacing.md,
  },
  statusBannerText: {
    color: '#065F46',
    fontSize: type.body - 1,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 12,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: type.body - 1,
    fontWeight: '600',
    textAlign: 'center',
  },
  triggerContainer: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  autoCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: '#2563EB',
    width: '100%',
    gap: spacing.sm,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  autoCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autoTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autoCardIcon: {
    fontSize: 24,
  },
  autoCardTitle: {
    fontSize: type.heading - 2,
    fontWeight: '800',
    color: colors.text,
  },
  statusPillBox: {
    alignSelf: 'flex-start',
  },
  autoCardStatusPill: {
    fontSize: type.small + 1,
    fontWeight: '800',
    color: colors.primary,
    backgroundColor: '#EFF6FF',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  autoCardDesc: {
    fontSize: type.small + 1,
    color: colors.textMuted,
    lineHeight: 21,
  },
  fellButton: {
    backgroundColor: colors.danger,
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  fellButtonPressed: {
    backgroundColor: '#991B1B',
    transform: [{ scale: 0.97 }],
  },
  fellButtonIcon: {
    fontSize: 44,
    marginBottom: 2,
  },
  fellButtonText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  fellButtonSub: {
    color: '#FEE2E2',
    fontSize: type.small,
    fontWeight: '700',
    marginTop: 2,
  },
  submittingContainer: {
    alignItems: 'center',
    gap: 8,
  },
  submittingText: {
    color: '#FFFFFF',
    fontSize: type.body,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  disclaimerText: {
    fontSize: type.small,
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    maxWidth: 320,
  },
  activeCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.danger,
    alignItems: 'center',
    gap: spacing.md,
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  activeCardIcon: {
    fontSize: 48,
  },
  activeCardTitle: {
    fontSize: type.heading,
    fontWeight: '800',
    color: colors.danger,
    textAlign: 'center',
  },
  activeCardSub: {
    fontSize: type.body - 1,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  activeDetailsBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: spacing.md,
    width: '100%',
    gap: spacing.xs,
  },
  activeDetailText: {
    fontSize: type.body - 1,
    color: colors.text,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    width: '100%',
    alignItems: 'center',
  },
  cancelButtonPressed: {
    backgroundColor: '#D1D5DB',
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: type.body - 1,
    fontWeight: '700',
  },
  shortcutsSection: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  shortcutsTitle: {
    fontSize: type.heading - 2,
    fontWeight: '800',
    color: colors.text,
  },
  shortcutButton: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  shortcutButtonPressed: {
    backgroundColor: colors.background,
  },
  shortcutText: {
    fontSize: type.body - 1,
    fontWeight: '700',
    color: colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalBox: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: spacing.sm,
  },
  autoModalBox: {
    borderWidth: 3,
    borderColor: colors.danger,
    padding: spacing.xl,
  },
  autoModalWarnIcon: {
    fontSize: 52,
  },
  autoModalTitle: {
    fontSize: type.heading + 2,
    fontWeight: '900',
    color: colors.danger,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  autoModalSubtitle: {
    fontSize: type.heading - 1,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  autoModalBody: {
    fontSize: type.body - 1,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
    marginVertical: 4,
  },
  countdownContainer: {
    alignItems: 'center',
    marginVertical: spacing.sm,
    backgroundColor: '#FEF2F2',
    borderRadius: 18,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    width: '100%',
    borderWidth: 2,
    borderColor: colors.danger,
  },
  countdownNumber: {
    fontSize: 58,
    fontWeight: '900',
    color: colors.danger,
  },
  countdownLabel: {
    fontSize: type.small,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  autoModalActions: {
    gap: spacing.md,
    width: '100%',
    marginTop: spacing.xs,
  },
  imOkButton: {
    backgroundColor: colors.success,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  imOkButtonPressed: {
    backgroundColor: '#047857',
  },
  imOkButtonText: {
    fontSize: type.body + 2,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  sendHelpButton: {
    backgroundColor: colors.danger,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendHelpButtonPressed: {
    backgroundColor: '#991B1B',
  },
  sendHelpButtonText: {
    fontSize: type.body,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  modalIcon: {
    fontSize: 44,
  },
  modalTitle: {
    fontSize: type.heading,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: type.body - 1,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
    width: '100%',
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: colors.border,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelButtonPressed: {
    backgroundColor: '#D1D5DB',
  },
  modalCancelText: {
    fontSize: type.body - 1,
    fontWeight: '700',
    color: colors.text,
  },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: colors.danger,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalConfirmButtonPressed: {
    backgroundColor: '#991B1B',
  },
  modalConfirmText: {
    fontSize: type.small + 1,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
