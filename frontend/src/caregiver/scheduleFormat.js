// ============================================================================
// Schedule/attendance formatting helpers — shared by CaregiverScheduleScreen,
// VisitsScreen and ScheduleVisitScreen, same reasoning as bookingFormat.js.
// ============================================================================

const SCHEDULE_STATUS_LABELS = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  missed: 'Missed',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
};

export function scheduleStatusLabel(status) {
  return SCHEDULE_STATUS_LABELS[status] ?? status;
}

// 'pending' here is the attendance row schedules.service.js auto-creates the
// moment a slot is made — it means "not checked in yet," not "awaiting
// approval" the way it does on a caregiver's verification_status.
const ATTENDANCE_STATUS_LABELS = {
  pending: 'Not checked in yet',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  absent: 'Absent',
  late: 'Late',
};

export function attendanceStatusLabel(status) {
  if (!status) return 'Not checked in yet';
  return ATTENDANCE_STATUS_LABELS[status] ?? status;
}

/** 'HH:MM' or 'HH:MM:SS' -> 'e.g. 2:30 PM' — same reasoning as bookingFormat's formatDate. */
export function formatTime(timeStr) {
  if (!timeStr) return null;
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Minutes between two ISO timestamps, for display on a schedule row that
 * already has checkInAt/checkOutAt embedded — avoids a second GET to
 * /caregiver/attendance/:id just to read the server's own duration_minutes.
 * Approximate by a few seconds' rounding versus the server's value; fine for
 * a read-only display, never sent back anywhere.
 */
export function computeDurationMinutes(checkInAt, checkOutAt) {
  if (!checkInAt || !checkOutAt) return null;
  const ms = new Date(checkOutAt).getTime() - new Date(checkInAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.max(1, Math.round(ms / 60000));
}

export function formatDuration(minutes) {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}
