// ============================================================================
// Safe Zones — list screen, shared by the elderly and family navigators
//
// Elderly caller: GET /emergency/geofences with no elderlyUserId — their own
// zones. Family caller: reached from FamilyLinksScreen's "Safe Zones" button
// on a linked elderly user's card, which passes elderlyUserId, elderlyName,
// and canManage (permissionLevel 'manage'/'owner' + canViewLocation — the
// same gate the server enforces on write, computed client-side once here so
// this screen doesn't need its own copy of family_links permission logic).
//
// A view-tier family member (canViewLocation true, permissionLevel not
// manage/owner) sees every zone but no Add/Edit/Delete controls — replaced
// with a banner explaining why, not disabled buttons that would 403 silently
// on tap. canViewLocation false means no "Safe Zones" button exists on
// FamilyLinksScreen at all, so that case never reaches this screen.
//
// "Check recent activity" per card is an inline expand, not a separate
// screen — GET /emergency/geofences/:id/history, turned into plain language
// by summarizeHistory (geofenceFormat.js). Same panel GeofenceFormScreen
// shows right after creating a zone.
// ============================================================================

import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listGeofences, deleteGeofence, getGeofenceHistory } from '../api/geofences';
import { NetworkError } from '../../shared/api/client';
import { colors, spacing, type } from '../../shared/ui/theme';
import { radiusLabel, summarizeHistory } from '../geofenceFormat';

