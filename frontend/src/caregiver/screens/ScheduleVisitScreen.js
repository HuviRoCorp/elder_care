// ============================================================================
// Schedule Visit — creates a slot from a confirmed booking
//
// Reached only from a confirmed booking row (BookingsScreen, CaregiverBookingsScreen)
// — createSchedule (schedules.service.js) does not itself check the booking's
// status, so this screen is the only gate keeping scheduling to confirmed
// bookings; see BUILD_LOG.md.
//
// endTime <= startTime is rejected both here and by the backend
// (validateCreateSchedule, caregiver/services/validate.js) — checked
// client-side first so a same-day-but-backwards or accidental overnight slot
// (e.g. 22:00-06:00) gets a clear message before the request ever goes out,
// rather than a generic 400. Visits spanning midnight are not supported at
// all right now — the fields are two times on one calendar date, and there
// is no second date for an end time to roll into. Accepted as a known
// limitation, not fixed here; see BUILD_LOG.md.
//
// 409 schedule_conflict (the caregiver already has an overlapping slot that
// day) is caught separately from the generic 400 validation-error path so
// the message names the actual problem instead of "please check the
// highlighted fields."
// ============================================================================

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createSchedule } from '../api/schedules';
import { ApiError } from '../../shared/api/client';
import { colors, spacing, type } from '../../shared/ui/theme';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function ScheduleVisitScreen({ navigation, route }) {
  const { bookingId, caregiverId, caregiverName, elderlyUserId, elderlyName } = route.params;

  const [visitDate, setVisitDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setFormError(null);

    const errors = {};
    if (!DATE_RE.test(visitDate.trim())) errors.visitDate = 'Enter a date as YYYY-MM-DD, e.g. 2026-09-15.';
    if (!TIME_RE.test(startTime.trim())) errors.startTime = 'Enter a time as HH:MM, e.g. 09:00.';
    if (!TIME_RE.test(endTime.trim())) errors.endTime = 'Enter a time as HH:MM, e.g. 11:00.';
    if (!errors.startTime && !errors.endTime && endTime.trim() <= startTime.trim()) {
      errors.endTime = 'End time must be after start time. Visits spanning midnight are not supported yet.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Please check the highlighted fields.');
      return;
    }
    setFieldErrors({});

    setBusy(true);
    try {
      await createSchedule({
        bookingId,
        caregiverId,
        elderlyUserId,
        visitDate: visitDate.trim(),
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        notes: notes.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409 && err.code === 'schedule_conflict') {
          setFormError(`${caregiverName} already has a visit scheduled that overlaps this time. Pick a different time.`);
        } else if (err.code === 'validation_failed' && Array.isArray(err.details)) {
          const mapped = {};
          err.details.forEach((d) => {
            if (d.field) mapped[d.field] = d.message;
          });
          setFieldErrors(mapped);
          setFormError('Please check the highlighted fields.');
        } else if (err.code === 'not_permitted') {
          setFormError("You don't have permission to schedule a visit for this booking.");
        } else {
          setFormError(err.message || 'Could not schedule this visit.');
        }
      } else {
        setFormError('Could not reach the server. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Visit Scheduled</Text>
          <Text style={styles.subtitle}>
            {caregiverName}'s visit for {elderlyName || 'this booking'} has been added to the schedule.
          </Text>
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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.backRow}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.title}>Schedule Visit</Text>
          <Text style={styles.subtitle}>
            {caregiverName} for {elderlyName || 'this booking'}.
          </Text>

          {formError ? (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Visit Date</Text>
            <TextInput
              style={[styles.input, fieldErrors.visitDate && styles.inputError]}
              value={visitDate}
              onChangeText={setVisitDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="Visit date"
            />
            {fieldErrors.visitDate ? <Text style={styles.fieldErrorText}>{fieldErrors.visitDate}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Start Time</Text>
            <TextInput
              style={[styles.input, fieldErrors.startTime && styles.inputError]}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="HH:MM, e.g. 09:00"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="Start time"
            />
            {fieldErrors.startTime ? <Text style={styles.fieldErrorText}>{fieldErrors.startTime}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>End Time</Text>
            <TextInput
              style={[styles.input, fieldErrors.endTime && styles.inputError]}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="HH:MM, e.g. 11:00"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="End time"
            />
            {fieldErrors.endTime ? <Text style={styles.fieldErrorText}>{fieldErrors.endTime}</Text> : null}
            <Text style={styles.inputHint}>Same-day visits only — must end after it starts.</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything the caregiver should know about this visit."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              accessibilityLabel="Notes"
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
            onPress={handleSubmit}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Schedule Visit</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  inputHint: { fontSize: type.small, color: colors.textMuted },
  fieldErrorText: { fontSize: type.small, color: colors.danger, fontWeight: '600' },
  submitButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: spacing.sm },
  submitButtonPressed: { backgroundColor: '#1D4ED8' },
  submitButtonText: { fontSize: type.body, fontWeight: '800', color: '#FFFFFF' },
});
