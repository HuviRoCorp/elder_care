// ============================================================================
// Input validation for the caregiver module (Phase 2 & Phase 4)
// ============================================================================

import { badRequest } from '../../shared/http/errors.js';

function fieldErrors(checks) {
  return checks.filter((c) => c.when).map(({ field, message }) => ({ field, message }));
}

export const VALID_RECURRENCES = ['one_time', 'daily', 'weekly', 'monthly'];
export const VALID_BOOKING_STATUSES = ['requested', 'confirmed', 'active', 'completed', 'cancelled', 'rejected'];
export const VALID_SCHEDULE_STATUSES = ['scheduled', 'completed', 'missed', 'cancelled', 'rescheduled'];
export const VALID_VERIFICATION_STATUSES = ['pending', 'verified', 'rejected', 'suspended'];
export const VALID_TASK_PRIORITIES = ['low', 'normal', 'high'];
export const VALID_TASK_STATUSES = ['pending', 'in_progress', 'completed', 'skipped', 'cancelled'];
export const VALID_CARE_PLAN_STATUSES = ['draft', 'active', 'archived'];

// UUID format regex
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

export function isUuid(val) {
  return typeof val === 'string' && UUID_RE.test(val);
}

export function validateUuid(val, fieldName = 'id') {
  if (!isUuid(val)) {
    throw badRequest('invalid_id', `${fieldName} must be a valid UUID.`);
  }
}

// ---------------------------------------------------------------------------
// 1. Caregiver Profile Validation
// ---------------------------------------------------------------------------
export function validateCaregiverProfile(body = {}) {
  const {
    bio,
    experienceYears,
    qualifications,
    specializations,
    languages,
    hourlyRate,
    currency,
    serviceAreaCity,
    idProofType,
    isAvailable,
  } = body;

  const errors = fieldErrors([
    {
      when: experienceYears !== undefined && (typeof experienceYears !== 'number' || experienceYears < 0 || experienceYears > 70),
      field: 'experienceYears',
      message: 'Experience years must be a non-negative integer under 70.',
    },
    {
      when: hourlyRate !== undefined && (typeof hourlyRate !== 'number' || hourlyRate < 0),
      field: 'hourlyRate',
      message: 'Hourly rate must be a positive number.',
    },
    {
      when: currency !== undefined && (typeof currency !== 'string' || currency.trim().length !== 3),
      field: 'currency',
      message: 'Currency must be a 3-letter code (e.g. INR).',
    },
    {
      when: serviceAreaCity !== undefined && typeof serviceAreaCity !== 'string',
      field: 'serviceAreaCity',
      message: 'Service area city must be a string.',
    },
    {
      when: specializations !== undefined && !Array.isArray(specializations),
      field: 'specializations',
      message: 'Specializations must be an array of strings.',
    },
    {
      when: languages !== undefined && !Array.isArray(languages),
      field: 'languages',
      message: 'Languages must be an array of strings.',
    },
    {
      when: isAvailable !== undefined && typeof isAvailable !== 'boolean',
      field: 'isAvailable',
      message: 'isAvailable must be a boolean.',
    },
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'Invalid caregiver profile data.', { details: errors });
  }

  return {
    bio: typeof bio === 'string' ? bio.trim() : undefined,
    experienceYears: typeof experienceYears === 'number' ? Math.floor(experienceYears) : undefined,
    qualifications: typeof qualifications === 'string' ? qualifications.trim() : undefined,
    specializations: Array.isArray(specializations) ? specializations.map((s) => String(s).trim()) : undefined,
    languages: Array.isArray(languages) ? languages.map((l) => String(l).trim()) : undefined,
    hourlyRate: typeof hourlyRate === 'number' ? hourlyRate : undefined,
    currency: typeof currency === 'string' ? currency.trim().toUpperCase() : 'INR',
    serviceAreaCity: typeof serviceAreaCity === 'string' ? serviceAreaCity.trim() : undefined,
    idProofType: typeof idProofType === 'string' ? idProofType.trim() : undefined,
    isAvailable: typeof isAvailable === 'boolean' ? isAvailable : undefined,
  };
}

export function validateVerificationStatus(body = {}) {
  const { verificationStatus } = body;
  if (!verificationStatus || !VALID_VERIFICATION_STATUSES.includes(verificationStatus)) {
    throw badRequest(
      'validation_failed',
      `verificationStatus must be one of: ${VALID_VERIFICATION_STATUSES.join(', ')}.`
    );
  }
  return verificationStatus;
}

