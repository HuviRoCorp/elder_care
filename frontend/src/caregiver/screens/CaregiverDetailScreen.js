// ============================================================================
// Caregiver Detail — elderly and family, shared screen
//
// GET /caregiver/:id, no permission restriction beyond being signed in
// (browsing a caregiver's public profile). "Request this caregiver" carries
// elderlyUserId/elderlyName forward into BookingFormScreen unchanged — this
// screen never re-derives who the booking is for.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCaregiverById } from '../api/caregivers';
import { listReviewsForCaregiver } from '../api/reviews';
import { NetworkError } from '../../shared/api/client';
import { colors, spacing, type } from '../../shared/ui/theme';

export function CaregiverDetailScreen({ navigation, route }) {
  const { caregiverId, elderlyUserId, elderlyName } = route.params;

  const [caregiver, setCaregiver] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ caregiver: cg }, { reviews: reviewList }] = await Promise.all([
        getCaregiverById(caregiverId),
        listReviewsForCaregiver(caregiverId),
      ]);
      setCaregiver(cg);
      setReviews(reviewList);
      setBanner(null);
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof NetworkError ? 'Could not reach the server.' : 'Could not load this caregiver.',
      });
    } finally {
      setLoading(false);
    }
  }, [caregiverId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.backRow}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        {loading && <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />}

        {banner && (
          <View style={[styles.banner, styles.bannerError]}>
            <Text style={[styles.bannerText, styles.bannerTextError]}>{banner.text}</Text>
          </View>
        )}

        {!loading && caregiver && (
          <>
            <Text style={styles.title}>{caregiver.fullName}</Text>
            <Text style={styles.subtitle}>
              ⭐ {caregiver.averageRating.toFixed(1)} ({caregiver.totalReviews} review{caregiver.totalReviews === 1 ? '' : 's'})
            </Text>

            <View style={styles.card}>
              {caregiver.serviceAreaCity ? <DetailRow label="City" value={caregiver.serviceAreaCity} /> : null}
              {caregiver.hourlyRate != null ? <DetailRow label="Hourly rate" value={`₹${caregiver.hourlyRate}/hr`} /> : null}
              {caregiver.experienceYears != null ? (
                <DetailRow label="Experience" value={`${caregiver.experienceYears} year${caregiver.experienceYears === 1 ? '' : 's'}`} />
              ) : null}
              {caregiver.qualifications ? <DetailRow label="Qualifications" value={caregiver.qualifications} /> : null}
              {caregiver.languages.length > 0 ? <DetailRow label="Languages" value={caregiver.languages.join(', ')} /> : null}
              {caregiver.specializations.length > 0 ? (
                <DetailRow label="Specializations" value={caregiver.specializations.join(', ')} />
              ) : null}
            </View>

            {caregiver.bio ? (
              <View style={styles.card}>
                <Text style={styles.cardHeading}>About</Text>
                <Text style={styles.bioText}>{caregiver.bio}</Text>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardHeading}>Reviews</Text>
              {reviews.length === 0 && <Text style={styles.bioText}>No reviews yet.</Text>}
              {reviews.map((r) => (
                <View key={r.id} style={styles.reviewRow}>
                  <Text style={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                  <Text style={styles.reviewAuthor}>{r.reviewerName}</Text>
                  {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                </View>
              ))}
            </View>

            {!caregiver.isAvailable && (
              <View style={styles.noticeCard}>
                <Text style={styles.noticeText}>
                  {caregiver.fullName} isn't taking new bookings right now.
                </Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.requestButton,
                !caregiver.isAvailable && styles.requestButtonDisabled,
                pressed && caregiver.isAvailable && styles.requestButtonPressed,
              ]}
              onPress={() =>
                navigation.navigate('BookingForm', {
                  caregiverId: caregiver.id,
                  caregiverName: caregiver.fullName,
                  elderlyUserId,
                  elderlyName,
                })
              }
              disabled={!caregiver.isAvailable}
              accessibilityRole="button"
              accessibilityLabel={`Request ${caregiver.fullName}`}
            >
              <Text style={styles.requestButtonText}>Request This Caregiver</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  backRow: { paddingVertical: spacing.xs },
  backText: { fontSize: type.body, color: colors.primary, fontWeight: '700' },
  spinner: { marginVertical: spacing.xl },
  banner: { borderRadius: 12, padding: spacing.md, borderWidth: 1.5 },
  bannerError: { backgroundColor: '#FEE2E2', borderColor: colors.danger },
  bannerText: { fontSize: type.body - 1, fontWeight: '700', textAlign: 'center' },
  bannerTextError: { color: colors.danger },
  title: { fontSize: type.title, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: type.body, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeading: { fontSize: type.body - 1, fontWeight: '800', color: colors.text },
  bioText: { fontSize: type.body - 1, color: colors.text, lineHeight: 22 },
  reviewRow: { gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.sm },
  reviewStars: { fontSize: type.body, color: '#F59E0B' },
  reviewAuthor: { fontSize: type.small, fontWeight: '700', color: colors.textMuted },
  reviewComment: { fontSize: type.body - 1, color: colors.text, lineHeight: 21, marginTop: 2 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  detailLabel: { fontSize: type.body - 1, color: colors.textMuted, fontWeight: '600' },
  detailValue: { fontSize: type.body - 1, color: colors.text, flexShrink: 1, textAlign: 'right' },
  noticeCard: { backgroundColor: colors.warningBg, borderWidth: 1.5, borderColor: colors.warning, borderRadius: 14, padding: spacing.md },
  noticeText: { fontSize: type.body - 1, color: colors.warning, fontWeight: '700', textAlign: 'center' },
  requestButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  requestButtonDisabled: { backgroundColor: colors.border },
  requestButtonPressed: { backgroundColor: '#1D4ED8' },
  requestButtonText: { fontSize: type.body, fontWeight: '800', color: '#FFFFFF' },
});
