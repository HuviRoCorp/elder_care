// ============================================================================
// Activity Reports Service (Phase 4)
// ============================================================================

import { query } from '../../shared/db/pool.js';
import { notFound, conflict } from '../../shared/http/errors.js';

export function toReportResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    caregiverId: row.caregiver_id,
    caregiverName: row.caregiver_name,
    caregiverPhone: row.caregiver_phone,
    elderlyUserId: row.elderly_user_id,
    elderlyName: row.elderly_name,
    carePlanId: row.care_plan_id,
    carePlanTitle: row.care_plan_title,
    reportDate: row.report_date,
    summary: row.summary,
    mealsTaken: row.meals_taken,
    medicationsGiven: row.medications_given,
    mood: row.mood,
    sleepHours: row.sleep_hours ? parseFloat(row.sleep_hours) : null,
    vitals: row.vitals,
    concerns: row.concerns,
    photoUrls: row.photo_urls || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const REPORT_SELECT = `
  SELECT r.*,
         cp.title AS care_plan_title,
         cu.full_name AS caregiver_name, cu.phone AS caregiver_phone,
         eu.full_name AS elderly_name
    FROM activity_reports r
    LEFT JOIN care_plans cp ON cp.id = r.care_plan_id
    JOIN caregivers c ON c.id = r.caregiver_id
    JOIN users cu ON cu.id = c.user_id
    JOIN users eu ON eu.id = r.elderly_user_id
`;

export async function createActivityReport(data) {
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
  } = data;

  try {
    const { rows } = await query(
      `INSERT INTO activity_reports (
          schedule_id, caregiver_id, elderly_user_id, care_plan_id,
          report_date, summary, meals_taken, medications_given,
          mood, sleep_hours, vitals, concerns, photo_urls
       ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
       )
       RETURNING id`,
      [
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
        vitals ? JSON.stringify(vitals) : null,
        concerns,
        photoUrls,
      ]
    );

    return findActivityReportById(rows[0].id);
  } catch (err) {
    if (err.code === '23505') {
      throw conflict('duplicate_report', 'An activity report for this caregiver and elderly person already exists on this date.');
    }
    throw err;
  }
}

export async function findActivityReportById(id) {
  const { rows } = await query(`${REPORT_SELECT} WHERE r.id = $1`, [id]);
  if (!rows[0]) {
    throw notFound('report_not_found', 'Activity report not found.');
  }
  return toReportResponse(rows[0]);
}

export async function listActivityReports({ elderlyUserId, caregiverId, startDate, endDate, user }) {
  const conditions = [];
  const params = [];

  if (user) {
    if (user.role === 'caregiver') {
      params.push(user.id);
      conditions.push(`c.user_id = $${params.length}`);
    } else if (user.role === 'elderly') {
      params.push(user.id);
      conditions.push(`r.elderly_user_id = $${params.length}`);
    } else if (user.role === 'family') {
      params.push(user.id);
      conditions.push(`(
        r.elderly_user_id = $${params.length} OR
        r.elderly_user_id IN (
          SELECT elderly_user_id FROM family_links
           WHERE family_user_id = $${params.length} AND status = 'active'
        )
      )`);
    }
  }

  if (elderlyUserId) {
    params.push(elderlyUserId);
    conditions.push(`r.elderly_user_id = $${params.length}`);
  }
  if (caregiverId) {
    params.push(caregiverId);
    conditions.push(`r.caregiver_id = $${params.length}`);
  }
  if (startDate) {
    params.push(startDate);
    conditions.push(`r.report_date >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`r.report_date <= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `${REPORT_SELECT}
     ${whereClause}
     ORDER BY r.report_date DESC, r.created_at DESC`,
    params
  );

  return rows.map(toReportResponse);
}
