// ============================================================================
// Caregiver Booking Service
// ============================================================================

import { query } from '../../shared/db/pool.js';
import { notFound, forbidden, badRequest } from '../../shared/http/errors.js';

export function toBookingResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    elderlyUserId: row.elderly_user_id,
    elderlyName: row.elderly_name,
    elderlyPhone: row.elderly_phone,
    caregiverId: row.caregiver_id,
    caregiverName: row.caregiver_name,
    caregiverPhone: row.caregiver_phone,
    bookedByUserId: row.booked_by_user_id,
    bookedByName: row.booked_by_name,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    recurrence: row.recurrence,
    hoursPerVisit: row.hours_per_visit ? parseFloat(row.hours_per_visit) : null,
    agreedRate: row.agreed_rate ? parseFloat(row.agreed_rate) : null,
    currency: row.currency,
    specialInstructions: row.special_instructions,
    cancellationReason: row.cancellation_reason,
    cancelledBy: row.cancelled_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BOOKING_SELECT = `
  SELECT b.*,
         eu.full_name AS elderly_name, eu.phone AS elderly_phone,
         cu.full_name AS caregiver_name, cu.phone AS caregiver_phone,
         bu.full_name AS booked_by_name
    FROM caregiver_bookings b
    JOIN users eu ON eu.id = b.elderly_user_id
    JOIN caregivers c ON c.id = b.caregiver_id
    JOIN users cu ON cu.id = c.user_id
    LEFT JOIN users bu ON bu.id = b.booked_by_user_id
`;

export async function createBooking(data, bookedByUserId) {
  const {
    elderlyUserId,
    caregiverId,
    startDate,
    endDate,
    recurrence,
    hoursPerVisit,
    agreedRate,
    currency,
    specialInstructions,
  } = data;

  // Verify caregiver exists and is verified
  const { rows: cgRows } = await query(
    `SELECT id, is_available, verification_status FROM caregivers WHERE id = $1`,
    [caregiverId]
  );
  if (!cgRows[0]) {
    throw notFound('caregiver_not_found', 'Selected caregiver does not exist.');
  }

  const { rows } = await query(
    `INSERT INTO caregiver_bookings (
        elderly_user_id, caregiver_id, booked_by_user_id,
        start_date, end_date, recurrence, hours_per_visit,
        agreed_rate, currency, special_instructions, status
     ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'requested'
     )
     RETURNING id`,
    [
      elderlyUserId,
      caregiverId,
      bookedByUserId,
      startDate,
      endDate,
      recurrence,
      hoursPerVisit,
      agreedRate,
      currency,
      specialInstructions,
    ]
  );

  return findBookingById(rows[0].id);
}

export async function findBookingById(id) {
  const { rows } = await query(`${BOOKING_SELECT} WHERE b.id = $1`, [id]);
  if (!rows[0]) {
    throw notFound('booking_not_found', 'Caregiver booking not found.');
  }
  return toBookingResponse(rows[0]);
}

export async function listBookingsForUser(user, filters = {}) {
  const conditions = [];
  const params = [];

  if (user.role === 'caregiver') {
    // Caregiver sees bookings where they are the caregiver
    params.push(user.id);
    conditions.push(`c.user_id = $${params.length}`);
  } else if (user.role === 'elderly') {
    // Elderly user sees their own bookings
    params.push(user.id);
    conditions.push(`b.elderly_user_id = $${params.length}`);
  } else if (user.role === 'family') {
    // Family sees bookings they booked or linked elderly users
    params.push(user.id);
    conditions.push(`(
      b.booked_by_user_id = $${params.length} OR
      b.elderly_user_id IN (
        SELECT elderly_user_id FROM family_links
         WHERE family_user_id = $${params.length} AND status = 'active'
      )
    )`);
  }
  // Admin has no condition filter unless provided in query

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`b.status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `${BOOKING_SELECT}
     ${whereClause}
     ORDER BY b.created_at DESC`,
    params
  );

  return rows.map(toBookingResponse);
}

export async function updateBookingStatus(bookingId, newStatus, user, cancellationReason = null) {
  const booking = await findBookingById(bookingId);

  // Check caregiver ownership
  const { rows: cgRows } = await query(
    `SELECT user_id FROM caregivers WHERE id = $1`,
    [booking.caregiverId]
  );
  const isAssignedCaregiver = cgRows[0]?.user_id === user.id;
  const isElderlyOwner = booking.elderlyUserId === user.id;
  const isBooker = booking.bookedByUserId === user.id;
  const isAdmin = user.role === 'admin';

  if (newStatus === 'confirmed' || newStatus === 'rejected') {
    if (!isAssignedCaregiver && !isAdmin) {
      throw forbidden('not_authorized', 'Only the assigned caregiver or admin can accept or reject a booking.');
    }
  } else if (newStatus === 'cancelled') {
    if (!isAssignedCaregiver && !isElderlyOwner && !isBooker && !isAdmin) {
      throw forbidden('not_authorized', 'You do not have permission to cancel this booking.');
    }
  } else if (newStatus === 'active' || newStatus === 'completed') {
    if (!isAssignedCaregiver && !isAdmin) {
      throw forbidden('not_authorized', 'Only the caregiver or admin can mark booking as active/completed.');
    }
  }

  const { rows } = await query(
    `UPDATE caregiver_bookings
        SET status              = $1::booking_status,
            cancellation_reason = CASE WHEN $1::text = 'cancelled' THEN $2 ELSE cancellation_reason END,
            cancelled_by        = CASE WHEN $1::text = 'cancelled' THEN $3::uuid ELSE cancelled_by END
      WHERE id = $4
      RETURNING id`,
    [newStatus, cancellationReason, user.id, bookingId]
  );

  return findBookingById(rows[0].id);
}