// ---------------------------------------------------------------------------
// 2. Booking Validation
// ---------------------------------------------------------------------------
export function validateCreateBooking(body = {}) {
  const {
    elderlyUserId,
    caregiverId,
    startDate,
    endDate,
    recurrence = 'one_time',
    hoursPerVisit,
    agreedRate,
    currency = 'INR',
    specialInstructions,
  } = body;

  const errors = fieldErrors([
    { when: !isUuid(elderlyUserId), field: 'elderlyUserId', message: 'Valid elderlyUserId is required.' },
    { when: !isUuid(caregiverId), field: 'caregiverId', message: 'Valid caregiverId is required.' },
    { when: !startDate || !DATE_RE.test(startDate), field: 'startDate', message: 'startDate must be in YYYY-MM-DD format.' },
    { when: endDate && !DATE_RE.test(endDate), field: 'endDate', message: 'endDate must be in YYYY-MM-DD format.' },
    { when: endDate && startDate && endDate < startDate, field: 'endDate', message: 'endDate cannot be earlier than startDate.' },
    { when: !VALID_RECURRENCES.includes(recurrence), field: 'recurrence', message: `recurrence must be one of: ${VALID_RECURRENCES.join(', ')}.` },
    { when: hoursPerVisit !== undefined && (typeof hoursPerVisit !== 'number' || hoursPerVisit <= 0 || hoursPerVisit > 24), field: 'hoursPerVisit', message: 'hoursPerVisit must be between 0 and 24.' },
    { when: agreedRate !== undefined && (typeof agreedRate !== 'number' || agreedRate < 0), field: 'agreedRate', message: 'agreedRate must be a non-negative number.' },
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'Invalid booking request.', { details: errors });
  }

  return {
    elderlyUserId,
    caregiverId,
    startDate,
    endDate: endDate || null,
    recurrence,
    hoursPerVisit: hoursPerVisit ?? null,
    agreedRate: agreedRate ?? null,
    currency: currency ? currency.trim().toUpperCase() : 'INR',
    specialInstructions: typeof specialInstructions === 'string' ? specialInstructions.trim() : null,
  };
}

export function validateBookingStatusUpdate(body = {}) {
  const { status, cancellationReason } = body;
  if (!status || !VALID_BOOKING_STATUSES.includes(status)) {
    throw badRequest('validation_failed', `status must be one of: ${VALID_BOOKING_STATUSES.join(', ')}.`);
  }
  return {
    status,
    cancellationReason: typeof cancellationReason === 'string' ? cancellationReason.trim() : null,
  };
}

// ---------------------------------------------------------------------------
// 3. Schedules Validation
// ---------------------------------------------------------------------------
export function validateCreateSchedule(body = {}) {
  const { bookingId, caregiverId, elderlyUserId, visitDate, startTime, endTime, notes } = body;

  const errors = fieldErrors([
    { when: !isUuid(bookingId), field: 'bookingId', message: 'Valid bookingId is required.' },
    { when: !isUuid(caregiverId), field: 'caregiverId', message: 'Valid caregiverId is required.' },
    { when: !isUuid(elderlyUserId), field: 'elderlyUserId', message: 'Valid elderlyUserId is required.' },
    { when: !visitDate || !DATE_RE.test(visitDate), field: 'visitDate', message: 'visitDate must be in YYYY-MM-DD format.' },
    { when: !startTime || !TIME_RE.test(startTime), field: 'startTime', message: 'startTime must be in HH:MM or HH:MM:SS format.' },
    { when: !endTime || !TIME_RE.test(endTime), field: 'endTime', message: 'endTime must be in HH:MM or HH:MM:SS format.' },
    { when: startTime && endTime && endTime <= startTime, field: 'endTime', message: 'endTime must be after startTime.' },
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'Invalid schedule data.', { details: errors });
  }

  return {
    bookingId,
    caregiverId,
    elderlyUserId,
    visitDate,
    startTime,
    endTime,
    notes: typeof notes === 'string' ? notes.trim() : null,
  };
}

export function validateScheduleStatusUpdate(body = {}) {
  const { status, notes } = body;
  if (!status || !VALID_SCHEDULE_STATUSES.includes(status)) {
    throw badRequest('validation_failed', `status must be one of: ${VALID_SCHEDULE_STATUSES.join(', ')}.`);
  }
  return {
    status,
    notes: typeof notes === 'string' ? notes.trim() : null,
  };
}

