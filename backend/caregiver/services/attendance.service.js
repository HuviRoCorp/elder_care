// ============================================================================
// Caregiver Attendance Tracking Service (GPS Check-in & Check-out)
// ============================================================================

import { query } from '../../shared/db/pool.js';
import { notFound, badRequest, forbidden } from '../../shared/http/errors.js';

export function toAttendanceResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    caregiverId: row.caregiver_id,
    caregiverName: row.caregiver_name,
    caregiverPhone: row.caregiver_phone,
    elderlyUserId: row.elderly_user_id,
    elderlyName: row.elderly_name,
    visitDate: row.visit_date,
    startTime: row.start_time,
    endTime: row.end_time,
    checkInAt: row.check_in_at,
    checkInLatitude: row.check_in_latitude ? parseFloat(row.check_in_latitude) : null,
    checkInLongitude: row.check_in_longitude ? parseFloat(row.check_in_longitude) : null,
    checkOutAt: row.check_out_at,
    checkOutLatitude: row.check_out_latitude ? parseFloat(row.check_out_latitude) : null,
    checkOutLongitude: row.check_out_longitude ? parseFloat(row.check_out_longitude) : null,
    durationMinutes: row.duration_minutes,
    status: row.status,
    verifiedByFamily: row.verified_by_family,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ATTENDANCE_SELECT = `
  SELECT a.*,
         s.visit_date, s.start_time, s.end_time, s.elderly_user_id,
         cu.full_name AS caregiver_name, cu.phone AS caregiver_phone,
         eu.full_name AS elderly_name
    FROM attendance a
    JOIN schedules s ON s.id = a.schedule_id
    JOIN caregivers c ON c.id = a.caregiver_id
    JOIN users cu ON cu.id = c.user_id
    JOIN users eu ON eu.id = s.elderly_user_id
`;

export async function findAttendanceById(id) {
  const { rows } = await query(`${ATTENDANCE_SELECT} WHERE a.id = $1`, [id]);
  if (!rows[0]) {
    throw notFound('attendance_not_found', 'Attendance record not found.');
  }
  return toAttendanceResponse(rows[0]);
}

export async function findAttendanceByScheduleId(scheduleId) {
  const { rows } = await query(`${ATTENDANCE_SELECT} WHERE a.schedule_id = $1`, [scheduleId]);
  return rows[0] ? toAttendanceResponse(rows[0]) : null;
}

export async function recordCheckIn(scheduleId, user, { latitude, longitude, notes }) {
  // Ensure the caller is the caregiver assigned to this schedule
  const { rows: schedRows } = await query(
    `SELECT s.id, s.caregiver_id, c.user_id AS caregiver_user_id
       FROM schedules s
       JOIN caregivers c ON c.id = s.caregiver_id
      WHERE s.id = $1`,
    [scheduleId]
  );

  if (!schedRows[0]) {
    throw notFound('schedule_not_found', 'Schedule slot not found.');
  }

  if (schedRows[0].caregiver_user_id !== user.id && user.role !== 'admin') {
    throw forbidden('not_authorized', 'Only the assigned caregiver can check in.');
  }

  const { rows } = await query(
    `INSERT INTO attendance (
        schedule_id, caregiver_id, check_in_at, check_in_latitude, check_in_longitude, status, notes
     ) VALUES (
        $1, $2, now(), $3, $4, 'checked_in', $5
     )
     ON CONFLICT (schedule_id) DO UPDATE SET
        check_in_at        = now(),
        check_in_latitude  = EXCLUDED.check_in_latitude,
        check_in_longitude = EXCLUDED.check_in_longitude,
        status             = 'checked_in',
        notes              = COALESCE(EXCLUDED.notes, attendance.notes)
     RETURNING id`,
    [scheduleId, schedRows[0].caregiver_id, latitude, longitude, notes]
  );

  return findAttendanceById(rows[0].id);
}

export async function recordCheckOut(scheduleId, user, { latitude, longitude, notes }) {
  const { rows: schedRows } = await query(
    `SELECT s.id, s.caregiver_id, c.user_id AS caregiver_user_id, a.check_in_at
       FROM schedules s
       JOIN caregivers c ON c.id = s.caregiver_id
       LEFT JOIN attendance a ON a.schedule_id = s.id
      WHERE s.id = $1`,
    [scheduleId]
  );

  if (!schedRows[0]) {
    throw notFound('schedule_not_found', 'Schedule slot not found.');
  }

  if (schedRows[0].caregiver_user_id !== user.id && user.role !== 'admin') {
    throw forbidden('not_authorized', 'Only the assigned caregiver can check out.');
  }

  if (!schedRows[0].check_in_at) {
    throw badRequest('not_checked_in', 'Cannot check out before checking in.');
  }

  const { rows } = await query(
    `UPDATE attendance
        SET check_out_at        = now(),
            check_out_latitude  = $1,
            check_out_longitude = $2,
            duration_minutes    = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (now() - check_in_at)) / 60)::integer),
            status              = 'checked_out',
            notes               = COALESCE($3, notes)
      WHERE schedule_id = $4
      RETURNING id`,
    [latitude, longitude, notes, scheduleId]
  );

  // Automatically mark schedule status as completed
  await query(`UPDATE schedules SET status = 'completed' WHERE id = $1`, [scheduleId]);

  return findAttendanceById(rows[0].id);
}

export async function verifyAttendance(attendanceId, user) {
  const attendance = await findAttendanceById(attendanceId);

  // Verify family link or admin
  if (user.role !== 'admin' && user.role !== 'elderly' && user.role !== 'family') {
    throw forbidden('not_authorized', 'Only family members, elderly users, or admins can verify attendance.');
  }

  const { rows } = await query(
    `UPDATE attendance
        SET verified_by_family = TRUE
      WHERE id = $1
      RETURNING id`,
    [attendanceId]
  );

  return findAttendanceById(rows[0].id);
}

export async function listAttendance({ caregiverId, elderlyUserId, status, user }) {
  const conditions = [];
  const params = [];

  if (user) {
    if (user.role === 'caregiver') {
      params.push(user.id);
      conditions.push(`c.user_id = $${params.length}`);
    } else if (user.role === 'elderly') {
      params.push(user.id);
      conditions.push(`s.elderly_user_id = $${params.length}`);
    } else if (user.role === 'family') {
      params.push(user.id);
      conditions.push(`(
        s.elderly_user_id = $${params.length} OR
        s.elderly_user_id IN (
          SELECT elderly_user_id FROM family_links
           WHERE family_user_id = $${params.length} AND status = 'active'
        )
      )`);
    }
  }

  if (caregiverId) {
    params.push(caregiverId);
    conditions.push(`a.caregiver_id = $${params.length}`);
  }
  if (elderlyUserId) {
    params.push(elderlyUserId);
    conditions.push(`s.elderly_user_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`a.status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `${ATTENDANCE_SELECT}
     ${whereClause}
     ORDER BY a.created_at DESC`,
    params
  );

  return rows.map(toAttendanceResponse);
}
