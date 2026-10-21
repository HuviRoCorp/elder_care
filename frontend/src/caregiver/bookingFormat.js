// ============================================================================
// Booking/search formatting helpers — shared by every caregiver-module
// screen so wording and the recurrence/rating choices don't drift between
// the search filters, the booking form, and the two booking-list screens.
// ============================================================================

// Plain-language recurrence choices — mirrors the radius-picker pattern
// already used for geofences (geofenceFormat.js): pick from words, not an
// enum value.
export const RECURRENCE_OPTIONS = [
  { value: 'one_time', label: 'One-time visit' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
];

export function recurrenceLabel(value) {
  return RECURRENCE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// Plain-language minimum-rating filter — same reasoning: nobody should have
// to type "4.5" into a box to mean "at least 4.5 stars."
export const RATING_OPTIONS = [
  { value: null, label: 'Any rating' },
  { value: 3, label: '3 stars & up' },
  { value: 4, label: '4 stars & up' },
  { value: 4.5, label: '4.5 stars & up' },
];

const STATUS_LABELS = {
  requested: 'Waiting for caregiver',
  confirmed: 'Confirmed',
  active: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Declined',
};

export function bookingStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

/** 'YYYY-MM-DD' -> 'e.g. 1 Sep 2026' — dates people read, not ISO strings. */
export function formatDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