// ---------------------------------------------------------------------------
// 4. Attendance Validation
// ---------------------------------------------------------------------------
export function validateAttendanceCheck(body = {}) {
  const { latitude, longitude, notes } = body;
  const errors = fieldErrors([
    {
      when: latitude !== undefined && (typeof latitude !== 'number' || latitude < -90 || latitude > 90),
      field: 'latitude',
      message: 'latitude must be between -90 and 90.',
    },
    {
      when: longitude !== undefined && (typeof longitude !== 'number' || longitude < -180 || longitude > 180),
      field: 'longitude',
      message: 'longitude must be between -180 and 180.',
    },
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'Invalid attendance coordinates.', { details: errors });
  }

  return {
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    notes: typeof notes === 'string' ? notes.trim() : null,
  };
}

// ---------------------------------------------------------------------------
// 5. Care Plan Validation
// ---------------------------------------------------------------------------
export function validateCarePlan(body = {}) {
  const {
    elderlyUserId,
    title,
    description,
    medicalConditions,
    allergies,
    medications,
    dietaryNotes,
    mobilityNotes,
    emergencyInstructions,
    startDate,
    endDate,
    status = 'active',
  } = body;

  const errors = fieldErrors([
    { when: !isUuid(elderlyUserId), field: 'elderlyUserId', message: 'Valid elderlyUserId is required.' },
    { when: !title || typeof title !== 'string' || title.trim().length === 0, field: 'title', message: 'Title is required (1-150 chars).' },
    { when: typeof title === 'string' && title.trim().length > 150, field: 'title', message: 'Title must be 150 chars or fewer.' },
    { when: startDate && !DATE_RE.test(startDate), field: 'startDate', message: 'startDate must be in YYYY-MM-DD format.' },
    { when: endDate && !DATE_RE.test(endDate), field: 'endDate', message: 'endDate must be in YYYY-MM-DD format.' },
    { when: startDate && endDate && endDate < startDate, field: 'endDate', message: 'endDate cannot be earlier than startDate.' },
    { when: status && !VALID_CARE_PLAN_STATUSES.includes(status), field: 'status', message: `status must be one of: ${VALID_CARE_PLAN_STATUSES.join(', ')}.` },
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'Invalid care plan data.', { details: errors });
  }

  return {
    elderlyUserId,
    title: title.trim(),
    description: typeof description === 'string' ? description.trim() : null,
    medicalConditions: typeof medicalConditions === 'string' ? medicalConditions.trim() : null,
    allergies: typeof allergies === 'string' ? allergies.trim() : null,
    medications: typeof medications === 'string' ? medications.trim() : null,
    dietaryNotes: typeof dietaryNotes === 'string' ? dietaryNotes.trim() : null,
    mobilityNotes: typeof mobilityNotes === 'string' ? mobilityNotes.trim() : null,
    emergencyInstructions: typeof emergencyInstructions === 'string' ? emergencyInstructions.trim() : null,
    startDate: startDate || null,
    endDate: endDate || null,
    status,
  };
}

/**
 * PATCH /care-plans/:id — every field optional, at least one required, same
 * per-field rules as validateCarePlan. Used to exist as a raw `req.body`
 * passed straight to updateCarePlan; a bad `status` reached the database as
 * an enum-cast error instead of a clean 400. elderlyUserId is not editable
 * here — a care plan does not change whose it is.
 */
