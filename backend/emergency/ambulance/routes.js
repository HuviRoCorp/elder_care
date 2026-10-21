// ============================================================================
// Ambulance Booking Routes — mounted under /emergency/ambulance
//
//   POST /emergency/ambulance/bookings          create an ambulance booking
//   GET  /emergency/ambulance/bookings/active   get active booking for caller
//   GET  /emergency/ambulance/bookings/:id      get specific booking details
//   GET  /emergency/ambulance/bookings          list booking history for caller
//   POST /emergency/ambulance/bookings/:id/cancel cancel an active booking
// ============================================================================

import { Router } from 'express';
import { badRequest, conflict, notFound } from '../../shared/http/errors.js';
import { requireAuth } from '../../shared/auth/middleware.js';
import {
  createAmbulanceBooking,
  findActiveBooking,
  findBookingById,
  listUserBookings,
  cancelAmbulanceBooking,
} from './ambulance.js';

export const ambulanceRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateBookingInput(body = {}) {
  const { pickupAddress, destinationHospital, pickupLatitude, pickupLongitude, notes } = body;
  const errors = [];

  if (!pickupAddress || typeof pickupAddress !== 'string' || !pickupAddress.trim()) {
    errors.push({ field: 'pickupAddress', message: 'Pickup location is required.' });
  }

  if (
    !destinationHospital ||
    typeof destinationHospital !== 'string' ||
    !destinationHospital.trim()
  ) {
    errors.push({ field: 'destinationHospital', message: 'Destination hospital is required.' });
  }

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'One or more fields are invalid.', { details: errors });
  }

  return {
    pickupAddress: pickupAddress.trim(),
    destinationHospital: destinationHospital.trim(),
    pickupLatitude: typeof pickupLatitude === 'number' ? pickupLatitude : null,
    pickupLongitude: typeof pickupLongitude === 'number' ? pickupLongitude : null,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
  };
}

// All ambulance routes require authentication
ambulanceRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// POST /emergency/ambulance/bookings
// ---------------------------------------------------------------------------
ambulanceRouter.post('/bookings', async (req, res) => {
  const input = validateBookingInput(req.body);

  // Prevent duplicate active bookings for the same user
  const active = await findActiveBooking(req.user.id);
  if (active) {
    throw conflict(
      'active_booking_exists',
      'You already have an active ambulance request. Please view or cancel your current request.',
      { booking: active }
    );
  }

  const booking = await createAmbulanceBooking(req.user.id, input);
  res.status(201).json({ status: 'ok', booking });
});

// ---------------------------------------------------------------------------
// GET /emergency/ambulance/bookings/active
// ---------------------------------------------------------------------------
ambulanceRouter.get('/bookings/active', async (req, res) => {
  const booking = await findActiveBooking(req.user.id);
  res.json({ status: 'ok', booking });
});

// ---------------------------------------------------------------------------
// GET /emergency/ambulance/bookings/:id
// ---------------------------------------------------------------------------
ambulanceRouter.get('/bookings/:id', async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    throw badRequest('validation_failed', 'Booking id must be a valid UUID.', {
      details: [{ field: 'id', message: 'Must be a UUID.' }],
    });
  }

  const booking = await findBookingById(id, req.user.id);
  if (!booking) {
    throw notFound('booking_not_found', 'No ambulance booking found with that ID.');
  }

  res.json({ status: 'ok', booking });
});

// ---------------------------------------------------------------------------
// GET /emergency/ambulance/bookings
// ---------------------------------------------------------------------------
ambulanceRouter.get('/bookings', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const bookings = await listUserBookings(req.user.id, limit);
  res.json({ status: 'ok', count: bookings.length, bookings });
});

// ---------------------------------------------------------------------------
// POST /emergency/ambulance/bookings/:id/cancel
// ---------------------------------------------------------------------------
ambulanceRouter.post('/bookings/:id/cancel', async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    throw badRequest('validation_failed', 'Booking id must be a valid UUID.', {
      details: [{ field: 'id', message: 'Must be a UUID.' }],
    });
  }

  const cancelled = await cancelAmbulanceBooking(id, req.user.id);
  if (!cancelled) {
    const existing = await findBookingById(id, req.user.id);
    if (!existing) {
      throw notFound('booking_not_found', 'No ambulance booking found with that ID.');
    }
    throw conflict('booking_not_active', 'This ambulance booking is no longer active.');
  }

  res.json({ status: 'ok', booking: cancelled });
});
