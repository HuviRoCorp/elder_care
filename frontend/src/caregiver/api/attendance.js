// ============================================================================
// Caregiver attendance endpoints (GPS check-in / check-out)
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/**
 * POST /caregiver/attendance/schedules/:scheduleId/check-in — assigned
 * caregiver or admin only. No accuracy field and no distance-from-elderly
 * validation server-side — whatever coordinates are sent are stored as-is.
 * See BUILD_LOG.md, 2026-08-29, "Scheduling and attendance screens" — flagged
 * as a known gap, not fixed here.
 * @param {string} scheduleId
 * @param {object} input
 * @param {number} [input.latitude]
 * @param {number} [input.longitude]
 * @param {string} [input.notes]
 */
export function checkIn(scheduleId, input = {}) {
  return apiRequest(`/caregiver/attendance/schedules/${scheduleId}/check-in`, { method: 'POST', body: input });
}

/**
 * POST /caregiver/attendance/schedules/:scheduleId/check-out — assigned
 * caregiver or admin only. 400 not_checked_in if there is no check-in yet
 * for this schedule.
 * @param {string} scheduleId
 * @param {object} input
 * @param {number} [input.latitude]
 * @param {number} [input.longitude]
 * @param {string} [input.notes]
 */
export function checkOut(scheduleId, input = {}) {
  return apiRequest(`/caregiver/attendance/schedules/${scheduleId}/check-out`, { method: 'POST', body: input });
}

/**
 * PATCH /caregiver/attendance/:id/verify — elderly self, family with
 * hasManageCaregiversPermission, or admin. Caregiver excluded server-side —
 * verifying your own attendance defeats the point of the confirmation.
 * Idempotent: verifying an already-verified record just re-sets the same flag.
 */
export function verifyAttendance(id) {
  return apiRequest(`/caregiver/attendance/${id}/verify`, { method: 'PATCH' });
}

/**
 * GET /caregiver/attendance — scoped server-side same as listSchedules.
 * @param {object} [filters]
 * @param {string} [filters.caregiverId]
 * @param {string} [filters.elderlyUserId]
 * @param {string} [filters.status]  pending | checked_in | checked_out | absent | late
 */
export function listAttendance(filters = {}) {
  const params = new URLSearchParams();
  if (filters.caregiverId) params.set('caregiverId', filters.caregiverId);
  if (filters.elderlyUserId) params.set('elderlyUserId', filters.elderlyUserId);
  if (filters.status) params.set('status', filters.status);
  const query = params.toString();
  return apiRequest(`/caregiver/attendance${query ? `?${query}` : ''}`);
}

/** GET /caregiver/attendance/:id */
export function getAttendance(id) {
  return apiRequest(`/caregiver/attendance/${id}`);
}
