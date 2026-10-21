// ============================================================================
// Geofence endpoints
//
// One function per endpoint in API.md's "Geofencing" section. `elderlyUserId`
// is only ever sent by a family caller — an elderly caller acts on their own
// zones implicitly, same pattern as emergency/api/contacts.js.
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/** GET /emergency/geofences — active zones for the given (or caller's own) elderly user, newest first. */
export function listGeofences({ elderlyUserId } = {}) {
  const params = new URLSearchParams();
  if (elderlyUserId) params.set('elderlyUserId', elderlyUserId);
  const query = params.toString();
  return apiRequest(`/emergency/geofences${query ? `?${query}` : ''}`);
}

/**
 * POST /emergency/geofences — define a zone.
 * @param {object} input
 * @param {string} [input.elderlyUserId]  required for a family caller
 * @param {string} input.name
 * @param {number} input.centerLatitude
 * @param {number} input.centerLongitude
 * @param {number} input.radiusMeters
 * @param {boolean} [input.alertOnExit]
 * @param {boolean} [input.alertOnEnter]
 */
export function createGeofence(input) {
  return apiRequest('/emergency/geofences', { method: 'POST', body: input });
}

/** PATCH /emergency/geofences/:id — any subset of POST's fields, at least one required. */
export function updateGeofence(id, changes) {
  return apiRequest(`/emergency/geofences/${id}`, { method: 'PATCH', body: changes });
}

/** DELETE /emergency/geofences/:id — soft delete. No undelete through this API. */
export function deleteGeofence(id) {
  return apiRequest(`/emergency/geofences/${id}`, { method: 'DELETE' });
}

/**
 * GET /emergency/geofences/:id/history — recent inside/outside tally, the
 * post-create sanity check ("you've been inside this zone for the last 3
 * days"). `sampleCount: 0` means not enough recent data, not "never inside."
 */
export function getGeofenceHistory(id, { days } = {}) {
  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  const query = params.toString();
  return apiRequest(`/emergency/geofences/${id}/history${query ? `?${query}` : ''}`);
}
