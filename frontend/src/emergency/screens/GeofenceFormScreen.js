// ============================================================================
// Safe Zone form — create and edit, one screen
//
// Centre-setting deliberately branches on who is filling this in, not one
// shared "use current location" button:
//
//   - Elderly caller (elderlyUserId param is null/absent): captures the
//     device's own GPS via captureCurrentLocation, same capture path SOS and
//     mount-time sharing already use. They are normally standing in the zone
//     they're defining, so this is both the easiest and the most accurate
//     way to set it.
//   - Family caller (elderlyUserId present): their own phone's GPS is not
//     the elderly person's location — a family member in another city would
//     silently centre the zone on themselves. Instead this pulls the elderly
//     user's most recent stored reading via GET /emergency/locations/latest,
//     labelled "their last known location" with the reading's age shown
//     prominently (a 2-hour-old fix and a 3-day-old one imply very different
//     confidence in the resulting zone). No recent reading at all blocks
//     zone creation outright rather than guessing.
//
// No map — react-native-maps needs a Google Maps API key and an unresolved
// billing decision. Everything here works without one; a map arrives later
// as a preview on these same screens, not a rewrite.
//
// Radius is three plain-language choices (RADIUS_OPTIONS, geofenceFormat.js)
// instead of a number field, matching what the elderly user actually thinks
// in ("just this building") rather than metres.
//
// A successful create shows the recent-activity sanity check inline right
// away (GET /emergency/geofences/:id/history) — the same panel
// GeofencesScreen's "Check recent activity" shows later, via
// summarizeHistory so the wording never drifts between the two.
// ============================================================================

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createGeofence, updateGeofence, getGeofenceHistory } from '../api/geofences';
import { getLatestLocation } from '../api/locations';
import { captureCurrentLocation } from '../../shared/location/captureLocation';
import { ApiError, NetworkError } from '../../shared/api/client';
import { colors, spacing, type } from '../../shared/ui/theme';
import { RADIUS_OPTIONS, formatAge, summarizeHistory } from '../geofenceFormat';

// Matches FamilyHomeScreen's APPROXIMATE_STALE_MINUTES — the point at which
// a reading is old enough that someone may genuinely have moved since, not
// just GPS jitter.
const STALE_MINUTES = 30;

