// ============================================================================
// Ambulance Booking API Client Functions
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/**
 * Creates an emergency ambulance booking.
 *
 * @param {object} input
 * @param {string} input.pickupAddress
 * @param {string} input.destinationHospital
 * @param {number} [input.pickupLatitude]
 * @param {number} [input.pickupLongitude]
 * @param {string} [input.notes]
 */
export function createAmbulanceBooking(input) {
  return apiRequest('/emergency/ambulance/bookings', {
    method: 'POST',
    body: input,
  });
}

/** Fetches the currently active ambulance booking for the user, if any. */
export function getActiveAmbulanceBooking() {
  return apiRequest('/emergency/ambulance/bookings/active');
}

/** Fetches specific ambulance booking details by ID. */
export function getAmbulanceBooking(id) {
  return apiRequest(`/emergency/ambulance/bookings/${id}`);
}

/** Lists user's historical and current ambulance bookings. */
export function listAmbulanceBookings(limit = 20) {
  return apiRequest(`/emergency/ambulance/bookings?limit=${limit}`);
}

/** Cancels an active ambulance booking. */
export function cancelAmbulanceBooking(id) {
  return apiRequest(`/emergency/ambulance/bookings/${id}/cancel`, {
    method: 'POST',
  });
}
