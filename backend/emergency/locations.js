// ============================================================================
// Locations — database access
//
// Phase 1, step 2: capture and storage only. Same split as alerts.js:
// routes.js decides what is allowed, this file only knows how to write rows.
// Phase 3 step 3's geofence check reads this table back (the previous
// reading, to detect a boundary crossing) — see geofenceCheck.js, not here.
// ============================================================================

import { query } from '../shared/db/pool.js';

/** Shapes a raw `locations` row into the camelCase form the API returns. */
export function toPublicLocation(row) {
  return {
    id: row.id,
    userId: row.user_id,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracy_meters,
    batteryLevel: row.battery_level,
    source: row.source,
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
  };
}

/**
 * Records one location reading for the caller. `recordedAt` is when the
 * device actually took the GPS fix, which may be a moment before this
 * request arrives — defaults to now() if the client didn't send one.
 *
 * ON CONFLICT DO NOTHING relies on the locations_user_recorded_at_key unique
 * constraint (same user, same recorded_at = the same reading resent by a
 * queued retry) and returns undefined rather than throwing — callers must
 * treat that as a successful no-op, not an error.
 */
export async function createLocation(
  userId,
  { latitude, longitude, accuracyMeters, batteryLevel, recordedAt, source }
) {
  const { rows } = await query(
    `INSERT INTO locations (user_id, latitude, longitude, accuracy_meters, battery_level, recorded_at, source)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()), COALESCE($7, 'gps'))
     ON CONFLICT (user_id, recorded_at) DO NOTHING
     RETURNING *`,
    [userId, latitude, longitude, accuracyMeters ?? null, batteryLevel ?? null, recordedAt ?? null, source ?? null]
  );
  return rows[0];
}

/**
 * Most recent reading for this user, or null if they have none yet. Used by
 * GET /emergency/locations/latest — the source for a family member's "use
 * their last known location" zone-centre flow, since a family member's own
 * device position is never a stand-in for the elderly user's.
 */
export async function findLatestLocation(userId) {
  const { rows } = await query(
    `SELECT * FROM locations WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

/**
 * Every reading for this user at or after `sinceDate`, oldest first — feeds
 * GET /emergency/geofences/:id/history's inside/outside tally. Same
 * (user_id, recorded_at) index the unique constraint already provides.
 */
export async function listLocationsSince(userId, sinceDate) {
  const { rows } = await query(
    `SELECT * FROM locations WHERE user_id = $1 AND recorded_at >= $2 ORDER BY recorded_at ASC`,
    [userId, sinceDate]
  );
  return rows;
}

// SCHEMA_DESIGN.md's committed retention policy — deferred at Phase 0, built
// here. Not a config value: MAX_HISTORY_DAYS (emergency/validate.js, the cap
// on GET /geofences/:id/history's `days` param) is already fixed at the same
// 30, and the alerts table's own columns exist specifically so an alert
// "outlives the 30-day location retention window" (schema.sql's comment on
// alerts.latitude) — several things already assume this exact number, not a
// knob meant to move independently of them.
const RETENTION_DAYS = 30;

/**
 * Deletes every locations row older than the retention window. Safe by
 * construction, not by care taken here: alerts.location_id is
 * ON DELETE SET NULL, and an alert's own latitude/longitude/
 * location_accuracy_meters/location_captured_at are separate columns,
 * populated once at alert-creation time — deleting a locations row a
 * resolved alert once pointed at nulls that one dangling reference and
 * touches nothing else about the alert. See locationRetentionScheduler.js
 * for what calls this and how often.
 *
 * Returns the number of rows deleted, for the scheduler to log.
 */
export async function purgeOldLocations() {
  const { rowCount } = await query(
    `DELETE FROM locations WHERE recorded_at < now() - make_interval(days => $1)`,
    [RETENTION_DAYS]
  );
  return rowCount;
}
