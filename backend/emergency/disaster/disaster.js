// ============================================================================
// Disaster Alerts Data Access & Service Logic
//
// Interacts with PostgreSQL table `disaster_alerts`.
// Uses mockProvider for automatic seeding when the table is empty.
// ============================================================================

import { query } from '../../shared/db/pool.js';
import { syncMockDisasterFeed } from './mockProvider.js';

export function toPublicDisasterAlert(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    disasterType: row.disaster_type ?? null,
    severity: row.severity,
    areaName: row.area_name ?? null,
    centerLatitude: row.center_latitude ? Number(row.center_latitude) : null,
    centerLongitude: row.center_longitude ? Number(row.center_longitude) : null,
    radiusMeters: row.radius_meters ?? null,
    source: row.source ?? null,
    externalId: row.external_id ?? null,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at ?? null,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lists active disaster alerts for the application.
 * Automatically seeds mock alerts if no active rows exist.
 *
 * @param {object} [options]
 * @param {string} [options.area] optional area name filter
 * @param {number} [options.limit] max alerts to return
 */
export async function listActiveDisasterAlerts({ area = null, limit = 20 } = {}) {
  // Check if any active alerts exist; if not, sync mock feed
  const { rows: checkRows } = await query(
    `SELECT COUNT(*)::int AS count FROM disaster_alerts WHERE is_active = TRUE`
  );

  if (checkRows[0]?.count === 0) {
    await syncMockDisasterFeed();
  }

  let sql = `SELECT * FROM disaster_alerts
              WHERE is_active = TRUE
                AND (expires_at IS NULL OR expires_at > now())`;
  const params = [];

  if (typeof area === 'string' && area.trim() !== '') {
    params.push(`%${area.trim()}%`);
    sql += ` AND area_name ILIKE $${params.length}`;
  }

  params.push(limit);
  sql += ` ORDER BY issued_at DESC LIMIT $${params.length}`;

  const { rows } = await query(sql, params);
  return rows.map(toPublicDisasterAlert);
}

/** Fetches a specific disaster alert by ID. */
export async function findDisasterAlertById(id) {
  const { rows } = await query(
    `SELECT * FROM disaster_alerts WHERE id = $1 AND is_active = TRUE`,
    [id]
  );
  return rows[0] ? toPublicDisasterAlert(rows[0]) : null;
}
