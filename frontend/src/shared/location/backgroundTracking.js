// ============================================================================
// Turning background location tracking on and off — Phase 3 step 2.
//
// The only module under shared/location/ meant to be called from the UI
// (foreground, React-mounted). backgroundLocationTask.js and
// backgroundLocationApi.js run in the headless context this module's callers
// cannot assume exists; this one runs the OS permission dance and
// starts/stops the task, which only ever happens as a foreground user action
// (or on sign-out — see AuthContext.js).
//
// Android only, deliberately. iOS background-location config was left unset
// in app.json when this project moved to a dev build (Phase 3 step 1, per
// your instruction to scope that step to Android) — attempting this on iOS
// would just fail the permission requests, so it's gated out explicitly
// rather than left to fail confusingly. Also gated out on web: TaskManager
// and background location don't exist there at all, and raw SecureStore
// calls (unlike tokenStore.js's own wrapper) would throw on web rather than
// falling back to memory.
// ============================================================================

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { BACKGROUND_LOCATION_TASK, TIME_INTERVAL_MS, DISTANCE_INTERVAL_METERS } from './backgroundLocationTaskName';

const PREFERENCE_KEY = 'eldercare.backgroundTrackingEnabled';
const SUPPORTED = Platform.OS === 'android';

async function setPreference(enabled) {
  await SecureStore.setItemAsync(PREFERENCE_KEY, enabled ? 'true' : 'false');
}

/** The user's last choice, independent of whether the OS task is actually still running. */
export async function getTrackingPreference() {
  if (!SUPPORTED) return false;
  return (await SecureStore.getItemAsync(PREFERENCE_KEY)) === 'true';
}

/** What's actually running at the OS level right now — the source of truth over the preference. */
export async function isTrackingActive() {
  if (!SUPPORTED) return false;
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (!registered) return false;
  return Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
}

/**
 * Foreground permission, then background permission, then starts the task.
 * Stops and reports a reason at the first step that isn't granted, so the
 * UI can show exactly what's needed next rather than a generic failure.
 *
 * 90-second time floor / 75-metre distance floor / Balanced accuracy — see
 * BUILD_LOG.md for the battery-vs-freshness reasoning. Balanced matches the
 * accuracy already used for SOS-time capture (captureLocation.js) — good
 * enough to say roughly where someone is, far cheaper than a locked GPS fix.
 *
 * deferredUpdatesInterval/deferredUpdatesDistance (added 2026-08-28) ask
 * Android to batch fixes rather than deliver each one as it's produced —
 * timeInterval/distanceInterval alone are a requested cadence, not a
 * guaranteed one: the fused provider is free to deliver faster whenever it's
 * already producing fixes at a higher rate for any reason, which is exactly
 * what was happening (see BUILD_LOG.md, 2026-08-28 — confirmed ~5s delivery
 * against a 90s/75m request, from stored `locations` rows). This is still
 * only the OS-facing half of the fix — backgroundLocationTask.js enforces
 * the same floor itself on every delivery, so correctness doesn't depend on
 * how any given OEM's Play services build actually honors this request.
 */
export async function enableBackgroundTracking() {
  if (!SUPPORTED) return { started: false, reason: 'unsupported_platform' };

  const foreground = await Location.getForegroundPermissionsAsync();
  let foregroundStatus = foreground.status;
  if (foregroundStatus !== 'granted') {
    foregroundStatus = (await Location.requestForegroundPermissionsAsync()).status;
  }
  if (foregroundStatus !== 'granted') {
    return { started: false, reason: 'foreground_denied' };
  }

  const background = await Location.getBackgroundPermissionsAsync();
  let backgroundStatus = background.status;
  if (backgroundStatus !== 'granted') {
    backgroundStatus = (await Location.requestBackgroundPermissionsAsync()).status;
  }
  if (backgroundStatus !== 'granted') {
    // Android 11+ does not offer "Allow all the time" from this in-app
    // prompt at all — the caller shows an "open settings" link rather than
    // repeating a prompt that can't grant it.
    return { started: false, reason: 'background_denied' };
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: TIME_INTERVAL_MS,
    distanceInterval: DISTANCE_INTERVAL_METERS,
    deferredUpdatesInterval: TIME_INTERVAL_MS,
    deferredUpdatesDistance: DISTANCE_INTERVAL_METERS,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'ElderCare location sharing is on',
      notificationBody: "Your family can see where you are while this is on.",
    },
  });

  await setPreference(true);
  return { started: true };
}

/**
 * Stops the task and records the preference as off. Exported under two
 * names for two different kinds of caller: enableBackgroundTracking's
 * counterpart for a direct user action (disableBackgroundTracking), and the
 * same operation triggered from somewhere with no UI to update — an
 * unrecoverable auth failure in backgroundLocationApi.js, or
 * AuthContext.signOut() (disableBackgroundTrackingSilently). "Silently"
 * because there's no screen state to change from those call sites, not
 * because anything is hidden — the foreground-service notification
 * disappearing is itself the visible signal.
 */
export async function disableBackgroundTrackingSilently() {
  if (!SUPPORTED) return;
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (registered) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
  await setPreference(false);
}

export const disableBackgroundTracking = disableBackgroundTrackingSilently;

/**
 * Called on screen mount/focus: if the OS silently stopped the task
 * (permission revoked in system settings, battery optimisation killing the
 * service, etc.) but the stored preference still says "on", the preference
 * is corrected to match reality rather than the screen claiming tracking is
 * on when it isn't — same "don't lie about state" instinct as the active-
 * alert check on this screen failing open instead of guessing.
 */
export async function reconcileTrackingState() {
  if (!SUPPORTED) return false;
  const preference = await getTrackingPreference();
  const active = await isTrackingActive();
  if (preference && !active) {
    await setPreference(false);
  }
  return active;
}
