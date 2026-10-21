// ============================================================================
// Caregiver activity report endpoints
//
// vitals (JSONB on the row) has no UI anywhere in this app, same as
// photoUrls — no structured input exists for an arbitrary JSON object any
// more than for a file upload. Neither is sent by createActivityReport here.
// See BUILD_LOG.md.
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/**
 * POST /caregiver/reports — the caller must be the assigned caregiver named
 * in caregiverId (or admin). One report per (caregiverId, elderlyUserId,
 * reportDate) — uq_report_per_day, backend/shared/db/schema.sql — a second
 * attempt on the same day 409s as duplicate_report.
 * @param {object} input
 * @param {string} input.caregiverId
 * @param {string} input.elderlyUserId
 * @param {string} [input.scheduleId]
 * @param {string} [input.carePlanId]
 * @param {string} input.reportDate  YYYY-MM-DD
 * @param {string} input.summary
 * @param {string} [input.mealsTaken]
 * @param {string} [input.medicationsGiven]
 * @param {string} [input.mood]
 * @param {number} [input.sleepHours]  0-24
 * @param {string} [input.concerns]
 */
export function createActivityReport(input) {
  return apiRequest('/caregiver/reports', { method: 'POST', body: input });
}

/**
 * GET /caregiver/reports — scoped server-side same as schedules/attendance.
 * No scheduleId filter exists — resolve "the report for this visit" via
 * caregiverId + elderlyUserId + a date range covering the visit date, same
 * as the uniqueness constraint the backend itself enforces.
 * @param {object} [filters]
 * @param {string} [filters.elderlyUserId]
 * @param {string} [filters.caregiverId]
 * @param {string} [filters.startDate]
 * @param {string} [filters.endDate]
 */
export function listActivityReports(filters = {}) {
  const params = new URLSearchParams();
  if (filters.elderlyUserId) params.set('elderlyUserId', filters.elderlyUserId);
  if (filters.caregiverId) params.set('caregiverId', filters.caregiverId);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  const query = params.toString();
  return apiRequest(`/caregiver/reports${query ? `?${query}` : ''}`);
}

/** GET /caregiver/reports/:id */
export function getActivityReport(id) {
  return apiRequest(`/caregiver/reports/${id}`);
}
