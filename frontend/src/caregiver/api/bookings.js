// ============================================================================
// Caregiver booking endpoints
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/**
 * POST /caregiver/bookings — request a caregiver. `elderlyUserId` is the
 * elderly account this booking is for (self, for an elderly caller; the
 * linked elderly user, for a family caller — the server checks
 * hasManageCaregiversPermission either way).
 * @param {object} input
 * @param {string} input.elderlyUserId
 * @param {string} input.caregiverId
 * @param {string} input.startDate       YYYY-MM-DD
 * @param {string} [input.endDate]       YYYY-MM-DD
 * @param {string} [input.recurrence]    one_time | daily | weekly | monthly
 * @param {number} [input.hoursPerVisit] 0-24
 * @param {string} [input.specialInstructions]
 */
export function createBooking(input) {
  return apiRequest('/caregiver/bookings', { method: 'POST', body: input });
}

/** GET /caregiver/bookings — the caller's own bookings, scoped by role server-side. */
export function listBookings({ status } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const query = params.toString();
  return apiRequest(`/caregiver/bookings${query ? `?${query}` : ''}`);
}

/** GET /caregiver/bookings/:id */
export function getBooking(id) {
  return apiRequest(`/caregiver/bookings/${id}`);
}

/**
 * PATCH /caregiver/bookings/:id/status — confirm/reject/cancel/mark
 * active/complete. Who can make which transition is enforced server-side;
 * screens hide actions that would 403 rather than relying on this to say no.
 */
export function updateBookingStatus(id, { status, cancellationReason } = {}) {
  return apiRequest(`/caregiver/bookings/${id}/status`, { method: 'PATCH', body: { status, cancellationReason } });
}