export function validateUpdateCarePlan(body = {}) {
  const {
    title,
    description,
    medicalConditions,
    allergies,
    medications,
    dietaryNotes,
    mobilityNotes,
    emergencyInstructions,
    startDate,
    endDate,
    status,
  } = body;

  const anyFieldProvided = [
    title, description, medicalConditions, allergies, medications,
    dietaryNotes, mobilityNotes, emergencyInstructions, startDate, endDate, status,
  ].some((v) => v !== undefined);

  const errors = fieldErrors([
    { when: !anyFieldProvided, field: 'body', message: 'At least one field must be provided.' },
    { when: title !== undefined && (typeof title !== 'string' || title.trim().length === 0), field: 'title', message: 'Title must be 1-150 characters.' },
    { when: typeof title === 'string' && title.trim().length > 150, field: 'title', message: 'Title must be 150 chars or fewer.' },
    { when: startDate !== undefined && startDate !== null && !DATE_RE.test(startDate), field: 'startDate', message: 'startDate must be in YYYY-MM-DD format.' },
    { when: endDate !== undefined && endDate !== null && !DATE_RE.test(endDate), field: 'endDate', message: 'endDate must be in YYYY-MM-DD format.' },
    { when: startDate && endDate && endDate < startDate, field: 'endDate', message: 'endDate cannot be earlier than startDate.' },
    { when: status !== undefined && !VALID_CARE_PLAN_STATUSES.includes(status), field: 'status', message: `status must be one of: ${VALID_CARE_PLAN_STATUSES.join(', ')}.` },
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'Invalid care plan data.', { details: errors });
  }

  const result = {};
  if (title !== undefined) result.title = title.trim();
  if (description !== undefined) result.description = typeof description === 'string' ? description.trim() : null;
  if (medicalConditions !== undefined) result.medicalConditions = typeof medicalConditions === 'string' ? medicalConditions.trim() : null;
  if (allergies !== undefined) result.allergies = typeof allergies === 'string' ? allergies.trim() : null;
  if (medications !== undefined) result.medications = typeof medications === 'string' ? medications.trim() : null;
  if (dietaryNotes !== undefined) result.dietaryNotes = typeof dietaryNotes === 'string' ? dietaryNotes.trim() : null;
  if (mobilityNotes !== undefined) result.mobilityNotes = typeof mobilityNotes === 'string' ? mobilityNotes.trim() : null;
  if (emergencyInstructions !== undefined) result.emergencyInstructions = typeof emergencyInstructions === 'string' ? emergencyInstructions.trim() : null;
  if (startDate !== undefined) result.startDate = startDate || null;
  if (endDate !== undefined) result.endDate = endDate || null;
  if (status !== undefined) result.status = status;
  return result;
}

// ---------------------------------------------------------------------------
// 6. Tasks Validation
// ---------------------------------------------------------------------------
export function validateCreateTask(body = {}) {
  const {
    carePlanId,
    elderlyUserId,
    assignedToCaregiverId,
    scheduleId,
    title,
    description,
    category,
    priority = 'normal',
    dueDate,
    dueTime,
    recurrence = 'none',
  } = body;

  const errors = fieldErrors([
    { when: !isUuid(elderlyUserId), field: 'elderlyUserId', message: 'Valid elderlyUserId is required.' },
    { when: carePlanId && !isUuid(carePlanId), field: 'carePlanId', message: 'carePlanId must be a valid UUID.' },
    { when: assignedToCaregiverId && !isUuid(assignedToCaregiverId), field: 'assignedToCaregiverId', message: 'assignedToCaregiverId must be a valid UUID.' },
    { when: scheduleId && !isUuid(scheduleId), field: 'scheduleId', message: 'scheduleId must be a valid UUID.' },
    { when: !title || typeof title !== 'string' || title.trim().length === 0, field: 'title', message: 'Title is required (1-150 chars).' },
    { when: typeof title === 'string' && title.trim().length > 150, field: 'title', message: 'Title must be 150 chars or fewer.' },
    { when: priority && !VALID_TASK_PRIORITIES.includes(priority), field: 'priority', message: `priority must be one of: ${VALID_TASK_PRIORITIES.join(', ')}.` },
    { when: dueDate && !DATE_RE.test(dueDate), field: 'dueDate', message: 'dueDate must be in YYYY-MM-DD format.' },
    { when: dueTime && !TIME_RE.test(dueTime), field: 'dueTime', message: 'dueTime must be in HH:MM or HH:MM:SS format.' },
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'Invalid task data.', { details: errors });
  }

  return {
    carePlanId: carePlanId || null,
    elderlyUserId,
    assignedToCaregiverId: assignedToCaregiverId || null,
    scheduleId: scheduleId || null,
    title: title.trim(),
    description: typeof description === 'string' ? description.trim() : null,
    category: typeof category === 'string' ? category.trim() : null,
    priority,
    dueDate: dueDate || null,
    dueTime: dueTime || null,
    recurrence: recurrence || 'none',
  };
}

