// ============================================================================
// Caregiver schedule endpoints
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/**
 * POST /caregiver/schedules — create a visit slot from a confirmed booking.
 * Permitted actors: the elderly user themselves, the assigned caregiver,
 * family with hasManageCaregiversPermission, or admin (schedules.routes.js).
 * Rejects with 409 schedule_conflict if this caregiver already has an
 * overlapping slot on the same day.
 * @param {object} input
 * @param {string} input.bookingId
 * @param {string} input.caregiverId
 * @param {string} input.elderlyUserId
 * @param {string} input.visitDate   YYYY-MM-DD
 * @param {string} input.startTime  HH:MM
 * @param {string} input.endTime    HH:MM, must be after startTime
 * @param {string} [input.notes]
 */
export function createSchedule(input) {
  return apiRequest('/caregiver/schedules', { method: 'POST', body: input });
}

/**
 * GET /caregiver/schedules — scoped server-side to the caller's role: elderly
 * sees their own, family sees their own plus every active linked elderly
 * user's, caregiver sees their own assigned slots, admin sees all. Each row
 * embeds the linked attendance record's status/check-in/check-out inline
 * (attendanceId/attendanceStatus/checkInAt/checkOutAt) — no separate
 * attendance fetch needed for a list.
 * @param {object} [filters]
 * @param {string} [filters.caregiverId]
 * @param {string} [filters.elderlyUserId]
 * @param {string} [filters.startDate]  YYYY-MM-DD
 * @param {string} [filters.endDate]    YYYY-MM-DD
 * @param {string} [filters.status]     scheduled | completed | missed | cancelled | rescheduled
 */
export function listSchedules(filters = {}) {
  const params = new URLSearchParams();
  if (filters.caregiverId) params.set('caregiverId', filters.caregiverId);
  if (filters.elderlyUserId) params.set('elderlyUserId', filters.elderlyUserId);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.status) params.set('status', filters.status);
  const query = params.toString();
  return apiRequest(`/caregiver/schedules${query ? `?${query}` : ''}`);
}

/** GET /caregiver/schedules/:id */
export function getSchedule(id) {
  return apiRequest(`/caregiver/schedules/${id}`);
}

/**
 * PATCH /caregiver/schedules/:id — change a slot's status (e.g. mark missed
 * or cancelled). Same actors as create. Not called from any screen yet — no
 * UI need for it beyond the check-in/check-out flow, which drives status via
 * the attendance endpoints instead. Kept here because the endpoint exists and
 * is documented in API.md.
 */
export function updateScheduleStatus(id, { status, notes } = {}) {
  return apiRequest(`/caregiver/schedules/${id}`, { method: 'PATCH', body: { status, notes } });
}
