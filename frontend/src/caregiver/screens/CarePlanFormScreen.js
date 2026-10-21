// ============================================================================
// Care Plan — create/update
//
// Reached only from CarePlanScreen's Edit/Create button, which only renders
// for a viewer whose role isn't 'caregiver' — this screen doesn't re-check
// permission itself, same as every other form screen in this app (the entry
// point is the gate; a 403 here would mean the entry point was wrong, and
// the generic error handling below still surfaces it cleanly rather than
// crashing if that ever happens).
//
// `carePlan` arrives via route.params, already loaded by CarePlanScreen — no
// refetch. null means create (POST), present means update (PATCH).
//
// Clearing a text field (allergies resolved, medications stopped) is a real
// edit, not a no-op — optional text fields are sent trimmed as-is, including
// empty string, so updateCarePlan's addField (caregiver/services/
// care-plans.service.js) actually writes the clear. Dates are the one
// exception: an emptied date is sent as `undefined` (omitted) rather than
// '', because validateUpdateCarePlan rejects '' as a bad YYYY-MM-DD format
// before it ever reaches "no value provided" — same limitation
// CaregiverProfileScreen already accepts for its own optional fields, not
// new here.
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

import { createCarePlan, updateCarePlan } from '../api/carePlans';
import { ApiError, NetworkError } from '../../shared/api/client';
import { colors, spacing, type } from '../../shared/ui/theme';
import { CARE_PLAN_STATUS_OPTIONS } from '../carePlanFormat';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toFormState(carePlan) {
  return {
    title: carePlan?.title || '',
    status: carePlan?.status || 'active',
    allergies: carePlan?.allergies || '',
    medications: carePlan?.medications || '',
    medicalConditions: carePlan?.medicalConditions || '',
    mobilityNotes: carePlan?.mobilityNotes || '',
    dietaryNotes: carePlan?.dietaryNotes || '',
    emergencyInstructions: carePlan?.emergencyInstructions || '',
    description: carePlan?.description || '',
    startDate: carePlan?.startDate || '',
    endDate: carePlan?.endDate || '',
  };
}

export function CarePlanFormScreen({ navigation, route }) {
  const { elderlyUserId, elderlyName, carePlan } = route.params;
  const isEditing = !!carePlan;

  const [form, setForm] = useState(toFormState(carePlan));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    setFormError(null);

    const errors = {};
    const title = form.title.trim();
    if (!title) errors.title = 'Title is required.';
    else if (title.length > 150) errors.title = 'Title must be 150 characters or fewer.';

    const startDate = form.startDate.trim();
    const endDate = form.endDate.trim();
    if (startDate && !DATE_RE.test(startDate)) errors.startDate = 'Enter a date as YYYY-MM-DD, e.g. 2026-09-15.';
    if (endDate && !DATE_RE.test(endDate)) errors.endDate = 'Enter a date as YYYY-MM-DD, e.g. 2026-09-30.';
    if (!errors.startDate && !errors.endDate && startDate && endDate && endDate < startDate) {
      errors.endDate = 'End date cannot be before the start date.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Please check the highlighted fields.');
      return;
    }
    setFieldErrors({});

    const payload = {
      title,
      status: form.status,
      allergies: form.allergies.trim(),
      medications: form.medications.trim(),
      medicalConditions: form.medicalConditions.trim(),
      mobilityNotes: form.mobilityNotes.trim(),
      dietaryNotes: form.dietaryNotes.trim(),
      emergencyInstructions: form.emergencyInstructions.trim(),
      description: form.description.trim(),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    };

    setBusy(true);
    try {
      if (isEditing) {
        await updateCarePlan(carePlan.id, payload);
      } else {
        await createCarePlan({ elderlyUserId, ...payload });
      }
      navigation.goBack();
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
          setFormError("You don't have permission to manage this care plan.");
        } else {
          setFormError(err.message || 'Could not save this care plan.');
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

          <Text style={styles.title}>{isEditing ? 'Edit Care Plan' : 'Create Care Plan'}</Text>
          {elderlyName ? <Text style={styles.subtitle}>For {elderlyName}.</Text> : null}

          {formError ? (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={[styles.input, fieldErrors.title && styles.inputError]}
              value={form.title}
              onChangeText={(v) => set('title', v)}
              placeholder="e.g. Ramesh's ongoing care plan"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Title"
            />
            {fieldErrors.title ? <Text style={styles.fieldErrorText}>{fieldErrors.title}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.statusOptions}>
              {CARE_PLAN_STATUS_OPTIONS.map((opt) => {
                const selected = form.status === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => set('status', opt.value)}
                    accessibilityRole="button"
                    style={[styles.statusOption, selected && styles.statusOptionSelected]}
                  >
                    <Text style={[styles.statusOptionText, selected && styles.statusOptionTextSelected]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Allergies</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.allergies}
              onChangeText={(v) => set('allergies', v)}
              placeholder="e.g. Penicillin, peanuts"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={2}
              accessibilityLabel="Allergies"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Current Medications</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.medications}
              onChangeText={(v) => set('medications', v)}
              placeholder="e.g. Metformin 500mg twice daily"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={2}
              accessibilityLabel="Current medications"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Medical Conditions</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.medicalConditions}
              onChangeText={(v) => set('medicalConditions', v)}
              placeholder="e.g. Type 2 diabetes, hypertension"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              accessibilityLabel="Medical conditions"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mobility Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.mobilityNotes}
              onChangeText={(v) => set('mobilityNotes', v)}
              placeholder="e.g. Uses a walker, needs help with stairs"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={2}
              accessibilityLabel="Mobility notes"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Dietary Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.dietaryNotes}
              onChangeText={(v) => set('dietaryNotes', v)}
              placeholder="e.g. Low sodium, no added sugar"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={2}
              accessibilityLabel="Dietary notes"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Emergency Instructions</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.emergencyInstructions}
              onChangeText={(v) => set('emergencyInstructions', v)}
              placeholder="e.g. Call daughter first, then 108"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={2}
              accessibilityLabel="Emergency instructions"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Other Notes (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.description}
              onChangeText={(v) => set('description', v)}
              placeholder="Anything else worth recording."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              accessibilityLabel="Other notes"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Start Date (Optional)</Text>
            <TextInput
              style={[styles.input, fieldErrors.startDate && styles.inputError]}
              value={form.startDate}
              onChangeText={(v) => set('startDate', v)}
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
              value={form.endDate}
              onChangeText={(v) => set('endDate', v)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="End date"
            />
            {fieldErrors.endDate ? <Text style={styles.fieldErrorText}>{fieldErrors.endDate}</Text> : null}
          </View>

          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
            onPress={handleSubmit}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>{isEditing ? 'Save Changes' : 'Create Care Plan'}</Text>
            )}
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
  textArea: { minHeight: 60, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  fieldErrorText: { fontSize: type.small, color: colors.danger, fontWeight: '600' },
  statusOptions: { flexDirection: 'row', gap: spacing.sm },
  statusOption: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statusOptionSelected: { borderColor: colors.primary, backgroundColor: '#EFF6FF' },
  statusOptionText: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  statusOptionTextSelected: { color: colors.primary },
  submitButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: spacing.sm },
  submitButtonPressed: { backgroundColor: '#1D4ED8' },
  submitButtonText: { fontSize: type.body, fontWeight: '800', color: '#FFFFFF' },
});
