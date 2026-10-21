// ============================================================================
// Disaster Alert Details View — ElderCare
//
// Detailed view of a specific disaster or severe weather warning.
// Displays full warning description, safety guidelines, area coverage, and source attribution.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDisasterAlert } from '../api/disaster';
import { colors, spacing, type } from '../../shared/ui/theme';

export function DisasterDetailScreen({ route, navigation }) {
  const initialAlert = route?.params?.initialAlert ?? null;
  const alertId = route?.params?.alertId ?? initialAlert?.id;

  const [alert, setAlert] = useState(initialAlert);
  const [loading, setLoading] = useState(!initialAlert);
  const [error, setError] = useState(null);

  const fetchAlert = useCallback(async () => {
    if (!alertId) return;
    setError(null);
    try {
      const { alert: fetched } = await getDisasterAlert(alertId);
      setAlert(fetched);
    } catch (err) {
      setError(err.message || 'Could not load disaster alert details.');
    } finally {
      setLoading(false);
    }
  }, [alertId]);

  useEffect(() => {
    fetchAlert();
  }, [fetchAlert]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centerSafe}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading alert details...</Text>
      </SafeAreaView>
    );
  }

  if (!alert) {
    return (
      <SafeAreaView style={styles.centerSafe}>
        <Text style={styles.notFoundTitle}>Alert Not Found</Text>
        <Text style={styles.notFoundSub}>The requested disaster warning could not be found.</Text>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.navigate('DisasterAlerts')}
          accessibilityRole="button"
        >
          <Text style={styles.backButtonText}>Back to Disaster Alerts</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const severityTheme = getSeverityTheme(alert.severity);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Top Navigation Bar */}
        <Pressable
          style={styles.navBackHeader}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back to disaster alerts list"
        >
          <Text style={styles.navBackText}>← Back to Alerts</Text>
        </Pressable>

        {/* Error Banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Main Alert Card */}
        <View style={styles.card}>
          {/* Header Row */}
          <View style={styles.titleRow}>
            <Text style={styles.title}>{alert.title}</Text>
            <View style={[styles.severityBadge, { backgroundColor: severityTheme.bg }]}>
              <Text style={[styles.severityBadgeText, { color: severityTheme.text }]}>
                {alert.severity.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Key Details Box */}
          <View style={styles.metaBox}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Affected Area</Text>
              <Text style={styles.metaValue}>📍 {alert.areaName || 'General Region'}</Text>
            </View>

            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Issued Time</Text>
              <Text style={styles.metaValue}>
                🕒 {new Date(alert.issuedAt).toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </Text>
            </View>

            {alert.expiresAt ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Expires At</Text>
                <Text style={styles.metaValue}>
                  ⏳ {new Date(alert.expiresAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Description & Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Warning Details</Text>
            <Text style={styles.descriptionText}>
              {alert.description || 'No detailed warning description provided.'}
            </Text>
          </View>

          {/* Elderly Safety Guidelines Card */}
          <View style={styles.safetyCard}>
            <Text style={styles.safetyTitle}>🛡️ Recommended Safety Guidelines</Text>
            <Text style={styles.safetyItem}>• Remain indoors in a secure, dry location.</Text>
            <Text style={styles.safetyItem}>• Keep your mobile phone and emergency lights fully charged.</Text>
            <Text style={styles.safetyItem}>• Avoid travelling or crossing waterlogged/flooded roads.</Text>
            <Text style={styles.safetyItem}>• Keep emergency contacts and medications close by.</Text>
          </View>

          {/* Source Attribution */}
          <View style={styles.sourceBox}>
            <Text style={styles.sourceText}>Source: {alert.source || 'Official Advisory Feed'}</Text>
          </View>
        </View>

        {/* Back Button */}
        <Pressable
          style={styles.footerBackButton}
          onPress={() => navigation.navigate('DisasterAlerts')}
          accessibilityRole="button"
        >
          <Text style={styles.footerBackText}>Back to All Alerts</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function getSeverityTheme(severity) {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return { bg: '#991B1B', text: '#FFFFFF' };
    case 'high':
    case 'severe':
      return { bg: '#DC2626', text: '#FFFFFF' };
    case 'medium':
    case 'moderate':
      return { bg: '#D97706', text: '#FFFFFF' };
    case 'low':
    default:
      return { bg: '#2563EB', text: '#FFFFFF' };
  }
}

const styles = StyleSheet.create({
  centerSafe: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: type.body,
    color: colors.textMuted,
  },
  notFoundTitle: {
    fontSize: type.heading,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  notFoundSub: {
    fontSize: type.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  backButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    borderRadius: 10,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: type.body,
    fontWeight: '700',
  },
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  navBackHeader: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  navBackText: {
    fontSize: type.body,
    fontWeight: '700',
    color: colors.primary,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: spacing.md,
    borderRadius: 10,
  },
  errorText: {
    color: colors.danger,
    fontSize: type.body - 1,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  title: {
    fontSize: type.title,
    fontWeight: '800',
    color: colors.text,
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  severityBadgeText: {
    fontSize: type.small + 1,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  metaBox: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: type.small,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: type.body - 1,
    color: colors.text,
    fontWeight: '700',
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: type.heading - 2,
    fontWeight: '800',
    color: colors.text,
  },
  descriptionText: {
    fontSize: type.body,
    color: colors.text,
    lineHeight: 26,
  },
  safetyCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 12,
    padding: spacing.md,
    gap: 8,
  },
  safetyTitle: {
    fontSize: type.body,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 4,
  },
  safetyItem: {
    fontSize: type.body - 1,
    color: '#78350F',
    lineHeight: 22,
    fontWeight: '600',
  },
  sourceBox: {
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  sourceText: {
    fontSize: type.small,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  footerBackButton: {
    backgroundColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  footerBackText: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '700',
  },
});
