// ============================================================================
// Device location capture
//
// Phase 1, step 2. A thin wrapper around expo-location (+ expo-battery for
// the battery_level column) that never throws and never hangs — permission
// denied, GPS off, no fix in time, or a genuinely broken device all come back
// as `null`. Callers branch on "did we get a reading", nothing else; nobody
// calling this needs a try/catch for the ordinary "location unavailable"
// case, since that isn't treated as an error here.
//
// Used from two places: ElderlyHomeScreen's "Location sharing" card (mount-
// time capture, posted to POST /emergency/locations) and the SOS countdown
// (capture at press time, sent inline on POST /emergency/alerts). Kept here,
// under shared/, because it's a device capability, not emergency-module
// business logic — the same way shared/api/client.js isn't owned by one
// screen either.
//
// Phase 1 step 4 adds beginSosLocationCapture and captureLastKnownLocation —
// the SOS button never waits past SOS_LOCATION_TIMEOUT_MS to send, but a
// fresh fix that lands late is worth attaching to the alert after the fact
// rather than discarding, and a cached position is worth sending as an
// explicitly-marked floor when nothing fresh is ready in time. See
// ElderlyHomeScreen and BUILD_LOG.md.
// ============================================================================

import * as Location from 'expo-location';
import * as Battery from 'expo-battery';

/** Checks the current permission without prompting. */
export async function getLocationPermissionStatus() {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status; // 'granted' | 'denied' | 'undetermined'
}

/** Triggers the OS permission prompt. Call only after showing the rationale. */
export async function requestLocationPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status;
}

/**
 * Requests one fresh fix and shapes it, or resolves null for every case that
 * isn't "something is actually broken": permission not granted, GPS off,
 * airplane mode, hardware error, permission revoked mid-flight. No timeout of
 * its own — callers race or await this directly. Kept separate from
 * captureCurrentLocation so a caller that needs to keep observing past a
 * timeout (the SOS async-attach path — see ElderlyHomeScreen) can hold onto
 * this same promise instead of it being discarded inside a Promise.race.
 *
 * `accuracy` defaults to Balanced (~100m) — every caller except
 * beginSosLocationCapture uses this default. See BUILD_LOG.md, 2026-08-27,
 * for why the SOS path alone requests High instead.
 */
async function readPosition(accuracy = Location.Accuracy.Balanced) {
  try {
    const status = await getLocationPermissionStatus();
    if (status !== 'granted') return null;

    const position = await Location.getCurrentPositionAsync({ accuracy });
    const batteryLevel = await Battery.getBatteryLevelAsync().catch(() => null);

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy ?? null,
      batteryLevel:
        typeof batteryLevel === 'number' && batteryLevel >= 0
          ? Math.round(batteryLevel * 100)
          : null,
      recordedAt: new Date(position.timestamp).toISOString(),
      isApproximate: false,
    };
  } catch {
    return null;
  }
}

/**
 * Best-effort single reading, bounded by `timeoutMs` — resolves null if
 * `readPosition` hasn't settled in time. This is the plain fire-and-discard
 * shape every caller except the SOS button uses (mount-time sharing, fall
 * alerts, ambulance booking): once the timeout wins the race, nothing here
 * keeps watching the underlying read.
 */
export async function captureCurrentLocation({ timeoutMs = 8000 } = {}) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([readPosition(), timeout]);
}

/**
 * SOS-specific: starts one fresh-fix read and returns two views onto it —
 * `settled`, bounded by `timeoutMs` (send-time value, must stay short so the
 * alert is never delayed), and `full`, the same underlying read with no
 * ceiling of its own, for a caller that wants to keep waiting past send time
 * for a fix that arrives late (see SOS_LOCATION_ASYNC_CEILING_MS in
 * ElderlyHomeScreen). The read is started exactly once; `settled` racing it
 * against a timeout does not stop `full` from eventually resolving to
 * whatever `readPosition` returns.
 *
 * `accuracy` defaults to High (~10m), not Balanced (~100m) — safe only
 * because `timeoutMs` (the send gate) was never a function of accuracy tier
 * to begin with; High's slower time-to-first-fix costs nothing there and
 * only affects how long the async attach keeps watching for an upgrade. See
 * BUILD_LOG.md, 2026-08-27.
 */
export function beginSosLocationCapture({ timeoutMs = 4500, accuracy = Location.Accuracy.High } = {}) {
  const full = readPosition(accuracy);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return { settled: Promise.race([full, timeout]), full };
}

/**
 * A cached position, if the OS has one, with no wait for the radio — this is
 * the floor value under SOS_LOCATION_TIMEOUT_MS, used only when a fresh fix
 * hasn't landed by send time. Always shaped with isApproximate: true — a
 * last-known position can be minutes or hours stale, so it's never treated as
 * equivalent to a fresh reading by the caller.
 */
export async function captureLastKnownLocation() {
  try {
    const status = await getLocationPermissionStatus();
    if (status !== 'granted') return null;

    const position = await Location.getLastKnownPositionAsync();
    if (!position) return null;

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy ?? null,
      batteryLevel: null,
      recordedAt: new Date(position.timestamp).toISOString(),
      isApproximate: true,
    };
  } catch {
    return null;
  }
}
