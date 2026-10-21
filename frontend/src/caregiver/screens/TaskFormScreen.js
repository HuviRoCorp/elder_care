// ============================================================================
// Add Task — elderly/family only, one visit
//
// assignedToCaregiverId is fixed to the visit's own caregiver (route param,
// not user-editable) — a task created from a visit is for that visit's
// caregiver, not a picker over every caregiver this elderly user has ever
// booked.
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

import { createTask } from '../api/tasks';
import { ApiError, NetworkError } from '../../shared/api/client';
import { colors, spacing, type } from '../../shared/ui/theme';
import { TASK_PRIORITY_OPTIONS } from '../taskFormat';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function TaskFormScreen({ navigation, route }) {
  const { scheduleId, elderlyUserId, elderlyName, caregiverId } = route.params;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('normal');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  async function handleSubmit() {
    setFormError(null);

    const errors = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle) errors.title = 'Title is required.';
    else if (trimmedTitle.length > 150) errors.title = 'Title must be 150 characters or fewer.';
    if (dueDate.trim() && !DATE_RE.test(dueDate.trim())) errors.dueDate = 'Enter a date as YYYY-MM-DD, e.g. 2026-09-15.';
    if (dueTime.trim() && !TIME_RE.test(dueTime.trim())) errors.dueTime = 'Enter a time as HH:MM, e.g. 14:30.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Please check the highlighted fields.');
      return;
    }
    setFieldErrors({});

    setBusy(true);
    try {
      await createTask({
        elderlyUserId,
        assignedToCaregiverId: caregiverId,
        scheduleId,
        title: trimmedTitle,
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        priority,
        dueDate: dueDate.trim() || undefined,
        dueTime: dueTime.trim() || undefined,
      });
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
          setFormError("You don't have permission to assign tasks for this account.");
        } else {
          setFormError(err.message || 'Could not create this task.');
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

          <Text style={styles.title}>Add Task</Text>
          {elderlyName ? <Text style={styles.subtitle}>For {elderlyName}'s caregiver on this visit.</Text> : null}

          {formError ? (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={[styles.input, fieldErrors.title && styles.inputError]}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Give afternoon medication"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Title"
            />
            {fieldErrors.title ? <Text style={styles.fieldErrorText}>{fieldErrors.title}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Priority</Text>
            <View style={styles.priorityOptions}>
              {TASK_PRIORITY_OPTIONS.map((opt) => {
                const selected = priority === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setPriority(opt.value)}
                    accessibilityRole="button"
                    style={[styles.priorityOption, selected && styles.priorityOptionSelected]}
                  >
                    <Text style={[styles.priorityOptionText, selected && styles.priorityOptionTextSelected]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Category (Optional)</Text>
            <TextInput
              style={styles.input}
              value={category}
              onChangeText={setCategory}
              placeholder="e.g. Medication, Meals, Exercise"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Category"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Any detail the caregiver should know."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              accessibilityLabel="Description"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Due Date (Optional)</Text>
            <TextInput
              style={[styles.input, fieldErrors.dueDate && styles.inputError]}
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="Due date"
            />
            {fieldErrors.dueDate ? <Text style={styles.fieldErrorText}>{fieldErrors.dueDate}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Due Time (Optional)</Text>
            <TextInput
              style={[styles.input, fieldErrors.dueTime && styles.inputError]}
              value={dueTime}
              onChangeText={setDueTime}
              placeholder="HH:MM, e.g. 14:30"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="Due time"
            />
            {fieldErrors.dueTime ? <Text style={styles.fieldErrorText}>{fieldErrors.dueTime}</Text> : null}
          </View>

          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
            onPress={handleSubmit}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Add Task</Text>}
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
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  fieldErrorText: { fontSize: type.small, color: colors.danger, fontWeight: '600' },
  priorityOptions: { flexDirection: 'row', gap: spacing.sm },
  priorityOption: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  priorityOptionSelected: { borderColor: colors.primary, backgroundColor: '#EFF6FF' },
  priorityOptionText: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  priorityOptionTextSelected: { color: colors.primary },
  submitButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: spacing.sm },
  submitButtonPressed: { backgroundColor: '#1D4ED8' },
  submitButtonText: { fontSize: type.body, fontWeight: '800', color: '#FFFFFF' },
});
