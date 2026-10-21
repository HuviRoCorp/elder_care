// ============================================================================
// Log Activity Report — caregiver only, one visit
//
// reportDate is fixed to the visit's own date (route param, not editable) —
// uq_report_per_day (caregiver_id, elderly_user_id, report_date) is what
// actually ties a report to "this visit" server-side, since there is no
// scheduleId uniqueness or query filter. Editing the date here would let the
// form silently misfile the report against a different day.
//
// A second visit with the same caregiver and elderly user on the same day
// cannot get its own report — the constraint is per day, not per visit. Real
// data-model limitation, not a UI choice; see BUILD_LOG.md. 409
// duplicate_report is caught here and offers "View Existing Report" instead
// of a dead-end error.
//
// vitals is not collected — no structured input exists for the JSONB field,
// same treatment as photoUrls. Reports built here are qualitative only. See
// BUILD_LOG.md.
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

import { createActivityReport } from '../api/reports';
import { ApiError, NetworkError } from '../../shared/api/client';
import { colors, spacing, type } from '../../shared/ui/theme';
import { formatDate } from '../bookingFormat';

export function ReportFormScreen({ navigation, route }) {
  const { scheduleId, caregiverId, elderlyUserId, elderlyName, reportDate } = route.params;

  const [summary, setSummary] = useState('');
  const [mealsTaken, setMealsTaken] = useState('');
  const [medicationsGiven, setMedicationsGiven] = useState('');
  const [mood, setMood] = useState('');
  const [sleepHours, setSleepHours] = useState('');
  const [concerns, setConcerns] = useState('');

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [duplicateBanner, setDuplicateBanner] = useState(false);

  async function handleSubmit() {
    setFormError(null);
    setDuplicateBanner(false);

    const errors = {};
    const trimmedSummary = summary.trim();
    if (!trimmedSummary) errors.summary = 'Summary is required.';
    if (sleepHours.trim()) {
      const n = Number(sleepHours);
      if (!Number.isFinite(n) || n < 0 || n > 24) errors.sleepHours = 'Enter hours between 0 and 24.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Please check the highlighted fields.');
      return;
    }
    setFieldErrors({});

    setBusy(true);
    try {
      await createActivityReport({
        scheduleId,
        caregiverId,
        elderlyUserId,
        reportDate,
        summary: trimmedSummary,
        mealsTaken: mealsTaken.trim() || undefined,
        medicationsGiven: medicationsGiven.trim() || undefined,
        mood: mood.trim() || undefined,
        sleepHours: sleepHours.trim() ? Number(sleepHours) : undefined,
        concerns: concerns.trim() || undefined,
      });
      navigation.goBack();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409 && err.code === 'duplicate_report') {
          setDuplicateBanner(true);
        } else if (err.code === 'validation_failed' && Array.isArray(err.details)) {
          const mapped = {};
          err.details.forEach((d) => {
            if (d.field) mapped[d.field] = d.message;
          });
          setFieldErrors(mapped);
          setFormError('Please check the highlighted fields.');
        } else if (err.code === 'not_permitted') {
          setFormError("You don't have permission to submit a report as this caregiver.");
        } else {
          setFormError(err.message || 'Could not save this report.');
        }
      } else {
        setFormError('Could not reach the server. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.backRow}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.title}>Log Activity Report</Text>
          <Text style={styles.subtitle}>
            {elderlyName ? `${elderlyName} — ` : ''}
            {formatDate(reportDate)}
          </Text>

          {duplicateBanner ? (
            <View style={styles.duplicateBanner}>
              <Text style={styles.duplicateText}>
                You've already logged a report for {elderlyName || 'this elderly user'} on {formatDate(reportDate)}.
              </Text>
              <Pressable
                onPress={() =>
                  navigation.replace('Report', { elderlyUserId, caregiverId, elderlyName, visitDate: reportDate })
                }
                accessibilityRole="button"
                style={styles.viewExistingButton}
              >
                <Text style={styles.viewExistingButtonText}>View Existing Report</Text>
              </Pressable>
            </View>
          ) : null}

          {formError ? (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Summary</Text>
            <TextInput
              style={[styles.input, styles.textArea, fieldErrors.summary && styles.inputError]}
              value={summary}
              onChangeText={setSummary}
              placeholder="What happened during the visit."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              accessibilityLabel="Summary"
            />
            {fieldErrors.summary ? <Text style={styles.fieldErrorText}>{fieldErrors.summary}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Meals Taken (Optional)</Text>
            <TextInput
              style={styles.input}
              value={mealsTaken}
              onChangeText={setMealsTaken}
              placeholder="e.g. Breakfast and lunch, light dinner"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Meals taken"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Medications Given (Optional)</Text>
            <TextInput
              style={styles.input}
              value={medicationsGiven}
              onChangeText={setMedicationsGiven}
              placeholder="e.g. Metformin at 9am and 6pm"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Medications given"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mood (Optional)</Text>
            <TextInput
              style={styles.input}
              value={mood}
              onChangeText={setMood}
              placeholder="e.g. Cheerful, tired, anxious"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Mood"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Sleep Hours (Optional)</Text>
            <TextInput
              style={[styles.input, fieldErrors.sleepHours && styles.inputError]}
              value={sleepHours}
              onChangeText={setSleepHours}
              placeholder="e.g. 7"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              accessibilityLabel="Sleep hours"
            />
            {fieldErrors.sleepHours ? <Text style={styles.fieldErrorText}>{fieldErrors.sleepHours}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Concerns (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={concerns}
              onChangeText={setConcerns}
              placeholder="Anything that should be flagged."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              accessibilityLabel="Concerns"
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
            onPress={handleSubmit}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Save Report</Text>}
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
  duplicateBanner: {
    backgroundColor: colors.warningBg,
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
  duplicateText: { fontSize: type.body - 1, fontWeight: '700', color: colors.warning, lineHeight: 21 },
  viewExistingButton: { alignSelf: 'flex-start' },
  viewExistingButtonText: { fontSize: type.body - 1, fontWeight: '800', color: colors.primary },
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
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  fieldErrorText: { fontSize: type.small, color: colors.danger, fontWeight: '600' },
  submitButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: spacing.sm },
  submitButtonPressed: { backgroundColor: '#1D4ED8' },
  submitButtonText: { fontSize: type.body, fontWeight: '800', color: '#FFFFFF' },
});
