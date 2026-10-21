// ============================================================================
// 24/7 Emergency Response Center Screen — ElderCare
//
// Contact and help screen for elderly users in emergency situations.
// Features a prominent "CALL EMERGENCY CENTER" primary button connected to the device
// dialer, configurable helpline numbers, emergency guidance, and shortcuts to existing
// emergency features (Ambulance, Disaster Alerts, SOS).
// ============================================================================

import { useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  EMERGENCY_RESPONSE_CENTER_NAME,
  EMERGENCY_RESPONSE_CENTER_PHONE,
} from '../../shared/config';
import { colors, spacing, type } from '../../shared/ui/theme';

export function ResponseCenterScreen({ navigation }) {
  const [error, setError] = useState(null);

  function handleCallResponseCenter() {
    setError(null);
    const telUrl = `tel:${EMERGENCY_RESPONSE_CENTER_PHONE}`;

    Linking.canOpenURL(telUrl)
      .then((supported) => {
        if (!supported) {
          setError('Calling is not available on this device.');
          return;
        }
        return Linking.openURL(telUrl);
      })
      .catch(() => {
        setError('Unable to open device phone dialer.');
      });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>24/7 Emergency Response</Text>
          <Text style={styles.subtitle}>
            Immediate helpline support and guidance during emergency situations.
          </Text>
        </View>

        {/* Error Banner */}
        {error ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Main Call Action Card */}
        <View style={styles.callCard}>
          <Text style={styles.callCardTitle}>{EMERGENCY_RESPONSE_CENTER_NAME}</Text>
          <Text style={styles.callCardSub}>Direct Helpline Contact</Text>
          <Text style={styles.phoneDisplay}>{EMERGENCY_RESPONSE_CENTER_PHONE}</Text>
          <Text style={styles.availabilityBadge}>🟢 Available 24 Hours / 7 Days</Text>

          {/* Primary Call Button */}
          <Pressable
            style={({ pressed }) => [
              styles.callButton,
              pressed && styles.callButtonPressed,
            ]}
            onPress={handleCallResponseCenter}
            accessibilityRole="button"
            accessibilityLabel={`Call emergency response center at ${EMERGENCY_RESPONSE_CENTER_PHONE}`}
          >
            <Text style={styles.callButtonText}>📞 CALL EMERGENCY CENTER</Text>
          </Pressable>
        </View>

        {/* Emergency Help & Guidelines Card */}
        <View style={styles.guidelinesCard}>
          <Text style={styles.guidelinesTitle}>💡 Important Emergency Guidance</Text>

          <View style={styles.guidelineItem}>
            <Text style={styles.guidelineBullet}>•</Text>
            <Text style={styles.guidelineText}>
              <Text style={styles.boldText}>Stay Calm:</Text> Move to a safe, comfortable spot if possible.
            </Text>
          </View>

          <View style={styles.guidelineItem}>
            <Text style={styles.guidelineBullet}>•</Text>
            <Text style={styles.guidelineText}>
              <Text style={styles.boldText}>Keep Phone Nearby:</Text> Ensure your mobile phone remains charged and accessible.
            </Text>
          </View>

          <View style={styles.guidelineItem}>
            <Text style={styles.guidelineBullet}>•</Text>
            <Text style={styles.guidelineText}>
              <Text style={styles.boldText}>Share Location:</Text> Be prepared to give your address or landmark to emergency responders.
            </Text>
          </View>

          <View style={styles.guidelineItem}>
            <Text style={styles.guidelineBullet}>•</Text>
            <Text style={styles.guidelineText}>
              <Text style={styles.boldText}>Follow Instructions:</Text> Comply with directions given by helpline personnel.
            </Text>
          </View>
        </View>

        {/* Shortcuts to Other Emergency Services */}
        <View style={styles.shortcutsSection}>
          <Text style={styles.shortcutsTitle}>Other Emergency Services</Text>

          <Pressable
            style={({ pressed }) => [
              styles.shortcutButton,
              styles.ambulanceShortcut,
              pressed && styles.shortcutPressed,
            ]}
            onPress={() => navigation.navigate('AmbulanceBooking')}
            accessibilityRole="button"
            accessibilityLabel="Request emergency ambulance"
          >
            <Text style={styles.ambulanceShortcutText}>🚑 Request Emergency Ambulance</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.shortcutButton,
              styles.disasterShortcut,
              pressed && styles.shortcutPressed,
            ]}
            onPress={() => navigation.navigate('DisasterAlerts')}
            accessibilityRole="button"
            accessibilityLabel="View disaster and weather alerts"
          >
            <Text style={styles.disasterShortcutText}>📢 View Disaster & Weather Alerts</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.shortcutButton,
              styles.sosShortcut,
              pressed && styles.shortcutPressed,
            ]}
            onPress={() => navigation.navigate('ElderlyHome')}
            accessibilityRole="button"
            accessibilityLabel="Go to emergency SOS"
          >
            <Text style={styles.sosShortcutText}>🆘 Go to Emergency SOS</Text>
          </Pressable>
        </View>

        {/* Configurable Notice Footer */}
        <View style={styles.footerNotice}>
          <Text style={styles.footerNoticeText}>
            Note: This screen provides emergency contact access and safety guidance. The response center contact is configurable and managed by your care team.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    alignItems: 'center',
  },
  title: {
    fontSize: type.title + 2,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: type.body - 1,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: type.body - 1,
    fontWeight: '600',
    textAlign: 'center',
  },
  callCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    gap: spacing.xs,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  callCardTitle: {
    fontSize: type.heading - 1,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  callCardSub: {
    fontSize: type.small,
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  phoneDisplay: {
    fontSize: type.title,
    fontWeight: '800',
    color: colors.primary,
    marginVertical: 4,
  },
  availabilityBadge: {
    fontSize: type.small + 1,
    fontWeight: '700',
    color: colors.success,
    marginBottom: spacing.sm,
  },
  callButton: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: spacing.xl,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  callButtonPressed: {
    opacity: 0.85,
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: type.body + 2,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  guidelinesCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  guidelinesTitle: {
    fontSize: type.heading - 2,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  guidelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  guidelineBullet: {
    fontSize: type.body,
    color: colors.primary,
    fontWeight: '800',
  },
  guidelineText: {
    fontSize: type.body - 1,
    color: colors.text,
    lineHeight: 22,
    flex: 1,
  },
  boldText: {
    fontWeight: '700',
  },
  shortcutsSection: {
    gap: spacing.sm + 2,
  },
  shortcutsTitle: {
    fontSize: type.heading - 2,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 2,
  },
  shortcutButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  shortcutPressed: {
    opacity: 0.85,
  },
  ambulanceShortcut: {
    backgroundColor: '#FEE2E2',
    borderColor: colors.danger,
  },
  ambulanceShortcutText: {
    color: colors.danger,
    fontSize: type.body,
    fontWeight: '800',
  },
  disasterShortcut: {
    backgroundColor: '#EFF6FF',
    borderColor: colors.primary,
  },
  disasterShortcutText: {
    color: colors.primary,
    fontSize: type.body,
    fontWeight: '800',
  },
  sosShortcut: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  sosShortcutText: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '800',
  },
  footerNotice: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  footerNoticeText: {
    fontSize: type.small,
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
  },
});
