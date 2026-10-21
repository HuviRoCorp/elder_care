// ============================================================================
// Edit My Profile — caregiver side
//
// One form, both create and edit: POST /caregiver/profile is an upsert
// (ON_CONFLICT DO UPDATE server-side), so a caregiver with no profile yet and
// one editing an existing profile go through the exact same screen and the
// exact same submit. GET /caregiver/profile/me returns `caregiver: null`
// before a first save — the form just renders empty in that case.
//
// specializations/languages are TEXT[] columns with no canonical list
// anywhere in the backend (caregivers self-enter both as free strings) — the
// only workable input here is a comma-separated text field, split/trimmed
// into an array on submit and joined back with ", " when loading existing
// values. No array-input component exists anywhere else in this app to
// reuse.
//
// currency is not exposed here — it defaults to 'INR' server-side, same as
// the phone country code being a fixed +91 badge elsewhere in this app
// rather than a field the user edits.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
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

import { getMyCaregiverProfile, upsertCaregiverProfile } from '../api/caregivers';
import { ApiError, NetworkError } from '../../shared/api/client';
import { colors, spacing, type } from '../../shared/ui/theme';

const EMPTY_FORM = {
  bio: '',
  experienceYears: '',
  qualifications: '',
  specializations: '',
  languages: '',
  hourlyRate: '',
  serviceAreaCity: '',
  isAvailable: true,
};

function toFormState(caregiver) {
  if (!caregiver) return EMPTY_FORM;
  return {
    bio: caregiver.bio || '',
    experienceYears: caregiver.experienceYears != null ? String(caregiver.experienceYears) : '',
    qualifications: caregiver.qualifications || '',
    specializations: (caregiver.specializations || []).join(', '),
    languages: (caregiver.languages || []).join(', '),
    hourlyRate: caregiver.hourlyRate != null ? String(caregiver.hourlyRate) : '',
    serviceAreaCity: caregiver.serviceAreaCity || '',
    isAvailable: caregiver.isAvailable ?? true,
  };
}