export function GeofenceFormScreen({ navigation, route }) {
  const { mode, zone, elderlyUserId, elderlyName } = route.params;
  const isFamilyCaller = !!elderlyUserId;
  const isEdit = mode === 'edit';

  const [name, setName] = useState(zone?.name || '');
  const [radiusMeters, setRadiusMeters] = useState(zone?.radiusMeters ?? null);
  const [alertOnExit, setAlertOnExit] = useState(zone ? zone.alertOnExit : true);
  const [alertOnEnter, setAlertOnEnter] = useState(zone ? zone.alertOnEnter : false);

  const [centre, setCentre] = useState(
    zone
      ? {
          latitude: Number(zone.centerLatitude),
          longitude: Number(zone.centerLongitude),
          accuracyMeters: null,
          recordedAt: null,
          source: 'existing',
        }
      : null
  );
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState(null);

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const [createdZone, setCreatedZone] = useState(null);
  const [historyState, setHistoryState] = useState(null);

  async function handleCapture() {
    setCapturing(true);
    setCaptureError(null);

    if (isFamilyCaller) {
      try {
        const { location } = await getLatestLocation({ elderlyUserId });
        if (!location) {
          setCaptureError(
            `There's no recent location for ${elderlyName || 'them'} yet. Ask them to open ElderCare with location sharing on, then try again.`
          );
        } else {
          setCentre({
            latitude: Number(location.latitude),
            longitude: Number(location.longitude),
            accuracyMeters: location.accuracyMeters != null ? Number(location.accuracyMeters) : null,
            recordedAt: location.recordedAt,
            source: 'family_latest',
          });
        }
      } catch (err) {
        setCaptureError(
          err instanceof NetworkError ? 'Could not reach the server. Please try again.' : "Could not get their last known location."
        );
      }
    } else {
      const loc = await captureCurrentLocation({ timeoutMs: 8000 });
      if (!loc) {
        setCaptureError('Could not get your location. Make sure Location is turned on for ElderCare, then try again.');
      } else {
        setCentre({
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracyMeters: loc.accuracyMeters,
          recordedAt: loc.recordedAt,
          source: 'device',
        });
      }
    }

    setCapturing(false);
  }

  function applyServerErrors(err) {
    if (err instanceof ApiError) {
      if (err.code === 'validation_failed' && Array.isArray(err.details)) {
        const mapped = {};
        err.details.forEach((d) => {
          if (d.field) mapped[d.field] = d.message;
        });
        setFieldErrors(mapped);
        setFormError('Please check the highlighted fields.');
      } else if (err.code === 'not_permitted') {
        setFormError("You don't have permission to do that.");
      } else if (err.code === 'geofence_not_found') {
        setFormError('This zone no longer exists.');
      } else {
        setFormError(err.message || 'Could not save this zone.');
      }
    } else {
      setFormError('Could not reach the server. Please try again.');
    }
  }

  async function loadHistory(zoneId) {
    setHistoryState({ loading: true });
    try {
      const { history } = await getGeofenceHistory(zoneId, { days: 3 });
      setHistoryState({ loading: false, history });
    } catch {
      setHistoryState({ loading: false, error: true });
    }
  }

  async function handleSubmit() {
    setFormError(null);

    const errors = {};
    if (!name.trim()) errors.name = 'Give this zone a name.';
    if (!centre) errors.centre = isFamilyCaller ? 'Get their last known location first.' : 'Set your current location first.';
    if (!radiusMeters) errors.radius = 'Choose an area size.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Please check the highlighted fields.');
      return;
    }
    setFieldErrors({});

    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        centerLatitude: centre.latitude,
        centerLongitude: centre.longitude,
        radiusMeters,
        alertOnExit,
        alertOnEnter,
        ...(isFamilyCaller ? { elderlyUserId } : {}),
      };

      if (isEdit) {
        await updateGeofence(zone.id, body);
        navigation.goBack();
        return;
      }

      const { geofence } = await createGeofence(body);
      setCreatedZone(geofence);
      loadHistory(geofence.id);
    } catch (err) {
      applyServerErrors(err);
    } finally {
      setBusy(false);
    }
  }

  if (createdZone) {
    const summary = historyState?.history ? summarizeHistory(historyState.history) : null;
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Zone Saved</Text>
          <Text style={styles.subtitle}>"{createdZone.name}" is set up.</Text>

          <View style={styles.card}>
            <Text style={styles.cardHeading}>Does this look right?</Text>
            {historyState?.loading && <ActivityIndicator color={colors.primary} style={styles.spinner} />}
            {historyState?.error && (
              <Text style={styles.historyError}>Could not check recent activity for this zone. You can check again later from the zone list.</Text>
            )}
            {summary && (
              <>
                <Text style={styles.historyHeadline}>{summary.headline}</Text>
                {summary.currentlyText && <Text style={styles.historyCurrently}>{summary.currentlyText}</Text>}
                <Text style={styles.historyDetail}>{summary.detail}</Text>
              </>
            )}
          </View>

          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
          >
            <Text style={styles.submitButtonText}>Done</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const captureButtonLabel = isFamilyCaller ? 'Use their last known location' : 'Use my current location as the centre';
  const ageMinutes = centre?.recordedAt ? Math.round((Date.now() - new Date(centre.recordedAt).getTime()) / 60000) : null;
  const isStale = ageMinutes != null && ageMinutes > STALE_MINUTES;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.backRow}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.title}>
            {isEdit ? `Edit ${zone.name}` : isFamilyCaller ? `Add a Safe Zone for ${elderlyName || 'them'}` : 'Add a Safe Zone'}
          </Text>

          {formError ? (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={[styles.input, fieldErrors.name && styles.inputError]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Home, Daughter's House"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              accessibilityLabel="Zone name"
            />
            {fieldErrors.name ? <Text style={styles.fieldErrorText}>{fieldErrors.name}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Location</Text>

            <Pressable
              onPress={handleCapture}
              disabled={capturing}
              accessibilityRole="button"
              style={({ pressed }) => [styles.captureButton, pressed && styles.captureButtonPressed]}
            >
              {capturing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.captureButtonText}>{centre ? 'Update Location' : captureButtonLabel}</Text>
              )}
            </Pressable>

            {captureError ? <Text style={styles.fieldErrorText}>{captureError}</Text> : null}
            {fieldErrors.centre ? <Text style={styles.fieldErrorText}>{fieldErrors.centre}</Text> : null}

            {centre && centre.source === 'family_latest' && (
              <View style={[styles.centreResult, isStale && styles.centreResultStale]}>
                <Text style={[styles.centreAgeHeadline, isStale && styles.centreAgeHeadlineStale]}>
                  Their last known location, from {formatAge(centre.recordedAt)}.
                </Text>
                {isStale && <Text style={styles.centreStaleWarning}>This may not be where they are right now.</Text>}
                <Text style={styles.centreCoords}>
                  {centre.latitude.toFixed(5)}, {centre.longitude.toFixed(5)}
                  {centre.accuracyMeters != null ? ` · accurate to about ${Math.round(centre.accuracyMeters)} m` : ''}
                </Text>
              </View>
            )}

            {centre && centre.source === 'device' && (
              <View style={styles.centreResult}>
                <Text style={styles.centreAgeHeadline}>
                  {centre.accuracyMeters != null
                    ? `Location set — accurate to about ${Math.round(centre.accuracyMeters)} metres.`
                    : 'Location set.'}
                </Text>
                <Text style={styles.centreCoords}>
                  {centre.latitude.toFixed(5)}, {centre.longitude.toFixed(5)}
                </Text>
              </View>
            )}

            {centre && centre.source === 'existing' && (
              <View style={styles.centreResult}>
                <Text style={styles.centreAgeHeadline}>Using the zone's current location.</Text>
                <Text style={styles.centreCoords}>
                  {centre.latitude.toFixed(5)}, {centre.longitude.toFixed(5)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>How big an area?</Text>
            <View style={styles.radiusOptions}>
              {RADIUS_OPTIONS.map((opt) => {
                const selected = radiusMeters === opt.meters;
                return (
                  <Pressable
                    key={opt.meters}
                    onPress={() => setRadiusMeters(opt.meters)}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                    style={[styles.radiusOption, selected && styles.radiusOptionSelected]}
                  >
                    <Text style={[styles.radiusOptionLabel, selected && styles.radiusOptionLabelSelected]}>{opt.label}</Text>
                    <Text style={[styles.radiusOptionMeters, selected && styles.radiusOptionMetersSelected]}>{opt.meters} m</Text>
                  </Pressable>
                );
              })}
            </View>
            {fieldErrors.radius ? <Text style={styles.fieldErrorText}>{fieldErrors.radius}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Alerts</Text>
            <SwitchRow
              label={isFamilyCaller ? `Tell you if ${elderlyName || 'they'} leave this zone` : 'Tell family if I leave this zone'}
              value={alertOnExit}
              onValueChange={setAlertOnExit}
            />
            <SwitchRow
              label={isFamilyCaller ? `Tell you if ${elderlyName || 'they'} enter this zone` : 'Tell family if I enter this zone'}
              value={alertOnEnter}
              onValueChange={setAlertOnEnter}
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
            onPress={handleSubmit}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitButtonText}>{isEdit ? 'Save Changes' : 'Save Zone'}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SwitchRow({ label, value, onValueChange }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  backRow: { paddingVertical: spacing.xs },
  backText: { fontSize: type.body, color: colors.primary, fontWeight: '700' },
  title: { fontSize: type.title, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: type.body, color: colors.textMuted, lineHeight: 23 },
  formErrorBanner: { backgroundColor: '#FEE2E2', borderRadius: 10, padding: spacing.sm },
  formErrorText: { fontSize: type.small + 1, color: colors.danger, fontWeight: '700' },
  inputGroup: { gap: spacing.xs },
  label: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: type.body,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  fieldErrorText: { fontSize: type.small, color: colors.danger, fontWeight: '600' },
  captureButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  captureButtonPressed: { backgroundColor: '#1D4ED8' },
  captureButtonText: { fontSize: type.body - 1, fontWeight: '800', color: '#FFFFFF' },
  centreResult: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    gap: 4,
  },
  centreResultStale: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warning,
  },
  centreAgeHeadline: { fontSize: type.body - 1, fontWeight: '800', color: colors.text },
  centreAgeHeadlineStale: { color: colors.warning },
  centreStaleWarning: { fontSize: type.small + 1, color: colors.warning, fontWeight: '700' },
  centreCoords: { fontSize: type.small, color: colors.textMuted },
  radiusOptions: { gap: spacing.sm },
  radiusOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  radiusOptionSelected: { borderColor: colors.primary, backgroundColor: '#EFF6FF' },
  radiusOptionLabel: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  radiusOptionLabelSelected: { color: colors.primary },
  radiusOptionMeters: { fontSize: type.small, color: colors.textMuted },
  radiusOptionMetersSelected: { color: colors.primary },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  switchLabel: { flex: 1, fontSize: type.body - 1, color: colors.text, fontWeight: '600', paddingRight: spacing.md },
  submitButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: spacing.sm },
  submitButtonPressed: { backgroundColor: '#1D4ED8' },
  submitButtonText: { fontSize: type.body, fontWeight: '800', color: '#FFFFFF' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeading: { fontSize: type.heading, fontWeight: '800', color: colors.text },
  spinner: { marginVertical: spacing.md },
  historyHeadline: { fontSize: type.body - 1, fontWeight: '800', color: colors.text, lineHeight: 22 },
  historyCurrently: { fontSize: type.body - 1, fontWeight: '700', color: colors.success },
  historyDetail: { fontSize: type.small, color: colors.textMuted },
  historyError: { fontSize: type.body - 1, color: colors.danger, fontWeight: '600' },
});
