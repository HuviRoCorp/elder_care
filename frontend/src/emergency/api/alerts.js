// ============================================================================
// Emergency alert endpoints
//
// One function per endpoint in API.md, same pattern as shared/api/auth.js —
// a screen never writes a URL, so if the contract changes it changes here and
// nowhere else.
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/**
 * POST /emergency/alerts — presses SOS for the signed-in user.
 *
 * If one is already active, the server answers 409 `sos_already_active` and
 * includes the existing alert on the error. That is not a failure to show the
 * user — see ElderlyHomeScreen, which treats it as reassurance ("help is
 * already on the way") rather than an error.
 *
 * @param {{ latitude: number, longitude: number, accuracyMeters?: number, isApproximate?: boolean, recordedAt?: string } | null} [location]
 *   Captured at press time, best-effort — omit entirely if no fix (fresh or
 *   last-known) was available in time. Never wait on this to fire the alert;
 *   see ElderlyHomeScreen. `isApproximate: true` marks a getLastKnownPositionAsync
 *   floor value rather than a fresh reading.
 */
export function createSosAlert(location) {
  return apiRequest('/emergency/alerts', {
    method: 'POST',
    body: location
      ? {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracyMeters: location.accuracyMeters ?? undefined,
          isApproximate: location.isApproximate ?? undefined,
          capturedAt: location.recordedAt ?? undefined,
        }
      : undefined,
  });
}

/**
 * PATCH /emergency/alerts/:id/location — attaches a fresh fix that landed
 * after the alert already sent. Owner only; accepted regardless of the
 * alert's current status. See ElderlyHomeScreen's async-attach flow.
 * @param {string} id
 * @param {{ latitude: number, longitude: number, accuracyMeters?: number, recordedAt?: string }} location
 */
export function attachAlertLocation(id, location) {
  return apiRequest(`/emergency/alerts/${id}/location`, {
    method: 'PATCH',
    body: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracyMeters: location.accuracyMeters ?? undefined,
      capturedAt: location.recordedAt ?? undefined,
    },
  });
}

/**
 * POST /emergency/alerts/fall — triggers a manual fall alert for the signed-in user.
 * @param {{ latitude: number, longitude: number } | null} [location]
 * @param {string} [message]
 */
export function createFallAlert(location, message) {
  return apiRequest('/emergency/alerts/fall', {
    method: 'POST',
    body: {
      latitude: location?.latitude ?? undefined,
      longitude: location?.longitude ?? undefined,
      message: message || undefined,
    },
  });
}

/**
 * GET /emergency/alerts — the caller's own alerts, newest first.
 * @param {object} [options]
 * @param {string} [options.status] filter, e.g. 'active'
 * @param {number} [options.limit]
 */
export function listAlerts({ status, limit } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return apiRequest(`/emergency/alerts${query ? `?${query}` : ''}`);
}

/** POST /emergency/alerts/:id/cancel — "that was a mistake", owner only. */
export function cancelAlert(id, note) {
  return apiRequest(`/emergency/alerts/${id}/cancel`, { method: 'POST', body: note ? { note } : undefined });
}

/** POST /emergency/alerts/:id/resolve — "this is handled", owner or a permitted family member. */
export function resolveAlert(id, note) {
  return apiRequest(`/emergency/alerts/${id}/resolve`, { method: 'POST', body: note ? { note } : undefined });
}

/**
 * POST /emergency/alerts/:id/acknowledge — "I've seen this", a permitted
 * family member only. Does not close the alert, only stops it escalating to
 * the next emergency contact.
 *
 * If someone else already acknowledged it, the server answers 409
 * `alert_already_acknowledged` with the current alert attached — reassurance
 * ("someone's already on it"), not an error. See FamilyHomeScreen.
 */
export function acknowledgeAlert(id) {
  return apiRequest(`/emergency/alerts/${id}/acknowledge`, { method: 'POST' });
}

/** GET /emergency/family/alerts — active alerts for elderly users the caller is linked to. */
export function listFamilyAlerts() {
  return apiRequest('/emergency/family/alerts');
}

/**
 * GET /emergency/family/alerts/history — resolved/cancelled alerts from the
 * last 7 days for elderly users the caller is linked to. The window is fixed
 * server-side; only `limit` is a caller option.
 */
export function listFamilyAlertHistory({ limit } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return apiRequest(`/emergency/family/alerts/history${query ? `?${query}` : ''}`);
}
