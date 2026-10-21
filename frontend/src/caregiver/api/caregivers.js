// ============================================================================
// Caregiver profile & search endpoints
//
// One function per endpoint in API.md's "Caregiver Profiles, Search &
// Booking" section — a screen never writes a URL, same pattern as every
// other api/ file in this app.
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/**
 * POST /caregiver/profile — create or update the caller's own profile
 * (upsert; ON CONFLICT DO UPDATE server-side, so this is both "create" and
 * "edit"). Any field omitted leaves the existing value untouched.
 * @param {object} input
 * @param {string} [input.bio]
 * @param {number} [input.experienceYears]  0-70
 * @param {string} [input.qualifications]
 * @param {string[]} [input.specializations]
 * @param {string[]} [input.languages]
 * @param {number} [input.hourlyRate]
 * @param {string} [input.serviceAreaCity]
 * @param {boolean} [input.isAvailable]
 */
export function upsertCaregiverProfile(input) {
  return apiRequest('/caregiver/profile', { method: 'POST', body: input });
}

/** GET /caregiver/profile/me — the caller's own profile, or `{ caregiver: null }` before one exists. */
export function getMyCaregiverProfile() {
  return apiRequest('/caregiver/profile/me');
}

/**
 * GET /caregiver/search — verified + available caregivers by default.
 * @param {object} [filters]
 * @param {string} [filters.city]
 * @param {string} [filters.language]
 * @param {string} [filters.specialization]
 * @param {number} [filters.minRating]
 * @param {number} [filters.page]
 * @param {number} [filters.limit]
 */
export function searchCaregivers(filters = {}) {
  const params = new URLSearchParams();
  if (filters.city) params.set('city', filters.city);
  if (filters.language) params.set('language', filters.language);
  if (filters.specialization) params.set('specialization', filters.specialization);
  if (filters.minRating) params.set('minRating', String(filters.minRating));
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  const query = params.toString();
  return apiRequest(`/caregiver/search${query ? `?${query}` : ''}`);
}

/** GET /caregiver/:id — one caregiver's full profile. */
export function getCaregiverById(id) {
  return apiRequest(`/caregiver/${id}`);
}

/** GET /caregiver/verification-queue — admin only. Caregivers awaiting verification, oldest first. */
export function listPendingCaregivers() {
  return apiRequest('/caregiver/verification-queue');
}

/**
 * PATCH /caregiver/:id/verification — admin only.
 * @param {string} id
 * @param {'verified'|'rejected'} verificationStatus
 */
export function updateCaregiverVerification(id, verificationStatus) {
  return apiRequest(`/caregiver/${id}/verification`, { method: 'PATCH', body: { verificationStatus } });
}
