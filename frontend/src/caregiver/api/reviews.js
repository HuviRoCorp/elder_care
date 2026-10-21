// ============================================================================
// Caregiver review endpoints
//
// No PATCH exists here (reviews.routes.js has POST / and GET only) — matches
// uq_review_per_booking (booking_id, reviewer_user_id): a review is
// create-once by design, not an editable draft.
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/**
 * POST /caregiver/reviews — the booking's elderly user, whoever booked it,
 * family with hasManageCaregiversPermission for that elderly user, or admin.
 * The booking must be this caregiver's and status "completed" — checked
 * server-side against the booking, not trusted from the client.
 * @param {object} input
 * @param {string} input.caregiverId
 * @param {string} input.bookingId
 * @param {number} input.rating                1-5
 * @param {number} [input.punctualityRating]   1-5
 * @param {number} [input.careQualityRating]   1-5
 * @param {number} [input.communicationRating] 1-5
 * @param {string} [input.comment]
 */
export function createReview(input) {
  return apiRequest('/caregiver/reviews', { method: 'POST', body: input });
}

/** GET /caregiver/reviews/caregiver/:caregiverId — visible reviews for one caregiver, newest first. */
export function listReviewsForCaregiver(caregiverId) {
  return apiRequest(`/caregiver/reviews/caregiver/${caregiverId}`);
}

/** GET /caregiver/reviews/:id */
export function getReview(id) {
  return apiRequest(`/caregiver/reviews/${id}`);
}
