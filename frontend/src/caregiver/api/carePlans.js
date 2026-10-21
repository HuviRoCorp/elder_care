// ============================================================================
// Caregiver care plan endpoints
//
// Permission model (care-plans.routes.js): write (POST/PATCH) is the elderly
// user themselves, a family member with hasManageCaregiversPermission, or
// admin — caregiver excluded at the role gate entirely. Read (GET) is the
// same set, plus a caregiver with a real assignment to that elderly user
// (caregiverHasAssignmentWith — a confirmed/active/completed booking, or a
// schedule). There is no separate read-only tier for family: the same flag
// that grants read grants write, so a family member who can see a plan can
// always also edit it. See BUILD_LOG.md.
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/**
 * POST /caregiver/care-plans — elderly self, family with
 * hasManageCaregiversPermission, or admin.
 * @param {object} input
 * @param {string} input.elderlyUserId
 * @param {string} input.title              1-150 chars
 * @param {string} [input.description]
 * @param {string} [input.medicalConditions]
 * @param {string} [input.allergies]
 * @param {string} [input.medications]
 * @param {string} [input.dietaryNotes]
 * @param {string} [input.mobilityNotes]
 * @param {string} [input.emergencyInstructions]
 * @param {string} [input.startDate]  YYYY-MM-DD
 * @param {string} [input.endDate]    YYYY-MM-DD
 * @param {string} [input.status]     draft | active | archived, defaults to active
 */
export function createCarePlan(input) {
  return apiRequest('/caregiver/care-plans', { method: 'POST', body: input });
}

/**
 * GET /caregiver/care-plans/elderly/:elderlyUserId — every care plan on file
 * for this elderly user (a history, not a single record — draft/active/
 * archived can all coexist). Newest first.
 * @param {string} elderlyUserId
 * @param {string} [status]  draft | active | archived
 */
export function listCarePlansForElderly(elderlyUserId, status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest(`/caregiver/care-plans/elderly/${elderlyUserId}${query}`);
}

/** GET /caregiver/care-plans/:id */
export function getCarePlan(id) {
  return apiRequest(`/caregiver/care-plans/${id}`);
}

/**
 * PATCH /caregiver/care-plans/:id — every field optional, at least one
 * required. Same write permission as create.
 */
export function updateCarePlan(id, patch) {
  return apiRequest(`/caregiver/care-plans/${id}`, { method: 'PATCH', body: patch });
}
