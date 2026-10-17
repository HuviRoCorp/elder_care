// ============================================================================
// What an SOS push notification means and does — emergency-module business
// logic, unlike shared/notifications/ which knows nothing about alerts.
//
// Registers a notification category with an "Acknowledge" action button, and
// a response listener that calls POST /emergency/alerts/:id/acknowledge
// directly when that button is tapped — the requirement was that
// acknowledging works from the notification itself, not only from inside the
// app. A plain tap (not the button) just opens the app normally; it does not
// acknowledge on the person's behalf without them doing anything explicit.
// ============================================================================

import * as Notifications from 'expo-notifications';

import { acknowledgeAlert } from '../api/alerts';

const SOS_CATEGORY = 'sos-alert';
const ACKNOWLEDGE_ACTION = 'acknowledge';

/** Registers the category once. Safe to call more than once — it's idempotent. */
export async function registerSosNotificationCategory() {
  try {
    if (typeof Notifications.setNotificationCategoryAsync === 'function') {
      await Notifications.setNotificationCategoryAsync(SOS_CATEGORY, [
        {
          identifier: ACKNOWLEDGE_ACTION,
          buttonTitle: 'Acknowledge',
          options: { opensAppToForeground: false },
        },
      ]);
    }
  } catch (err) {
    // Non-fatal in environments where category configuration is restricted
  }
}

async function handleResponse(response) {
  const alertId = response?.notification?.request?.content?.data?.alertId;
  if (!alertId) return; // not an SOS push, or missing data — nothing to do

  if (response.actionIdentifier !== ACKNOWLEDGE_ACTION) return; // a plain tap just opens the app

  try {
    await acknowledgeAlert(alertId);
  } catch {
    // Already acknowledged, alert closed, or offline — none of these can be
    // shown to the person right now, since this fires outside any screen.
    // The family dashboard reflects the true state next time it loads.
  }
}

/**
 * Registers the response listener and checks for a response that launched
 * the app cold (tapped the action while the app wasn't running at all).
 * Returns the subscription — call `.remove()` on it when done, same as any
 * other expo-notifications listener.
 */
export function registerSosAcknowledgeListener() {
  try {
    if (typeof Notifications.getLastNotificationResponseAsync === 'function') {
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) handleResponse(response);
      }).catch(() => {});
    }

    if (typeof Notifications.addNotificationResponseReceivedListener === 'function') {
      return Notifications.addNotificationResponseReceivedListener(handleResponse);
    }
  } catch (err) {
    // Graceful fallback handle
  }

  return { remove: () => {} };
}
