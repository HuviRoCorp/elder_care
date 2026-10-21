// ============================================================================
// Elderly home screen — SOS & Emergency Assistance Dashboard
//
// Refined, accessible, elderly-friendly dashboard for immediate emergency response.
// Provides:
//   1. Prominent circular SOS button with 5-second cancellable countdown overlay.
//   2. Quick emergency action cards: Ambulance Booking, Hybrid Fall Detection,
//      24/7 Emergency Response Helpline, and Disaster & Weather Alerts.
//   3. Non-overlapping location status and continuous tracking card controls.
//
// SOS location capture (see startCountdown/fireSos below): a best-effort
// fresh-fix read starts at countdown start and is awaited up to
// SOS_LOCATION_TIMEOUT_MS (4.5s) before sending, never blocking longer than
// that. If no fresh fix lands in time, a getLastKnownPositionAsync floor
// fills the initial send instead (marked isApproximate on the alert). The
// fresh-fix read keeps running past the send deadline, up to
// SOS_LOCATION_ASYNC_CEILING_MS — if it lands late, fireSos PATCHes it onto
// the alert already sent, even if the alert has since been cancelled or
// resolved. See captureLocation.js and BUILD_LOG.md.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';

import { cancelAlert, createSosAlert, listAlerts, attachAlertLocation } from '../api/alerts';
import { recordLocation } from '../api/locations';
import { ApiError, NetworkError } from '../../shared/api/client';
import {
  captureCurrentLocation,
  beginSosLocationCapture,
  captureLastKnownLocation,
  getLocationPermissionStatus,
  requestLocationPermission,
} from '../../shared/location/captureLocation';
import {
  enableBackgroundTracking,
  disableBackgroundTracking,
  reconcileTrackingState,
} from '../../shared/location/backgroundTracking';
import { useAuth } from '../../shared/auth/AuthContext';
import { colors, spacing, type } from '../../shared/ui/theme';

const COUNTDOWN_SECONDS = 5;
const POLL_ACTIVE_MS = 10_000;
const POLL_IDLE_MS = 20_000;
const SOS_LOCATION_TIMEOUT_MS = 4500;

// Phase 1 step 4: how long a fresh fix keeps being watched for, past the
// 4.5s send deadline, before the alert gives up on ever getting an upgrade.
// Measured from the same start point as SOS_LOCATION_TIMEOUT_MS (countdown
// start, i.e. SOS press) — never delays the send itself, only how long the
// async attach in fireSos keeps a late fix worth PATCHing onto the alert.
//
// 45s, not the original 25s: sized for Accuracy.High's slower cold-start
// time-to-first-fix (captureLocation.js's beginSosLocationCapture now
// requests High for this path specifically), not Balanced's. Unmeasured
// against real device timing yet — see BUILD_LOG.md, 2026-08-27.
const SOS_LOCATION_ASYNC_CEILING_MS = 45_000;

