// ============================================================================
// Book a Caregiver — elderly and family, shared screen
//
// elderlyUserId always required by POST /caregiver/bookings — for an
// elderly caller booking themselves, that's their own account id (no
// self-inference server-side the way some emergency endpoints have; this
// screen supplies it explicitly from useAuth()). For a family caller it's
// whatever GeofencesScreen-style params carried it here from Search/Detail.
//
// No date-picker library exists anywhere in this app (checked before
// building this) — startDate/endDate are plain YYYY-MM-DD text fields with
// the same client-side format check the backend applies, not a new
// dependency pulled in for one screen.
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

import { createBooking } from '../api/bookings';
import { ApiError, NetworkError } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthContext';
import { colors, spacing, type } from '../../shared/ui/theme';
import { RECURRENCE_OPTIONS } from '../bookingFormat';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function BookingFormScreen({ navigation, route }) {
  const { caregiverId, caregiverName, elderlyUserId, elderlyName } = route.params;
  const { user } = useAuth();
  const bookingElderlyUserId = elderlyUserId || user.id;

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [recurrence, setRecurrence] = useState('one_time');
  const [hoursPerVisit, setHoursPerVisit] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setFormError(null);

    const errors = {};
    if (!DATE_RE.test(startDate.trim())) errors.startDate = 'Enter a date as YYYY-MM-DD, e.g. 2026-09-15.';
    if (endDate.trim() && !DATE_RE.test(endDate.trim())) errors.endDate = 'Enter a date as YYYY-MM-DD, e.g. 2026-09-30.';
    if (!errors.startDate && !errors.endDate && endDate.trim() && endDate.trim() < startDate.trim()) {
      errors.endDate = 'End date cannot be before the start date.';
    }
    if (hoursPerVisit.trim()) {
      const n = Number(hoursPerVisit);
      if (!Number.isFinite(n) || n <= 0 || n > 24) errors.hoursPerVisit = 'Enter hours between 0 and 24.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Please check the highlighted fields.');
      return;
    }
    setFieldErrors({});

    setBusy(true);
    try {
      await createBooking({
        elderlyUserId: bookingElderlyUserId,
        caregiverId,
        startDate: startDate.trim(),
        endDate: endDate.trim() || undefined,
        recurrence,
        hoursPerVisit: hoursPerVisit.trim() ? Number(hoursPerVisit) : undefined,
        specialInstructions: specialInstructions.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'validation_failed' && Array.isArray(err.details)) {
          const mapped = {};
          err.details.forEach((d) => {
            if (d.field) mapped[d.field] = d.message;
          });
          setFieldErrors(mapped);
          setFormError('Please check the highlighted fields.');
        } else if (err.code === 'not_permitted') {
          setFormError("You don't have permission to book a caregiver for this account.");
        } else {
          setFormError(err.message || 'Could not create this booking.');
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
          <Text style={styles.title}>Request Sent</Text>
          <Text style={styles.subtitle}>
            {caregiverName} will confirm or decline your request. You can check the status any time in My Bookings.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
            onPress={() => navigation.navigate('Bookings')}
            accessibilityRole="button"
          >
            <Text style={styles.submitButtonText}>Go to My Bookings</Text>
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

          <Text style={styles.title}>Request {caregiverName}</Text>
          <Text style={styles.subtitle}>
            {elderlyName ? `Booking for ${elderlyName}.` : 'This sends a request — the caregiver still needs to confirm.'}
          </Text>

          {formError ? (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Start Date</Text>
            <TextInput
              style={[styles.input, fieldErrors.startDate && styles.inputError]}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="Start date"
            />
            {fieldErrors.startDate ? <Text style={styles.fieldErrorText}>{fieldErrors.startDate}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>End Date (Optional)</Text>
            <TextInput
              style={[styles.input, fieldErrors.endDate && styles.inputError]}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="End date"
            />
            {fieldErrors.endDate ? <Text style={styles.fieldErrorText}>{fieldErrors.endDate}</Text> : null}
            <Text style={styles.inputHint}>Leave blank for an ongoing arrangement.</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>How often?</Text>
            <View style={styles.recurrenceOptions}>
              {RECURRENCE_OPTIONS.map((opt) => {
                const selected = recurrence === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setRecurrence(opt.value)}
                    accessibilityRole="button"
                    style={[styles.recurrenceOption, selected && styles.recurrenceOptionSelected]}
                  >
                    <Text style={[styles.recurrenceOptionText, selected && styles.recurrenceOptionTextSelected]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Hours Per Visit (Optional)</Text>
            <TextInput
              style={[styles.input, fieldErrors.hoursPerVisit && styles.inputError]}
              value={hoursPerVisit}
              onChangeText={setHoursPerVisit}
              placeholder="e.g. 4"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              accessibilityLabel="Hours per visit"
            />
            {fieldErrors.hoursPerVisit ? <Text style={styles.fieldErrorText}>{fieldErrors.hoursPerVisit}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Special Instructions (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={specialInstructions}
              onChangeText={setSpecialInstructions}
              placeholder="Anything the caregiver should know."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              accessibilityLabel="Special instructions"
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
            onPress={handleSubmit}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Send Request</Text>}
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
  recurrenceOptions: { gap: spacing.sm },
  recurrenceOption: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  recurrenceOptionSelected: { borderColor: colors.primary, backgroundColor: '#EFF6FF' },
  recurrenceOptionText: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  recurrenceOptionTextSelected: { color: colors.primary },
  submitButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: spacing.sm },
  submitButtonPressed: { backgroundColor: '#1D4ED8' },
  submitButtonText: { fontSize: type.body, fontWeight: '800', color: '#FFFFFF' },
});
