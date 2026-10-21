// ============================================================================
// The values backgroundLocationTask.js and backgroundTracking.js both need —
// kept in their own file so neither has to import the other.
// backgroundLocationTask.js defines the task under this name;
// backgroundTracking.js starts/stops it under the same name. Importing
// backgroundLocationTask.js from backgroundTracking.js (or vice versa) would
// create a cycle for no reason beyond sharing these values.
//
// TIME_INTERVAL_MS/DISTANCE_INTERVAL_METERS are the requested cadence passed
// to startLocationUpdatesAsync (as timeInterval/distanceInterval and, as of
// 2026-08-28, deferredUpdatesInterval/deferredUpdatesDistance) AND the floor
// backgroundLocationTask.js enforces itself on every delivery — see that
// file and BUILD_LOG.md, 2026-08-28, for why the OS request alone isn't
// trusted to be enough.
// ============================================================================

export const BACKGROUND_LOCATION_TASK = 'eldercare-background-location';

export const TIME_INTERVAL_MS = 90_000;
export const DISTANCE_INTERVAL_METERS = 75;
