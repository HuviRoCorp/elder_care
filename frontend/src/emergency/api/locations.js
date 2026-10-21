// ============================================================================
// Location endpoint
//
// One function, same pattern as emergency/api/alerts.js.
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/**
 * POST /emergency/locations — records one GPS reading for the caller.
 * @param {{ latitude: number, longitude: number, accuracyMeters?: number, batteryLevel?: number, recordedAt?: string, source?: string }} location
 */
export function recordLocation(location) {
  return apiRequest('/emergency/locations', { method: 'POST', body: location });
}

/**
 * GET /emergency/locations/latest — most recent reading for the given (or
 * caller's own) elderly user, or `{ location: null }` if none exists yet.
 * This is the "their last known location" source for a family member
 * setting a zone's centre — never the family member's own device position.
 */
export function getLatestLocation({ elderlyUserId } = {}) {
  const params = new URLSearchParams();
  if (elderlyUserId) params.set('elderlyUserId', elderlyUserId);
  const query = params.toString();
  return apiRequest(`/emergency/locations/latest${query ? `?${query}` : ''}`);
}
