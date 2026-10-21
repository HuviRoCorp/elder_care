// ============================================================================
// Care Plans Service (Phase 4)
// ============================================================================

import { query } from '../../shared/db/pool.js';
import { notFound } from '../../shared/http/errors.js';

export function toCarePlanResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    elderlyUserId: row.elderly_user_id,
    elderlyName: row.elderly_name,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    title: row.title,
    description: row.description,
    medicalConditions: row.medical_conditions,
    allergies: row.allergies,
    medications: row.medications,
    dietaryNotes: row.dietary_notes,
    mobilityNotes: row.mobility_notes,
    emergencyInstructions: row.emergency_instructions,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CARE_PLAN_SELECT = `
  SELECT cp.*,
         eu.full_name AS elderly_name,
         cu.full_name AS created_by_name
    FROM care_plans cp
    JOIN users eu ON eu.id = cp.elderly_user_id
    LEFT JOIN users cu ON cu.id = cp.created_by_user_id
`;

export async function createCarePlan(data, authorUserId) {
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
  } = data;

  const { rows } = await query(
    `INSERT INTO care_plans (
        elderly_user_id, created_by_user_id, title, description,
        medical_conditions, allergies, medications, dietary_notes,
        mobility_notes, emergency_instructions, start_date, end_date, status
     ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::care_plan_status
     )
     RETURNING id`,
    [
      elderlyUserId,
      authorUserId,
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
    ]
  );

  return findCarePlanById(rows[0].id);
}

export async function findCarePlanById(id) {
  const { rows } = await query(`${CARE_PLAN_SELECT} WHERE cp.id = $1`, [id]);
  if (!rows[0]) {
    throw notFound('care_plan_not_found', 'Care plan not found.');
  }
  return toCarePlanResponse(rows[0]);
}

export async function listCarePlansByElderlyId(elderlyUserId, status = null) {
  const params = [elderlyUserId];
  let statusClause = '';
  if (status) {
    params.push(status);
    statusClause = `AND cp.status = $2`;
  }

  const { rows } = await query(
    `${CARE_PLAN_SELECT}
      WHERE cp.elderly_user_id = $1 ${statusClause}
      ORDER BY cp.created_at DESC`,
    params
  );

  return rows.map(toCarePlanResponse);
}

export async function updateCarePlan(id, updates) {
  const fields = [];
  const params = [];

  const addField = (col, val, cast = '') => {
    if (val !== undefined) {
      params.push(val);
      fields.push(`${col} = $${params.length}${cast}`);
    }
  };

  addField('title', updates.title);
  addField('description', updates.description);
  addField('medical_conditions', updates.medicalConditions);
  addField('allergies', updates.allergies);
  addField('medications', updates.medications);
  addField('dietary_notes', updates.dietaryNotes);
  addField('mobility_notes', updates.mobilityNotes);
  addField('emergency_instructions', updates.emergencyInstructions);
  addField('start_date', updates.startDate);
  addField('end_date', updates.endDate);
  addField('status', updates.status, '::care_plan_status');

  if (fields.length === 0) {
    return findCarePlanById(id);
  }

  params.push(id);
  const { rows } = await query(
    `UPDATE care_plans
        SET ${fields.join(', ')}
      WHERE id = $${params.length}
      RETURNING id`,
    params
  );

  if (!rows[0]) {
    throw notFound('care_plan_not_found', 'Care plan not found.');
  }

  return findCarePlanById(rows[0].id);
}
