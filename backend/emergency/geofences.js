// ============================================================================
// Geofences — database access
//
// Phase 3 step 3. Circles only, no PostGIS — schema.sql's own words on the
// table. A breach is a real `alerts` row (alert_type = 'geofence_breach');
// the evaluation that decides when to write one lives in geofenceCheck.js,
// not here — same split as alerts.js/fanout.js: this file only knows how to
// read and write `geofences` rows.
// ============================================================================

import { query } from '../shared/db/pool.js';

export function toPublicGeofence(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    centerLatitude: row.center_latitude,
    centerLongitude: row.center_longitude,
    radiusMeters: row.radius_meters,
    fenceType: row.fence_type,
    alertOnExit: row.alert_on_exit,
    alertOnEnter: row.alert_on_enter,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findGeofenceById(id) {
  const { rows } = await query(`SELECT * FROM geofences WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** Active zones for one elderly user. Newest first — the only order that matters for a list this small. */
export async function listGeofencesForUser(userId) {
  const { rows } = await query(
    `SELECT * FROM geofences WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

/**
 * `createdBy` is deliberately separate from `userId` — the schema already
 * anticipated a family member defining a zone for an elderly user, not just
 * the elderly user defining their own. `fenceType` is not a caller option:
 * always 'safe_zone', the column's own default — the schema leaves room for
 * other values but nothing in this codebase defines what they'd mean yet, so
 * exposing the field for write would be inventing a vocabulary nobody asked
 * for.
 */
export async function createGeofence({
  userId,
  name,
  centerLatitude,
  centerLongitude,
  radiusMeters,
  alertOnExit,
  alertOnEnter,
  createdBy,
}) {
  const { rows } = await query(
    `INSERT INTO geofences (
       user_id, name, center_latitude, center_longitude, radius_meters,
       alert_on_exit, alert_on_enter, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, name, centerLatitude, centerLongitude, radiusMeters, alertOnExit, alertOnEnter, createdBy]
  );
  return rows[0];
}

/** Partial update — same "only touch what's present" shape as emergency/contacts.js's updateContact. */
export async function updateGeofence(id, fields) {
  const columns = {
    name: 'name',
    centerLatitude: 'center_latitude',
    centerLongitude: 'center_longitude',
    radiusMeters: 'radius_meters',
    alertOnExit: 'alert_on_exit',
    alertOnEnter: 'alert_on_enter',
  };

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }

  values.push(id);
  const { rows } = await query(
    `UPDATE geofences SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

/**
 * Soft delete — is_active = FALSE. A hard delete would SET NULL on
 * alerts.geofence_id for every past breach against this zone, losing which
 * zone an old alert was actually about — same reasoning as emergency
 * contacts' soft delete.
 */
export async function deactivateGeofence(id) {
  const { rows } = await query(`UPDATE geofences SET is_active = FALSE WHERE id = $1 RETURNING *`, [id]);
  return rows[0] ?? null;
}