export function GeofencesScreen({ navigation, route }) {
  const params = route.params || {};
  const elderlyUserId = params.elderlyUserId || null;
  const elderlyName = params.elderlyName || null;
  const canManage = elderlyUserId ? !!params.canManage : true;

  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [expandedId, setExpandedId] = useState(null);
  const [historyById, setHistoryById] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { geofences } = await listGeofences({ elderlyUserId });
      setZones(geofences);
      setBanner(null);
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof NetworkError ? 'Could not reach the server.' : 'Could not load safe zones.',
      });
    } finally {
      setLoading(false);
    }
  }, [elderlyUserId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleDelete(id) {
    setDeletingId(id);
    try {
      await deleteGeofence(id);
      setZones((prev) => prev.filter((z) => z.id !== id));
      setConfirmDeleteId(null);
      setBanner({ kind: 'success', text: 'Zone removed.' });
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof NetworkError ? 'Could not reach the server. Please try again.' : 'Could not remove that zone.',
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleHistory(id) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!historyById[id]) {
      setHistoryById((prev) => ({ ...prev, [id]: { loading: true } }));
      try {
        const { history } = await getGeofenceHistory(id);
        setHistoryById((prev) => ({ ...prev, [id]: { loading: false, history } }));
      } catch {
        setHistoryById((prev) => ({ ...prev, [id]: { loading: false, error: true } }));
      }
    }
  }

  function goToForm(mode, zone) {
    navigation.navigate('GeofenceForm', { mode, zone, elderlyUserId, elderlyName });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.backRow}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>{elderlyName ? `${elderlyName}'s Safe Zones` : 'Safe Zones'}</Text>
        <Text style={styles.subtitle}>
          {elderlyName
            ? `Get alerted if ${elderlyName} leaves or enters one of these places.`
            : 'Get alerted if you leave or enter a place — like home or a family member’s house.'}
        </Text>

        {!canManage && (
          <View style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyBannerText}>
              You can view {elderlyName ? `${elderlyName}'s` : 'these'} safe zones but can't make changes. Ask{' '}
              {elderlyName || 'them'} to give you Manage access if you need to add or edit zones.
            </Text>
          </View>
        )}

        {banner && (
          <Pressable
            onPress={() => setBanner(null)}
            style={[styles.banner, banner.kind === 'error' ? styles.bannerError : styles.bannerSuccess]}
          >
            <Text style={[styles.bannerText, banner.kind === 'error' ? styles.bannerTextError : styles.bannerTextSuccess]}>
              {banner.text}
            </Text>
          </Pressable>
        )}

        {loading && <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />}

        {!loading && zones.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {canManage ? 'No safe zones yet. Add one below.' : 'No safe zones have been set up yet.'}
            </Text>
          </View>
        )}

        {!loading &&
          zones.map((zone) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              canManage={canManage}
              expanded={expandedId === zone.id}
              historyState={historyById[zone.id]}
              confirmingDelete={confirmDeleteId === zone.id}
              deleting={deletingId === zone.id}
              onToggleHistory={() => handleToggleHistory(zone.id)}
              onEdit={() => goToForm('edit', zone)}
              onRequestDelete={() => setConfirmDeleteId(zone.id)}
              onBackOut={() => setConfirmDeleteId(null)}
              onConfirmDelete={() => handleDelete(zone.id)}
            />
          ))}

        {canManage && (
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            onPress={() => goToForm('create', null)}
            accessibilityRole="button"
            accessibilityLabel="Add a safe zone"
          >
            <Text style={styles.addButtonText}>+ Add a Safe Zone</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ZoneCard({
  zone,
  canManage,
  expanded,
  historyState,
  confirmingDelete,
  deleting,
  onToggleHistory,
  onEdit,
  onRequestDelete,
  onBackOut,
  onConfirmDelete,
}) {
  const summary = historyState?.history ? summarizeHistory(historyState.history) : null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardName}>{zone.name}</Text>

      <View style={styles.radiusRow}>
        <Text style={styles.radiusLabel}>{radiusLabel(zone.radiusMeters)}</Text>
        <Text style={styles.radiusMeters}>{zone.radiusMeters} m radius</Text>
      </View>

      <View style={styles.channelRow}>
        {zone.alertOnExit && (
          <View style={[styles.pill, styles.pillOn]}>
            <Text style={[styles.pillText, styles.pillTextOn]}>Alerts if leaving</Text>
          </View>
        )}
        {zone.alertOnEnter && (
          <View style={[styles.pill, styles.pillOn]}>
            <Text style={[styles.pillText, styles.pillTextOn]}>Alerts if entering</Text>
          </View>
        )}
        {!zone.alertOnExit && !zone.alertOnEnter && (
          <View style={[styles.pill, styles.pillOff]}>
            <Text style={[styles.pillText, styles.pillTextOff]}>No alerts set</Text>
          </View>
        )}
      </View>

      <Pressable onPress={onToggleHistory} accessibilityRole="button" style={styles.historyToggle}>
        <Text style={styles.historyToggleText}>{expanded ? '▲ Hide recent activity' : '▼ Check recent activity'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.historyPanel}>
          {historyState?.loading && <ActivityIndicator color={colors.primary} />}
          {historyState?.error && <Text style={styles.historyError}>Could not load recent activity. Please try again.</Text>}
          {summary && (
            <>
              <Text style={styles.historyHeadline}>{summary.headline}</Text>
              {summary.currentlyText && <Text style={styles.historyCurrently}>{summary.currentlyText}</Text>}
              <Text style={styles.historyDetail}>{summary.detail}</Text>
            </>
          )}
        </View>
      )}

      {canManage && !deleting && !confirmingDelete && (
        <View style={styles.cardActionRow}>
          <Pressable onPress={onEdit} accessibilityRole="button" style={styles.editButton}>
            <Text style={styles.editButtonText}>Edit</Text>
          </Pressable>
          <Pressable onPress={onRequestDelete} accessibilityRole="button" style={styles.removeButton}>
            <Text style={styles.removeButtonText}>Delete</Text>
          </Pressable>
        </View>
      )}

      {canManage && confirmingDelete && !deleting && (
        <View style={styles.confirmBlock}>
          <Text style={styles.confirmText}>Delete "{zone.name}"? You'll stop getting alerts for this place.</Text>
          <View style={styles.confirmButtons}>
            <Pressable onPress={onBackOut} accessibilityRole="button" style={styles.confirmNoButton}>
              <Text style={styles.confirmNoButtonText}>Keep It</Text>
            </Pressable>
            <Pressable onPress={onConfirmDelete} accessibilityRole="button" style={styles.confirmYesButton}>
              <Text style={styles.confirmYesButtonText}>Yes, Delete</Text>
            </Pressable>
          </View>
        </View>
      )}

      {deleting && <ActivityIndicator color={colors.danger} style={styles.spinner} />}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  backRow: { paddingVertical: spacing.xs },
  backText: { fontSize: type.body, color: colors.primary, fontWeight: '700' },
  title: { fontSize: type.title, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: type.body, color: colors.textMuted, lineHeight: 23 },
  readOnlyBanner: {
    backgroundColor: colors.warningBg,
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderRadius: 14,
    padding: spacing.md,
  },
  readOnlyBannerText: { fontSize: type.body - 1, color: colors.warning, fontWeight: '700', lineHeight: 22 },
  banner: { borderRadius: 12, padding: spacing.md, borderWidth: 1.5 },
  bannerError: { backgroundColor: '#FEE2E2', borderColor: colors.danger },
  bannerSuccess: { backgroundColor: '#DCFCE7', borderColor: colors.success },
  bannerText: { fontSize: type.body - 1, fontWeight: '700', textAlign: 'center' },
  bannerTextError: { color: colors.danger },
  bannerTextSuccess: { color: colors.success },
  spinner: { marginVertical: spacing.md },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyText: { fontSize: type.body, color: colors.textMuted, lineHeight: 23 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardName: { fontSize: type.heading, fontWeight: '800', color: colors.text },
  radiusRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  radiusLabel: { fontSize: type.body, fontWeight: '700', color: colors.text },
  radiusMeters: { fontSize: type.small, color: colors.textMuted },
  channelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  pillOn: { backgroundColor: '#DBEAFE' },
  pillOff: { backgroundColor: '#F3F4F6' },
  pillText: { fontSize: type.small - 1, fontWeight: '700' },
  pillTextOn: { color: colors.primary },
  pillTextOff: { color: colors.textMuted },
  historyToggle: { paddingVertical: 4 },
  historyToggleText: { fontSize: type.small + 1, fontWeight: '700', color: colors.primary },
  historyPanel: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  historyHeadline: { fontSize: type.body - 1, fontWeight: '800', color: colors.text, lineHeight: 22 },
  historyCurrently: { fontSize: type.body - 1, fontWeight: '700', color: colors.success },
  historyDetail: { fontSize: type.small, color: colors.textMuted },
  historyError: { fontSize: type.body - 1, color: colors.danger, fontWeight: '600' },
  cardActionRow: { flexDirection: 'row', gap: spacing.sm },
  editButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editButtonText: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  removeButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.danger,
    paddingVertical: 12,
    alignItems: 'center',
  },
  removeButtonText: { fontSize: type.body - 1, fontWeight: '800', color: colors.danger },
  confirmBlock: { gap: spacing.sm },
  confirmText: { fontSize: type.body - 1, fontWeight: '700', color: colors.text, textAlign: 'center', lineHeight: 22 },
  confirmButtons: { gap: spacing.sm },
  confirmNoButton: {
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmNoButtonText: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  confirmYesButton: { backgroundColor: colors.danger, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  confirmYesButtonText: { fontSize: type.body - 1, fontWeight: '800', color: '#FFFFFF' },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  addButtonPressed: { backgroundColor: '#1D4ED8' },
  addButtonText: { fontSize: type.body, fontWeight: '800', color: '#FFFFFF' },
});
