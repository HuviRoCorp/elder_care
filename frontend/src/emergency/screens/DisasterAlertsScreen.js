// ============================================================================
// Disaster Alerts List Screen — ElderCare
//
// Displays active area warnings with clear severity badges, area names, and timestamps.
// Designed specifically for elderly readability with high contrast, large text, and
// accessible screen-reader labels.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listDisasterAlerts } from '../api/disaster';
import { colors, spacing, type } from '../../shared/ui/theme';

export function DisasterAlertsScreen({ navigation }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchAlerts = useCallback(async () => {
    setError(null);
    try {
      const { alerts: fetched } = await listDisasterAlerts();
      setAlerts(fetched);
    } catch (err) {
      if (err.name === 'NetworkError') {
        setError('Unable to connect to disaster alerts service. Check your connection.');
      } else {
        setError(err.message || 'Could not load disaster alerts.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchAlerts();
  }

  function renderAlertCard({ item }) {
    const timeAgo = formatTimeAgo(item.issuedAt);
    const severityTheme = getSeverityTheme(item.severity);

    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => navigation.navigate('DisasterDetail', { alertId: item.id, initialAlert: item })}
        accessibilityRole="button"
        accessibilityLabel={`${item.severity.toUpperCase()} alert: ${item.title} for ${item.areaName || 'your area'}, issued ${timeAgo}. Tap for details.`}
      >
        {/* Top Header Row */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <View style={[styles.severityBadge, { backgroundColor: severityTheme.bg }]}>
            <Text style={[styles.severityBadgeText, { color: severityTheme.text }]}>
              {item.severity.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Area & Time Meta */}
        <View style={styles.metaRow}>
          <Text style={styles.areaText}>📍 {item.areaName || 'General Area'}</Text>
          <Text style={styles.timeText}>🕒 {timeAgo}</Text>
        </View>

        {/* Description Snippet */}
        {item.description ? (
          <Text style={styles.cardDescription} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        {/* Action hint */}
        <View style={styles.cardFooter}>
          <Text style={styles.detailsLink}>Tap for full warning & safety advice →</Text>
        </View>
      </Pressable>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centerSafe}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading disaster warnings...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Disaster Alerts</Text>
          <Text style={styles.subtitle}>Current weather & emergency warnings for your area</Text>
        </View>

        {/* Error Banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={fetchAlerts} accessibilityRole="button">
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Alerts List */}
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          renderItem={renderAlertCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            !error ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🛡️</Text>
                <Text style={styles.emptyTitle}>No Active Disaster Warnings</Text>
                <Text style={styles.emptySub}>
                  There are currently no active severe weather or disaster warnings for your area.
                </Text>
                <Pressable style={styles.refreshButton} onPress={handleRefresh} accessibilityRole="button">
                  <Text style={styles.refreshButtonText}>🔄 Check Again</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      </View>
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

function formatTimeAgo(isoString) {
  if (!isoString) return 'Recently';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.max(1, Math.round(diffMs / 60000));

  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
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
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: type.title + 2,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: type.body - 1,
    color: colors.textMuted,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: type.body - 1,
    textAlign: 'center',
    fontWeight: '600',
  },
  retryButton: {
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: type.small,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardPressed: {
    backgroundColor: '#F3F4F6',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: type.heading,
    fontWeight: '800',
    color: colors.text,
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  severityBadgeText: {
    fontSize: type.small,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  areaText: {
    fontSize: type.body - 1,
    fontWeight: '700',
    color: colors.text,
  },
  timeText: {
    fontSize: type.small,
    color: colors.textMuted,
    fontWeight: '600',
  },
  cardDescription: {
    fontSize: type.body - 1,
    color: colors.textMuted,
    lineHeight: 22,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 4,
  },
  detailsLink: {
    fontSize: type.small + 1,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    gap: spacing.sm,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    fontSize: type.heading,
    fontWeight: '800',
    color: colors.text,
  },
  emptySub: {
    fontSize: type.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  refreshButton: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  refreshButtonText: {
    color: colors.primary,
    fontSize: type.body,
    fontWeight: '700',
  },
});