export function validateTaskStatusUpdate(body = {}) {
  const { status, completionNotes } = body;
  if (!status || !VALID_TASK_STATUSES.includes(status)) {
    throw badRequest('validation_failed', `status must be one of: ${VALID_TASK_STATUSES.join(', ')}.`);
  }
  return {
    status,
    completionNotes: typeof completionNotes === 'string' ? completionNotes.trim() : null,
  };
}

// ---------------------------------------------------------------------------
// 7. Activity Reports Validation
// ---------------------------------------------------------------------------
export function validateActivityReport(body = {}) {
  const {
    scheduleId,
    caregiverId,
    elderlyUserId,
    carePlanId,
    reportDate,
    summary,
    mealsTaken,
    medicationsGiven,
    mood,
    sleepHours,
    vitals,
    concerns,
    photoUrls,
  } = body;

  const errors = fieldErrors([
    { when: !isUuid(caregiverId), field: 'caregiverId', message: 'Valid caregiverId is required.' },
    { when: !isUuid(elderlyUserId), field: 'elderlyUserId', message: 'Valid elderlyUserId is required.' },
    { when: scheduleId && !isUuid(scheduleId), field: 'scheduleId', message: 'scheduleId must be a valid UUID.' },
    { when: carePlanId && !isUuid(carePlanId), field: 'carePlanId', message: 'carePlanId must be a valid UUID.' },
    { when: !reportDate || !DATE_RE.test(reportDate), field: 'reportDate', message: 'reportDate must be in YYYY-MM-DD format.' },
    { when: !summary || typeof summary !== 'string' || summary.trim().length === 0, field: 'summary', message: 'Summary is required.' },
    { when: sleepHours !== undefined && (typeof sleepHours !== 'number' || sleepHours < 0 || sleepHours > 24), field: 'sleepHours', message: 'sleepHours must be between 0 and 24.' },
    { when: vitals !== undefined && (typeof vitals !== 'object' || vitals === null || Array.isArray(vitals)), field: 'vitals', message: 'vitals must be a JSON object.' },
    { when: photoUrls !== undefined && !Array.isArray(photoUrls), field: 'photoUrls', message: 'photoUrls must be an array of string URLs.' },
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'Invalid activity report data.', { details: errors });
  }

  return {
    scheduleId: scheduleId || null,
    caregiverId,
    elderlyUserId,
    carePlanId: carePlanId || null,
    reportDate,
    summary: summary.trim(),
    mealsTaken: typeof mealsTaken === 'string' ? mealsTaken.trim() : null,
    medicationsGiven: typeof medicationsGiven === 'string' ? medicationsGiven.trim() : null,
    mood: typeof mood === 'string' ? mood.trim() : null,
    sleepHours: typeof sleepHours === 'number' ? sleepHours : null,
    vitals: vitals ?? null,
    concerns: typeof concerns === 'string' ? concerns.trim() : null,
    photoUrls: Array.isArray(photoUrls) ? photoUrls.map(String) : [],
  };
}

// ---------------------------------------------------------------------------
// 8. Reviews Validation
// ---------------------------------------------------------------------------
export function validateCreateReview(body = {}) {
  const {
    caregiverId,
    bookingId,
    rating,
    punctualityRating,
    careQualityRating,
    communicationRating,
    comment,
  } = body;

  const checkRating = (val, field) => ({
    when: val !== undefined && (typeof val !== 'number' || !Number.isInteger(val) || val < 1 || val > 5),
    field,
    message: `${field} must be an integer between 1 and 5.`,
  });

  // bookingId is required — a review must point at a real, completed booking
  // with this caregiver (checked in reviews.service.js, which also derives
  // elderlyUserId from that booking rather than trusting it from the client).
  const errors = fieldErrors([
    { when: !isUuid(caregiverId), field: 'caregiverId', message: 'Valid caregiverId is required.' },
    { when: !isUuid(bookingId), field: 'bookingId', message: 'Valid bookingId is required.' },
    { when: typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5, field: 'rating', message: 'Rating is required and must be an integer between 1 and 5.' },
    checkRating(punctualityRating, 'punctualityRating'),
    checkRating(careQualityRating, 'careQualityRating'),
    checkRating(communicationRating, 'communicationRating'),
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'Invalid review data.', { details: errors });
  }

  return {
    caregiverId,
    bookingId,
    rating,
    punctualityRating: punctualityRating ?? null,
    careQualityRating: careQualityRating ?? null,
    communicationRating: communicationRating ?? null,
    comment: typeof comment === 'string' ? comment.trim() : null,
  };
}
