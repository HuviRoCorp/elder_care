// ============================================================================
// Caregiver Schedules & Calendar Service
// ============================================================================

import { query } from '../../shared/db/pool.js';
import { notFound, conflict, badRequest } from '../../shared/http/errors.js';

export function toScheduleResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingId: row.booking_id,
    caregiverId: row.caregiver_id,
    caregiverName: row.caregiver_name,
    caregiverPhone: row.caregiver_phone,
    elderlyUserId: row.elderly_user_id,
    elderlyName: row.elderly_name,
    elderlyPhone: row.elderly_phone,
    visitDate: row.visit_date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    notes: row.notes,
    attendanceId: row.attendance_id,
    attendanceStatus: row.attendance_status,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SCHEDULE_SELECT = `
  SELECT s.*,
         eu.full_name AS elderly_name, eu.phone AS elderly_phone,
         cu.full_name AS caregiver_name, cu.phone AS caregiver_phone,
         a.id AS attendance_id, a.status AS attendance_status,
         a.check_in_at, a.check_out_at
    FROM schedules s
    JOIN users eu ON eu.id = s.elderly_user_id
    JOIN caregivers c ON c.id = s.caregiver_id
    JOIN users cu ON cu.id = c.user_id
    LEFT JOIN attendance a ON a.schedule_id = s.id
`;

export async function createSchedule(data) {
  const { bookingId, caregiverId, elderlyUserId, visitDate, startTime, endTime, notes } = data;

  // Check for overlapping schedule for this caregiver on the same day
  const { rows: conflicts } = await query(
    `SELECT id FROM schedules
      WHERE caregiver_id = $1
        AND visit_date = $2
        AND status NOT IN ('cancelled')
        AND (start_time < $4::time AND end_time > $3::time)`,
    [caregiverId, visitDate, startTime, endTime]
  );

  if (conflicts.length > 0) {
    throw conflict('schedule_conflict', 'Caregiver already has an overlapping visit scheduled at this time.');
  }

  const { rows } = await query(
    `INSERT INTO schedules (
        booking_id, caregiver_id, elderly_user_id, visit_date, start_time, end_time, notes, status
     ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'scheduled'
     )
     RETURNING id`,
    [bookingId, caregiverId, elderlyUserId, visitDate, startTime, endTime, notes]
  );

  const scheduleId = rows[0].id;

  // Automatically initialize pending attendance record
  await query(
    `INSERT INTO attendance (schedule_id, caregiver_id, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (schedule_id) DO NOTHING`,
    [scheduleId, caregiverId]
  );

  return findScheduleById(scheduleId);
}

export async function findScheduleById(id) {
  const { rows } = await query(`${SCHEDULE_SELECT} WHERE s.id = $1`, [id]);
  if (!rows[0]) {
    throw notFound('schedule_not_found', 'Schedule slot not found.');
  }
  return toScheduleResponse(rows[0]);
}

export async function listSchedules({ caregiverId, elderlyUserId, startDate, endDate, status, user }) {
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
    conditions.push(`s.caregiver_id = $${params.length}`);
  }
  if (elderlyUserId) {
    params.push(elderlyUserId);
    conditions.push(`s.elderly_user_id = $${params.length}`);
  }
  if (startDate) {
    params.push(startDate);
    conditions.push(`s.visit_date >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`s.visit_date <= $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`s.status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `${SCHEDULE_SELECT}
     ${whereClause}
     ORDER BY s.visit_date ASC, s.start_time ASC`,
    params
  );

  return rows.map(toScheduleResponse);
}

export async function updateScheduleStatus(scheduleId, status, notes = null) {
  const { rows } = await query(
    `UPDATE schedules
        SET status     = $1::schedule_status,
            notes      = COALESCE($2, notes)
      WHERE id = $3
      RETURNING id`,
    [status, notes, scheduleId]
  );

  if (!rows[0]) {
    throw notFound('schedule_not_found', 'Schedule slot not found.');
  }

  return findScheduleById(rows[0].id);
}
