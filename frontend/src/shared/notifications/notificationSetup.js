// ============================================================================
// Generic Expo notification configuration — no ElderCare-specific knowledge.
//
// Lives under shared/, same reasoning as shared/location/captureLocation.js:
// this is a device capability any module could use, not emergency-module
// business logic. What an SOS push means and does lives in
// emergency/notifications/ instead.
// ============================================================================

import * as Notifications from 'expo-notifications';

/**
 * How a notification behaves while the app is in the foreground. Called once
 * at module load from App.js — it's configuration, not a subscription, so it
 * doesn't need a hook or cleanup.
 */
export function configureNotificationHandler() {
  try {
    if (typeof Notifications.setNotificationHandler === 'function') {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    }
  } catch (err) {
    // Non-fatal if unsupported
  }
}
