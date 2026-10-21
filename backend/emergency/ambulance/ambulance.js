// ============================================================================
// Ambulance Booking Data Access & Service Logic
//
// Interacts with PostgreSQL table `ambulance_bookings`.
// Integrates with MockAmbulanceProvider for automated simulated dispatch.
// ============================================================================

import { query } from '../../shared/db/pool.js';
import { dispatchAmbulance } from './mockProvider.js';

export function toPublicBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    alertId: row.alert_id ?? null,
    requestedBy: row.requested_by ?? null,
    pickupLatitude: row.pickup_latitude ? Number(row.pickup_latitude) : null,
    pickupLongitude: row.pickup_longitude ? Number(row.pickup_longitude) : null,
    pickupAddress: row.pickup_address ?? null,
    destinationHospital: row.destination_hospital ?? null,
    status: row.status,
    providerName: row.provider_name ?? null,
    providerReference: row.provider_reference ?? null,
    driverName: row.driver_name ?? null,
    driverPhone: row.driver_phone ?? null,
    vehicleNumber: row.vehicle_number ?? null,
    etaMinutes: row.eta_minutes ?? null,
    notes: row.notes ?? null,
    requestedAt: row.requested_at,
    dispatchedAt: row.dispatched_at ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Finds an active ambulance booking for a user ('requested', 'dispatched', 'en_route', 'arrived'). */
export async function findActiveBooking(userId) {
  const { rows } = await query(
    `SELECT * FROM ambulance_bookings
      WHERE user_id = $1
        AND status IN ('requested', 'dispatched', 'en_route', 'arrived')
      ORDER BY requested_at DESC
      LIMIT 1`,
    [userId]
  );
  return rows[0] ? toPublicBooking(rows[0]) : null;
}

/** Finds a specific ambulance booking by ID. */
export async function findBookingById(id, userId) {
  const { rows } = await query(
    `SELECT * FROM ambulance_bookings
      WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] ? toPublicBooking(rows[0]) : null;
}

/** Lists all ambulance bookings for a user. */
export async function listUserBookings(userId, limit = 20) {
  const { rows } = await query(
    `SELECT * FROM ambulance_bookings
      WHERE user_id = $1
      ORDER BY requested_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows.map(toPublicBooking);
}

/**
 * Creates an emergency ambulance booking.
 * Dispatches the mock provider immediately upon creation.
 */
export async function createAmbulanceBooking(userId, data) {
  const {
    pickupAddress,
    destinationHospital,
    pickupLatitude = null,
    pickupLongitude = null,
    notes = null,
  } = data;

  // 1. Initial insert into ambulance_bookings
  const { rows } = await query(
    `INSERT INTO ambulance_bookings (
        user_id,
        pickup_address,
        destination_hospital,
        pickup_latitude,
        pickup_longitude,
        notes,
        status,
        requested_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'requested', now())
      RETURNING *`,
    [userId, pickupAddress, destinationHospital, pickupLatitude, pickupLongitude, notes]
  );

  const initialRow = rows[0];

  // 2. Trigger mock provider dispatch
  let dispatchResult;
  try {
    dispatchResult = await dispatchAmbulance({
      id: initialRow.id,
      pickupAddress,
      destinationHospital,
    });
  } catch (err) {
    console.error('Mock provider dispatch error:', err);
    return toPublicBooking(initialRow);
  }

  // 3. Update booking record with dispatched details
  const { rows: updatedRows } = await query(
    `UPDATE ambulance_bookings
        SET status = $1,
            provider_name = $2,
            provider_reference = $3,
            driver_name = $4,
            driver_phone = $5,
            vehicle_number = $6,
            eta_minutes = $7,
            dispatched_at = $8
      WHERE id = $9
      RETURNING *`,
    [
      dispatchResult.status,
      dispatchResult.providerName,
      dispatchResult.providerReference,
      dispatchResult.driverName,
      dispatchResult.driverPhone,
      dispatchResult.vehicleNumber,
      dispatchResult.etaMinutes,
      dispatchResult.dispatchedAt,
      initialRow.id,
    ]
  );

  return toPublicBooking(updatedRows[0]);
}

/** Cancels an active ambulance booking. */
export async function cancelAmbulanceBooking(id, userId) {
  const { rows } = await query(
    `UPDATE ambulance_bookings
        SET status = 'cancelled',
            completed_at = now()
      WHERE id = $1
        AND user_id = $2
        AND status IN ('requested', 'dispatched', 'en_route', 'arrived')
      RETURNING *`,
    [id, userId]
  );

  return rows[0] ? toPublicBooking(rows[0]) : null;
}