function splitList(text) {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function CaregiverProfileScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { caregiver } = await getMyCaregiverProfile();
      setForm(toFormState(caregiver));
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof NetworkError ? 'Could not reach the server.' : 'Could not load your profile.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setBanner(null);
    setFieldErrors({});

    const errors = {};
    if (form.experienceYears.trim() !== '') {
      const n = Number(form.experienceYears);
      if (!Number.isInteger(n) || n < 0 || n > 70) errors.experienceYears = 'Enter a whole number of years, 0-70.';
    }
    if (form.hourlyRate.trim() !== '') {
      const n = Number(form.hourlyRate);
      if (!Number.isFinite(n) || n < 0) errors.hourlyRate = 'Enter a valid hourly rate.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setBanner({ kind: 'error', text: 'Please check the highlighted fields.' });
      return;
    }

    setBusy(true);
    try {
      await upsertCaregiverProfile({
        bio: form.bio.trim() || undefined,
        experienceYears: form.experienceYears.trim() !== '' ? Number(form.experienceYears) : undefined,
        qualifications: form.qualifications.trim() || undefined,
        specializations: splitList(form.specializations),
        languages: splitList(form.languages),
        hourlyRate: form.hourlyRate.trim() !== '' ? Number(form.hourlyRate) : undefined,
        serviceAreaCity: form.serviceAreaCity.trim() || undefined,
        isAvailable: form.isAvailable,
      });
      setBanner({ kind: 'success', text: 'Profile saved.' });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation_failed' && Array.isArray(err.details)) {
        const mapped = {};
        err.details.forEach((d) => {
          if (d.field) mapped[d.field] = d.message;
        });
        setFieldErrors(mapped);
        setBanner({ kind: 'error', text: 'Please check the highlighted fields.' });
      } else {
        setBanner({
          kind: 'error',
          text: err instanceof NetworkError ? 'Could not reach the server. Please try again.' : 'Could not save your profile.',
        });
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

          <Text style={styles.title}>Edit My Profile</Text>
          <Text style={styles.subtitle}>Elderly users and family members see this when they search for a caregiver.</Text>

          {banner && (
            <View style={[styles.banner, banner.kind === 'error' ? styles.bannerError : styles.bannerSuccess]}>
              <Text style={[styles.bannerText, banner.kind === 'error' ? styles.bannerTextError : styles.bannerTextSuccess]}>
                {banner.text}
              </Text>
            </View>
          )}

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
          ) : (
            <View style={styles.formCard}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextGroup}>
                  <Text style={styles.toggleLabel}>Available for new bookings</Text>
                  <Text style={styles.toggleHint}>Turn this off if you're not taking new families right now.</Text>
                </View>
                <Switch
                  value={form.isAvailable}
                  onValueChange={(v) => set('isAvailable', v)}
                  trackColor={{ false: colors.border, true: colors.success }}
                  accessibilityLabel="Available for new bookings"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>City you serve</Text>
                <TextInput
                  style={styles.input}
                  value={form.serviceAreaCity}
                  onChangeText={(v) => set('serviceAreaCity', v)}
                  placeholder="e.g. Bengaluru"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  accessibilityLabel="City you serve"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Hourly rate (₹)</Text>
                <TextInput
                  style={[styles.input, fieldErrors.hourlyRate && styles.inputError]}
                  value={form.hourlyRate}
                  onChangeText={(v) => set('hourlyRate', v)}
                  placeholder="e.g. 250"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  accessibilityLabel="Hourly rate"
                />
                {fieldErrors.hourlyRate ? <Text style={styles.fieldErrorText}>{fieldErrors.hourlyRate}</Text> : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Years of experience</Text>
                <TextInput
                  style={[styles.input, fieldErrors.experienceYears && styles.inputError]}
                  value={form.experienceYears}
                  onChangeText={(v) => set('experienceYears', v)}
                  placeholder="e.g. 5"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  accessibilityLabel="Years of experience"
                />
                {fieldErrors.experienceYears ? <Text style={styles.fieldErrorText}>{fieldErrors.experienceYears}</Text> : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Qualifications</Text>
                <TextInput
                  style={styles.input}
                  value={form.qualifications}
                  onChangeText={(v) => set('qualifications', v)}
                  placeholder="e.g. Certified nursing assistant"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Qualifications"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Specializations</Text>
                <TextInput
                  style={styles.input}
                  value={form.specializations}
                  onChangeText={(v) => set('specializations', v)}
                  placeholder="e.g. Dementia care, Post-surgery care"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Specializations"
                />
                <Text style={styles.inputHint}>Separate more than one with a comma.</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Languages you speak</Text>
                <TextInput
                  style={styles.input}
                  value={form.languages}
                  onChangeText={(v) => set('languages', v)}
                  placeholder="e.g. Hindi, English, Kannada"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Languages you speak"
                />
                <Text style={styles.inputHint}>Separate more than one with a comma.</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>About you</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={form.bio}
                  onChangeText={(v) => set('bio', v)}
                  placeholder="A short introduction families will see."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={4}
                  accessibilityLabel="About you"
                />
              </View>

              <Pressable
                style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
                onPress={handleSave}
                disabled={busy}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save Profile</Text>}
              </Pressable>
            </View>
          )}
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
  banner: { borderRadius: 12, padding: spacing.md, borderWidth: 1.5 },
  bannerError: { backgroundColor: '#FEE2E2', borderColor: colors.danger },
  bannerSuccess: { backgroundColor: '#DCFCE7', borderColor: colors.success },
  bannerText: { fontSize: type.body - 1, fontWeight: '700', textAlign: 'center' },
  bannerTextError: { color: colors.danger },
  bannerTextSuccess: { color: colors.success },
  spinner: { marginVertical: spacing.xl },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
  },
  toggleTextGroup: { flex: 1, gap: 4 },
  toggleLabel: { fontSize: type.body - 1, fontWeight: '800', color: colors.text },
  toggleHint: { fontSize: type.small, color: colors.textMuted, lineHeight: 19 },
  inputGroup: { gap: spacing.xs },
  label: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  input: {
    backgroundColor: colors.background,
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
  saveButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: spacing.xs },
  saveButtonPressed: { backgroundColor: '#1D4ED8' },
  saveButtonText: { fontSize: type.body, fontWeight: '800', color: '#FFFFFF' },
});
