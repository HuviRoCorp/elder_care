// ============================================================================
// Leave a Review — elderly/family only, one completed booking
//
// Reached only from a completed-booking row (BookingsScreen) — createReview
// (reviews.service.js) independently re-checks the booking is "completed"
// and with this caregiver server-side, so this screen's entry gate is a UX
// convenience, not the actual authorization boundary.
//
// Star input, not a decimal field, for rating and each optional sub-rating —
// SMALLINT CHECK (BETWEEN 1 AND 5) columns, an integer scale a decimal
// input would misrepresent.
// ============================================================================

import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createReview } from '../api/reviews';
import { ApiError, NetworkError } from '../../shared/api/client';
import { colors, spacing, type } from '../../shared/ui/theme';

function StarRating({ label, value, onChange, required }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>
        {label}
        {required ? '' : ' (Optional)'}
      </Text>
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(value === n ? null : n)}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
            style={styles.starButton}
          >
            <Text style={[styles.star, n <= (value ?? 0) && styles.starFilled]}>★</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function ReviewFormScreen({ navigation, route }) {
  const { bookingId, caregiverId, caregiverName } = route.params;

  const [rating, setRating] = useState(null);
  const [punctualityRating, setPunctualityRating] = useState(null);
  const [careQualityRating, setCareQualityRating] = useState(null);
  const [communicationRating, setCommunicationRating] = useState(null);
  const [comment, setComment] = useState('');

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  async function handleSubmit() {
    setFormError(null);

    if (!rating) {
      setFormError('Please choose an overall star rating.');
      return;
    }

    setBusy(true);
    try {
      await createReview({
        caregiverId,
        bookingId,
        rating,
        punctualityRating: punctualityRating ?? undefined,
        careQualityRating: careQualityRating ?? undefined,
        communicationRating: communicationRating ?? undefined,
        comment: comment.trim() || undefined,
      });
      navigation.goBack();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409 && err.code === 'duplicate_review') {
          setFormError('You have already reviewed this booking.');
        } else if (err.status === 409 && err.code === 'booking_not_eligible') {
          setFormError(err.message || 'This booking is not eligible for a review.');
        } else if (err.code === 'not_permitted') {
          setFormError("You don't have permission to review this booking.");
        } else if (err.code === 'validation_failed') {
          setFormError('Please check your ratings — each must be 1 to 5 stars.');
        } else {
          setFormError(err.message || 'Could not save this review.');
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.backRow}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>Leave a Review</Text>
        {caregiverName ? <Text style={styles.subtitle}>For {caregiverName}.</Text> : null}

        {formError ? (
          <View style={styles.formErrorBanner}>
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        ) : null}

        <StarRating label="Overall Rating" value={rating} onChange={setRating} required />
        <StarRating label="Punctuality" value={punctualityRating} onChange={setPunctualityRating} />
        <StarRating label="Care Quality" value={careQualityRating} onChange={setCareQualityRating} />
        <StarRating label="Communication" value={communicationRating} onChange={setCommunicationRating} />

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Comment (Optional)</Text>
          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            placeholder="Share your experience."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            accessibilityLabel="Comment"
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
          onPress={handleSubmit}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Submit Review</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  backRow: { paddingVertical: spacing.xs },
  backText: { fontSize: type.body, color: colors.primary, fontWeight: '700' },
  title: { fontSize: type.title, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: type.body, color: colors.textMuted },
  formErrorBanner: { backgroundColor: '#FEE2E2', borderRadius: 10, padding: spacing.sm },
  formErrorText: { fontSize: type.small + 1, color: colors.danger, fontWeight: '700' },
  inputGroup: { gap: spacing.xs },
  label: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  starRow: { flexDirection: 'row', gap: spacing.xs },
  starButton: { padding: 4 },
  star: { fontSize: 32, color: colors.border },
  starFilled: { color: '#F59E0B' },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: type.body,
    color: colors.text,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  submitButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: spacing.sm },
  submitButtonPressed: { backgroundColor: '#1D4ED8' },
  submitButtonText: { fontSize: type.body, fontWeight: '800', color: '#FFFFFF' },
});