export function ElderlyHomeScreen({ navigation }) {
  const { user, signOut } = useAuth();

  const [phase, setPhase] = useState('checking');
  const [alert, setAlert] = useState(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [banner, setBanner] = useState(null);
  const countdownTimer = useRef(null);

  const [locationPermission, setLocationPermission] = useState('checking');
  const [locationShared, setLocationShared] = useState(false);
  const sosLocationRef = useRef(null); // in-flight capture promise during the countdown
  // The same fresh-fix read as sosLocationRef, but bounded by
  // SOS_LOCATION_ASYNC_CEILING_MS instead of SOS_LOCATION_TIMEOUT_MS — held
  // separately so fireSos can keep watching for a late fix after send.
  const sosLocationFullRef = useRef(null);

  const [trackingPhase, setTrackingPhase] = useState('checking');

  const stopCountdown = useCallback(() => {
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
  }, []);

  const checkActive = useCallback(async () => {
    try {
      const { alerts } = await listAlerts({ status: 'active', limit: 1 });
      if (alerts.length > 0) {
        setAlert(alerts[0]);
        setPhase((p) => (p === 'checking' || p === 'idle' || p === 'active' ? 'active' : p));
      } else {
        setAlert(null);
        setPhase((p) => (p === 'checking' || p === 'active' ? 'idle' : p));
      }
    } catch {
      setPhase((p) => (p === 'checking' ? 'idle' : p));
    }
  }, []);

  useEffect(() => {
    checkActive();
  }, [checkActive]);

  useEffect(() => {
    if (phase !== 'idle' && phase !== 'active') return;
    const intervalMs = phase === 'active' ? POLL_ACTIVE_MS : POLL_IDLE_MS;
    const id = setInterval(checkActive, intervalMs);
    return () => clearInterval(id);
  }, [phase, checkActive]);

  useEffect(() => stopCountdown, [stopCountdown]);

  useEffect(() => {
    (async () => {
      const status = await getLocationPermissionStatus();
      setLocationPermission(status);
      if (status === 'granted') {
        await captureAndShareLocation();
      }
    })();
  }, []);

  async function captureAndShareLocation() {
    const location = await captureCurrentLocation();
    if (!location) return;
    try {
      await recordLocation({ ...location, source: 'foreground_mount' });
      setLocationShared(true);
    } catch {
      // Ignored non-blocking
    }
  }

  async function handleEnableLocationSharing() {
    const status = await requestLocationPermission();
    setLocationPermission(status);
    if (status === 'granted') {
      await captureAndShareLocation();
    }
  }

  const trackingPhaseRef = useRef(trackingPhase);
  useEffect(() => {
    trackingPhaseRef.current = trackingPhase;
  }, [trackingPhase]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        if (trackingPhaseRef.current === 'background_denied') {
          setTrackingPhase('enabling');
          const result = await enableBackgroundTracking();
          if (!cancelled) setTrackingPhase(result.started ? 'on' : result.reason);
          return;
        }

        const active = await reconcileTrackingState();
        if (cancelled) return;
        setTrackingPhase((prev) => {
          if (active) return 'on';
          return prev === 'foreground_denied' || prev === 'background_denied' ? prev : 'off';
        });
      })();

      return () => {
        cancelled = true;
      };
    }, [])
  );

  async function handleEnableTracking() {
    setTrackingPhase('enabling');
    const result = await enableBackgroundTracking();
    setTrackingPhase(result.started ? 'on' : result.reason);
  }

  async function handleDisableTracking() {
    await disableBackgroundTracking();
    setTrackingPhase('off');
  }

  function startCountdown() {
    setCountdown(COUNTDOWN_SECONDS);
    setPhase('confirming');

    // Started now, not awaited until fireSos — see SOS_LOCATION_TIMEOUT_MS.
    // If permission isn't granted this resolves to null immediately, which
    // is exactly the "fire without a location" path.
    const capture = beginSosLocationCapture({ timeoutMs: SOS_LOCATION_TIMEOUT_MS });
    sosLocationRef.current = capture.settled;

    // Same underlying read, watched past the send deadline for the
    // async-attach path in fireSos — see SOS_LOCATION_ASYNC_CEILING_MS.
    const asyncCeiling = new Promise((resolve) => setTimeout(() => resolve(null), SOS_LOCATION_ASYNC_CEILING_MS));
    sosLocationFullRef.current = Promise.race([capture.full, asyncCeiling]);

    countdownTimer.current = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          stopCountdown();
          fireSos();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  }

  function cancelCountdown() {
    stopCountdown();
    setPhase('idle');
  }

  async function fireSos() {
    setPhase('sending');
    // Already settled by now — SOS_LOCATION_TIMEOUT_MS is shorter than the
    // countdown that just finished — so this await does not delay sending.
    const freshLocation = await (sosLocationRef.current ?? Promise.resolve(null));

    // No fresh fix in time — fall back to a cached position rather than
    // sending nothing. getLastKnownPositionAsync doesn't touch the radio, so
    // this costs no real time; isApproximate: true means the dashboard marks
    // it plainly rather than treating it as equivalent to a real reading.
    const location = freshLocation ?? (await captureLastKnownLocation());

    try {
      const { alert: created } = await createSosAlert(location);
      setAlert(created);
      setPhase('active');

      // Fire-and-forget: a fresh fix landing after send should still reach
      // the alert (Phase 1 step 4), but must never hold up the 'active'
      // transition above. Only worth watching for if send didn't already
      // carry a fresh fix — freshLocation non-null means there is nothing to
      // upgrade.
      if (!freshLocation) attachLateSosLocation(created.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'sos_already_active') {
        setBanner('Help is already on the way.');
        await checkActive();
        setPhase('active');
        return;
      }

      setBanner(
        err instanceof NetworkError
          ? 'Could not reach the server. Tap SOS to try again.'
          : 'Something went wrong sending your alert. Tap SOS to try again.'
      );
      setPhase('idle');
    }
  }

  /**
   * Waits on sosLocationFullRef up to SOS_LOCATION_ASYNC_CEILING_MS and, if a
   * fresh fix lands, PATCHes it onto the alert. Never awaited by fireSos —
   * runs after 'active' is already showing. Attached even if the person has
   * since cancelled the alert locally; the server accepts a late fix on any
   * status (see backend/emergency/routes.js), so no status check here either.
   * Best-effort like every other location call in this file: a failure here
   * is not shown to the user, the alert just keeps whatever it already had.
   */
  async function attachLateSosLocation(alertId) {
    const lateLocation = await (sosLocationFullRef.current ?? Promise.resolve(null));
    if (!lateLocation) return;
    try {
      await attachAlertLocation(alertId, lateLocation);
    } catch {
      // Nobody is watching this promise — a lost late fix is no worse than
      // the "no fresh fix in time" case this whole path exists to improve on.
    }
  }

  // ---------------------------------------------------------------------
  // Cancelling an active alert — behind one confirmation, since dismissing a
  // real emergency should not be as easy as raising one.
  // ---------------------------------------------------------------------

  async function confirmCancelAlert() {
    if (!alert) return;
    setPhase('cancelling');
    try {
      await cancelAlert(alert.id);
      setAlert(null);
      setBanner(null);
      setPhase('idle');
    } catch (err) {
      await checkActive();
      if (err instanceof NetworkError) {
        setBanner('Could not reach the server. Your alert may still be active.');
      }
    }
  }

  const firstName = user?.fullName?.trim() ? user.fullName.trim().split(' ')[0] : 'there';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greetingTitle}>Hello, {firstName}</Text>
          <Text style={styles.greetingSubtitle}>How can we help you today?</Text>
        </View>

        {/* Transient Notice Banner */}
        {banner ? (
          <Pressable onPress={() => setBanner(null)} style={styles.banner} accessibilityRole="button">
            <Text style={styles.bannerText}>{banner}</Text>
          </Pressable>
        ) : null}

        {/* SOS & Main Actions */}
        <View style={styles.mainContainer}>
          {phase === 'checking' && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Checking emergency status...</Text>
            </View>
          )}

          {(phase === 'idle' || phase === 'sending') && (
            <>
              {/* SOS Circle & Instructions */}
              <View style={styles.sosSection}>
                <Pressable
                  onPress={startCountdown}
                  disabled={phase === 'sending'}
                  accessibilityRole="button"
                  accessibilityLabel="Emergency SOS button. Tap for immediate help. Starts a 5 second cancellable countdown."
                  style={({ pressed }) => [
                    styles.sosButton,
                    pressed && styles.sosButtonPressed,
                    phase === 'sending' && styles.sosButtonDisabled,
                  ]}
                >
                  {phase === 'sending' ? (
                    <ActivityIndicator size="large" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.sosButtonText}>SOS</Text>
                  )}
                </Pressable>

                <Text style={styles.sosHeadline}>Press for help</Text>
                <Text style={styles.sosSubtext}>
                  You have 5 seconds to cancel before the emergency alert is sent.
                </Text>
              </View>

              {/* Action Cards Section */}
              <View style={styles.actionCardsSection}>
                <Text style={styles.sectionHeading}>Emergency Services</Text>

                {/* 1. Request Emergency Ambulance */}
                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    styles.ambulanceCard,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={() => navigation.navigate('AmbulanceBooking')}
                  accessibilityRole="button"
                  accessibilityLabel="Request Emergency Ambulance"
                >
                  <View style={[styles.cardIconBadge, { backgroundColor: '#FEE2E2' }]}>
                    <Text style={styles.cardIconText}>🚑</Text>
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={[styles.cardTitle, { color: colors.danger }]}>
                      Request Emergency Ambulance
                    </Text>
                    <Text style={styles.cardSubtitle}>Immediate medical transport & hospital choice</Text>
                  </View>
                </Pressable>

                {/* 2. Hybrid Fall Detection */}
                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    styles.fallCard,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={() => navigation.navigate('FallDetection')}
                  accessibilityRole="button"
                  accessibilityLabel="Hybrid Fall Detection"
                >
                  <View style={[styles.cardIconBadge, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={styles.cardIconText}>🍂</Text>
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={[styles.cardTitle, { color: '#D97706' }]}>
                      Hybrid Fall Detection
                    </Text>
                    <Text style={styles.cardSubtitle}>Automatic motion monitor & manual trigger</Text>
                  </View>
                </Pressable>

                {/* 3. 24/7 Emergency Response Center */}
                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    styles.responseCard,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={() => navigation.navigate('ResponseCenter')}
                  accessibilityRole="button"
                  accessibilityLabel="24 7 Emergency Response Center"
                >
                  <View style={[styles.cardIconBadge, { backgroundColor: '#DCFCE7' }]}>
                    <Text style={styles.cardIconText}>📞</Text>
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={[styles.cardTitle, { color: colors.success }]}>
                      24/7 Emergency Response Center
                    </Text>
                    <Text style={styles.cardSubtitle}>Call helpline desk anytime for crisis support</Text>
                  </View>
                </Pressable>

                {/* 4. Disaster & Weather Alerts */}
                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    styles.disasterCard,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={() => navigation.navigate('DisasterAlerts')}
                  accessibilityRole="button"
                  accessibilityLabel="Disaster and Weather Alerts"
                >
                  <View style={[styles.cardIconBadge, { backgroundColor: '#DBEAFE' }]}>
                    <Text style={styles.cardIconText}>📢</Text>
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={[styles.cardTitle, { color: colors.primary }]}>
                      Disaster & Weather Alerts
                    </Text>
                    <Text style={styles.cardSubtitle}>Area warnings & safety advice</Text>
                  </View>
                </Pressable>
              </View>

              {/* Family & Contacts Section */}
              <View style={styles.actionCardsSection}>
                <Text style={styles.sectionHeading}>Family & Contacts</Text>

                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    styles.familyCard,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={() => navigation.navigate('ManageFamily')}
                  accessibilityRole="button"
                  accessibilityLabel="Who Can See You"
                >
                  <View style={[styles.cardIconBadge, { backgroundColor: '#EDE9FE' }]}>
                    <Text style={styles.cardIconText}>👀</Text>
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={[styles.cardTitle, { color: '#6D28D9' }]}>Who Can See You</Text>
                    <Text style={styles.cardSubtitle}>See who has access, and invite family</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    styles.contactsCard,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={() => navigation.navigate('EmergencyContacts')}
                  accessibilityRole="button"
                  accessibilityLabel="People to Call in an Emergency"
                >
                  <View style={[styles.cardIconBadge, { backgroundColor: '#FFE4E6' }]}>
                    <Text style={styles.cardIconText}>📇</Text>
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={[styles.cardTitle, { color: '#BE123C' }]}>People to Call in an Emergency</Text>
                    <Text style={styles.cardSubtitle}>Your emergency call list, in order</Text>
                  </View>
                </Pressable>
              </View>

              {/* Caregivers Section */}
              <View style={styles.actionCardsSection}>
                <Text style={styles.sectionHeading}>Caregivers</Text>

                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    styles.caregiverSearchCard,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={() => navigation.navigate('CaregiverSearch', {})}
                  accessibilityRole="button"
                  accessibilityLabel="Find a Caregiver"
                >
                  <View style={[styles.cardIconBadge, { backgroundColor: '#F0FDFA' }]}>
                    <Text style={styles.cardIconText}>🔍</Text>
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={[styles.cardTitle, { color: '#0F766E' }]}>Find a Caregiver</Text>
                    <Text style={styles.cardSubtitle}>Search by city, language and specialization</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    styles.caregiverBookingsCard,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={() => navigation.navigate('Bookings')}
                  accessibilityRole="button"
                  accessibilityLabel="My Caregiver Bookings"
                >
                  <View style={[styles.cardIconBadge, { backgroundColor: '#FDF4FF' }]}>
                    <Text style={styles.cardIconText}>📋</Text>
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={[styles.cardTitle, { color: '#A21CAF' }]}>My Bookings</Text>
                    <Text style={styles.cardSubtitle}>Requests, confirmed and past visits</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    styles.caregiverVisitsCard,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={() => navigation.navigate('Visits')}
                  accessibilityRole="button"
                  accessibilityLabel="My Visits"
                >
                  <View style={[styles.cardIconBadge, { backgroundColor: '#ECFDF5' }]}>
                    <Text style={styles.cardIconText}>🗓️</Text>
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={[styles.cardTitle, { color: '#047857' }]}>My Visits</Text>
                    <Text style={styles.cardSubtitle}>Scheduled visits and attendance status</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    styles.carePlanCard,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={() => navigation.navigate('CarePlan', {})}
                  accessibilityRole="button"
                  accessibilityLabel="My Care Plan"
                >
                  <View style={[styles.cardIconBadge, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={styles.cardIconText}>📋</Text>
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={[styles.cardTitle, { color: '#B45309' }]}>My Care Plan</Text>
                    <Text style={styles.cardSubtitle}>Conditions, allergies, medications and notes</Text>
                  </View>
                </Pressable>
              </View>

              {/* Location & Tracking Controls */}
              <View style={styles.locationSection}>
                <Text style={styles.sectionHeading}>Location & Safety Sharing</Text>
                <LocationSharingCard
                  permission={locationPermission}
                  shared={locationShared}
                  onEnable={handleEnableLocationSharing}
                />
                <BackgroundTrackingCard
                  phase={trackingPhase}
                  onEnable={handleEnableTracking}
                  onDisable={handleDisableTracking}
                />

                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    styles.zonesCard,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={() => navigation.navigate('Geofences')}
                  accessibilityRole="button"
                  accessibilityLabel="Safe Zones"
                >
                  <View style={[styles.cardIconBadge, { backgroundColor: '#ECFEFF' }]}>
                    <Text style={styles.cardIconText}>📍</Text>
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={[styles.cardTitle, { color: '#0E7490' }]}>Safe Zones</Text>
                    <Text style={styles.cardSubtitle}>Get alerted if you leave or enter a place</Text>
                  </View>
                </Pressable>
              </View>
            </>
          )}

          {(phase === 'active' || phase === 'confirmingCancel' || phase === 'cancelling') && (
            <ActiveAlert
              alert={alert}
              phase={phase}
              onRequestCancel={() => setPhase('confirmingCancel')}
              onBackOut={() => setPhase('active')}
              onConfirmCancel={confirmCancelAlert}
            />
          )}
        </View>

        {/* Footer Sign Out Button */}
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutButtonPressed]}
            onPress={signOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out of account"
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Countdown Modal */}
      <Modal
        visible={phase === 'confirming'}
        transparent
        animationType="fade"
        onRequestClose={cancelCountdown}
      >
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <Text style={styles.overlayWarnIcon}>⚠️</Text>
            <Text style={styles.overlayTitle}>Sending Emergency SOS</Text>
            <Text style={styles.overlaySubtitle}>Alerting family & emergency contacts in:</Text>
            <View style={styles.modalCountdownCircle}>
              <Text style={styles.countdownNumber}>{countdown}</Text>
            </View>
            <Pressable
              onPress={cancelCountdown}
              accessibilityRole="button"
              accessibilityLabel="Cancel emergency alert"
              style={({ pressed }) => [styles.bigCancelButton, pressed && styles.bigCancelButtonPressed]}
            >
              <Text style={styles.bigCancelButtonText}>Cancel Alert</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ActiveAlert({ alert, phase, onRequestCancel, onBackOut, onConfirmCancel }) {
  const minutesAgo = alert ? Math.max(0, Math.round((Date.now() - new Date(alert.triggeredAt)) / 60000)) : 0;

  return (
    <View style={styles.activeCard}>
      <Text style={styles.activeIcon}>🚨</Text>
      <Text style={styles.activeTitle}>Emergency SOS Active</Text>
      <Text style={styles.activeSubtitle}>
        {minutesAgo === 0 ? 'Triggered just now' : `Triggered ${minutesAgo} minute${minutesAgo === 1 ? '' : 's'} ago`}
      </Text>
      <Text style={styles.activeDesc}>Help is on the way. Your emergency contacts have been notified.</Text>

      {phase === 'active' && (
        <Pressable
          onPress={onRequestCancel}
          accessibilityRole="button"
          style={({ pressed }) => [styles.safeButton, pressed && styles.safeButtonPressed]}
        >
          <Text style={styles.safeButtonText}>I'm safe — Cancel Alert</Text>
        </Pressable>
      )}

      {phase === 'confirmingCancel' && (
        <View style={styles.confirmRow}>
          <Text style={styles.confirmText}>Are you sure you want to cancel?</Text>
          <View style={styles.confirmButtons}>
            <Pressable
              onPress={onBackOut}
              accessibilityRole="button"
              style={({ pressed }) => [styles.confirmNoButton, pressed && styles.confirmNoButtonPressed]}
            >
              <Text style={styles.confirmNoButtonText}>Keep Alert Active</Text>
            </Pressable>
            <Pressable
              onPress={onConfirmCancel}
              accessibilityRole="button"
              style={({ pressed }) => [styles.confirmYesButton, pressed && styles.confirmYesButtonPressed]}
            >
              <Text style={styles.confirmYesButtonText}>Yes, I'm Safe</Text>
            </Pressable>
          </View>
        </View>
      )}

      {phase === 'cancelling' && <ActivityIndicator size="large" color={colors.danger} />}
    </View>
  );
}

function LocationSharingCard({ permission, shared, onEnable }) {
  if (permission === 'checking') return null;

  if (permission === 'granted') {
    return (
      <View style={styles.locationCard}>
        <View style={styles.locationHeaderRow}>
          <Text style={styles.locationCardTitle}>Emergency Location Sharing</Text>
          <View style={[styles.statusPill, { backgroundColor: shared ? '#DCFCE7' : '#FEF3C7' }]}>
            <Text style={[styles.statusPillText, { color: shared ? '#065F46' : '#92400E' }]}>
              {shared ? '● ON' : '○ Pending'}
            </Text>
          </View>
        </View>
        <Text style={styles.locationText}>
          {shared
            ? 'Location sharing is active. Your coordinates will be attached automatically if you press SOS.'
            : 'Current location is temporarily unavailable. ElderCare will try again automatically on next fix.'}
        </Text>
      </View>
    );
  }

  if (permission === 'denied') {
    return (
      <View style={styles.locationCard}>
        <View style={styles.locationHeaderRow}>
          <Text style={styles.locationCardTitle}>Emergency Location Sharing</Text>
          <View style={[styles.statusPill, { backgroundColor: '#FEE2E2' }]}>
            <Text style={[styles.statusPillText, { color: colors.danger }]}>○ OFF</Text>
          </View>
        </View>
        <Text style={styles.locationText}>
          Location permission is turned off. SOS button will still work, but location won't be attached.
        </Text>
        <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button">
          <Text style={styles.locationLink}>Open Settings to enable location</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.locationCard}>
      <Text style={styles.locationCardTitle}>Emergency Location Sharing</Text>
      <Text style={styles.locationText}>
        Allow ElderCare to attach your GPS coordinates when you send an emergency SOS.
      </Text>
      <Pressable onPress={onEnable} accessibilityRole="button">
        <Text style={styles.locationLink}>Enable Location Sharing</Text>
      </Pressable>
    </View>
  );
}

function BackgroundTrackingCard({ phase, onEnable, onDisable }) {
  if (phase === 'checking') return null;

  if (phase === 'enabling') {
    return (
      <View style={styles.locationCard}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (phase === 'on') {
    return (
      <View style={styles.locationCard}>
        <View style={styles.locationHeaderRow}>
          <Text style={styles.locationCardTitle}>Continuous Location Tracking</Text>
          <View style={[styles.statusPill, { backgroundColor: '#DCFCE7' }]}>
            <Text style={[styles.statusPillText, { color: '#065F46' }]}>● ACTIVE</Text>
          </View>
        </View>
        <Text style={styles.locationText}>
          Allows your family to view your location even when ElderCare is closed. A persistent status notification stays on your phone.
        </Text>
        <Pressable onPress={onDisable} accessibilityRole="button">
          <Text style={[styles.locationLink, { color: colors.danger }]}>Turn Off Continuous Tracking</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'background_denied' || phase === 'foreground_denied') {
    return (
      <View style={styles.locationCard}>
        <View style={styles.locationHeaderRow}>
          <Text style={styles.locationCardTitle}>Continuous Location Tracking</Text>
          <View style={[styles.statusPill, { backgroundColor: '#FEE2E2' }]}>
            <Text style={[styles.statusPillText, { color: colors.danger }]}>○ OFF</Text>
          </View>
        </View>
        <Text style={styles.locationText}>
          Continuous tracking requires location permission set to "Allow all the time" in your device system Settings.
        </Text>
        <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button">
          <Text style={styles.locationLink}>Open Settings to enable</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.locationCard}>
      <View style={styles.locationHeaderRow}>
        <Text style={styles.locationCardTitle}>Continuous Location Tracking</Text>
        <View style={[styles.statusPill, { backgroundColor: '#F3F4F6' }]}>
          <Text style={[styles.statusPillText, { color: colors.textMuted }]}>○ OFF</Text>
        </View>
      </View>
      <Text style={styles.locationText}>
        Allows family members to view your location in real-time even when ElderCare is not open.
      </Text>
      <Pressable onPress={onEnable} accessibilityRole="button">
        <Text style={styles.locationLink}>Turn On Continuous Tracking</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.lg,
  },
  header: {
    gap: 4,
  },
  greetingTitle: {
    fontSize: type.heading + 4,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.5,
  },
  greetingSubtitle: {
    fontSize: type.body,
    color: colors.textMuted,
    fontWeight: '500',
  },
  banner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 12,
    padding: spacing.md,
  },
  bannerText: {
    fontSize: type.body - 1,
    color: '#92400E',
    fontWeight: '700',
    textAlign: 'center',
  },
  mainContainer: {
    gap: spacing.xl,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: type.body,
    color: colors.textMuted,
  },
  sosSection: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sosButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
    marginVertical: 4,
  },
  sosButtonPressed: {
    backgroundColor: '#991B1B',
    transform: [{ scale: 0.96 }],
  },
  sosButtonDisabled: {
    opacity: 0.8,
  },
  sosButtonText: {
    fontSize: 52,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  sosHeadline: {
    fontSize: type.heading,
    fontWeight: '800',
    color: colors.text,
  },
  sosSubtext: {
    fontSize: type.body - 1,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 290,
    lineHeight: 21,
  },
  actionCardsSection: {
    gap: spacing.md,
  },
  sectionHeading: {
    fontSize: type.heading - 2,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 2,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  actionCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  ambulanceCard: {
    backgroundColor: '#FEF2F2',
    borderColor: colors.danger,
  },
  fallCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#D97706',
  },
  responseCard: {
    backgroundColor: '#F0FDF4',
    borderColor: colors.success,
  },
  disasterCard: {
    backgroundColor: '#EFF6FF',
    borderColor: colors.primary,
  },
  familyCard: {
    backgroundColor: '#F5F3FF',
    borderColor: '#6D28D9',
  },
  contactsCard: {
    backgroundColor: '#FFF1F2',
    borderColor: '#BE123C',
  },
  zonesCard: {
    backgroundColor: '#ECFEFF',
    borderColor: '#0E7490',
  },
  caregiverSearchCard: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0F766E',
  },
  caregiverBookingsCard: {
    backgroundColor: '#FDF4FF',
    borderColor: '#A21CAF',
  },
  caregiverVisitsCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#047857',
  },
  carePlanCard: {
    backgroundColor: '#FEF3C7',
    borderColor: '#B45309',
  },
  cardIconBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconText: {
    fontSize: 22,
  },
  cardTextContainer: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: type.body,
    fontWeight: '800',
  },
  cardSubtitle: {
    fontSize: type.small,
    color: colors.textMuted,
  },
  locationSection: {
    gap: spacing.md,
  },
  locationCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  locationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  locationCardTitle: {
    fontSize: type.body - 1,
    fontWeight: '800',
    color: colors.text,
  },
  statusPill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: type.small - 1,
    fontWeight: '800',
  },
  locationText: {
    fontSize: type.small + 1,
    color: colors.textMuted,
    lineHeight: 20,
  },
  locationLink: {
    fontSize: type.body - 1,
    color: colors.primary,
    fontWeight: '800',
    marginTop: 4,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  signOutButton: {
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  signOutButtonPressed: {
    backgroundColor: colors.background,
  },
  signOutText: {
    fontSize: type.body - 1,
    color: colors.danger,
    fontWeight: '700',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  overlayCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
    maxWidth: 340,
  },
  overlayWarnIcon: {
    fontSize: 48,
  },
  overlayTitle: {
    fontSize: type.heading + 2,
    fontWeight: '900',
    color: colors.danger,
    textAlign: 'center',
  },
  overlaySubtitle: {
    fontSize: type.body - 1,
    color: colors.textMuted,
    textAlign: 'center',
  },
  modalCountdownCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FEF2F2',
    borderWidth: 3,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  countdownNumber: {
    fontSize: 54,
    fontWeight: '900',
    color: colors.danger,
  },
  bigCancelButton: {
    backgroundColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
  },
  bigCancelButtonPressed: {
    backgroundColor: '#D1D5DB',
  },
  bigCancelButtonText: {
    fontSize: type.body + 1,
    fontWeight: '800',
    color: colors.text,
  },
  activeCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderColor: colors.danger,
    borderRadius: 20,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  activeIcon: {
    fontSize: 48,
  },
  activeTitle: {
    fontSize: type.heading + 2,
    fontWeight: '900',
    color: colors.danger,
    textAlign: 'center',
  },
  activeSubtitle: {
    fontSize: type.body,
    fontWeight: '700',
    color: colors.text,
  },
  activeDesc: {
    fontSize: type.body - 1,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  safeButton: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    width: '100%',
    alignItems: 'center',
  },
  safeButtonPressed: {
    backgroundColor: colors.background,
  },
  safeButtonText: {
    fontSize: type.body,
    fontWeight: '800',
    color: colors.text,
  },
  confirmRow: {
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
  },
  confirmText: {
    fontSize: type.body,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  confirmButtons: {
    gap: spacing.sm,
    width: '100%',
  },
  confirmNoButton: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmNoButtonPressed: {
    backgroundColor: colors.background,
  },
  confirmNoButtonText: {
    fontSize: type.body - 1,
    fontWeight: '700',
    color: colors.text,
  },
  confirmYesButton: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmYesButtonPressed: {
    backgroundColor: '#991B1B',
  },
  confirmYesButtonText: {
    fontSize: type.body - 1,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
