// ============================================================================
// Tasks Assignment & Tracking Service (Phase 4)
// ============================================================================

import { query } from '../../shared/db/pool.js';
import { notFound } from '../../shared/http/errors.js';

export function toTaskResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    carePlanId: row.care_plan_id,
    carePlanTitle: row.care_plan_title,
    elderlyUserId: row.elderly_user_id,
    elderlyName: row.elderly_name,
    assignedToCaregiverId: row.assigned_to_caregiver_id,
    caregiverName: row.caregiver_name,
    assignedByUserId: row.assigned_by_user_id,
    assignedByName: row.assigned_by_name,
    scheduleId: row.schedule_id,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    dueDate: row.due_date,
    dueTime: row.due_time,
    recurrence: row.recurrence,
    status: row.status,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    completedByName: row.completed_by_name,
    completionNotes: row.completion_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TASK_SELECT = `
  SELECT t.*,
         cp.title AS care_plan_title,
         eu.full_name AS elderly_name,
         cu.full_name AS caregiver_name,
         au.full_name AS assigned_by_name,
         comu.full_name AS completed_by_name
    FROM tasks t
    LEFT JOIN care_plans cp ON cp.id = t.care_plan_id
    JOIN users eu ON eu.id = t.elderly_user_id
    LEFT JOIN caregivers c ON c.id = t.assigned_to_caregiver_id
    LEFT JOIN users cu ON cu.id = c.user_id
    LEFT JOIN users au ON au.id = t.assigned_by_user_id
    LEFT JOIN users comu ON comu.id = t.completed_by
`;

export async function createTask(data, assignedByUserId) {
  const {
    carePlanId,
    elderlyUserId,
    assignedToCaregiverId,
    scheduleId,
    title,
    description,
    category,
    priority,
    dueDate,
    dueTime,
    recurrence,
  } = data;

  const { rows } = await query(
    `INSERT INTO tasks (
        care_plan_id, elderly_user_id, assigned_to_caregiver_id,
        assigned_by_user_id, schedule_id, title, description,
        category, priority, due_date, due_time, recurrence, status
     ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::task_priority, $10, $11, $12, 'pending'
     )
     RETURNING id`,
    [
      carePlanId,
      elderlyUserId,
      assignedToCaregiverId,
      assignedByUserId,
      scheduleId,
      title,
      description,
      category,
      priority,
      dueDate,
      dueTime,
      recurrence,
    ]
  );

  return findTaskById(rows[0].id);
}

export async function findTaskById(id) {
  const { rows } = await query(`${TASK_SELECT} WHERE t.id = $1`, [id]);
  if (!rows[0]) {
    throw notFound('task_not_found', 'Task not found.');
  }
  return toTaskResponse(rows[0]);
}

export async function listTasks({
  caregiverId,
  elderlyUserId,
  carePlanId,
  scheduleId,
  status,
  dueDate,
  user,
}) {
  const conditions = [];
  const params = [];

  if (user) {
    if (user.role === 'caregiver') {
      params.push(user.id);
      conditions.push(`c.user_id = $${params.length}`);
    } else if (user.role === 'elderly') {
      params.push(user.id);
      conditions.push(`t.elderly_user_id = $${params.length}`);
    } else if (user.role === 'family') {
      params.push(user.id);
      conditions.push(`(
        t.elderly_user_id = $${params.length} OR
        t.elderly_user_id IN (
          SELECT elderly_user_id FROM family_links
           WHERE family_user_id = $${params.length} AND status = 'active'
        )
      )`);
    }
  }

  if (caregiverId) {
    params.push(caregiverId);
    conditions.push(`t.assigned_to_caregiver_id = $${params.length}`);
  }
  if (elderlyUserId) {
    params.push(elderlyUserId);
    conditions.push(`t.elderly_user_id = $${params.length}`);
  }
  if (carePlanId) {
    params.push(carePlanId);
    conditions.push(`t.care_plan_id = $${params.length}`);
  }
  if (scheduleId) {
    params.push(scheduleId);
    conditions.push(`t.schedule_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }
  if (dueDate) {
    params.push(dueDate);
    conditions.push(`t.due_date = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `${TASK_SELECT}
     ${whereClause}
     ORDER BY t.due_date ASC NULLS LAST, t.due_time ASC NULLS LAST, t.created_at DESC`,
    params
  );

  return rows.map(toTaskResponse);
}

export async function updateTaskStatus(taskId, status, user, completionNotes = null) {
  const { rows } = await query(
    `UPDATE tasks
        SET status           = $1::task_status,
            completed_at     = CASE WHEN $1::text = 'completed' THEN now() ELSE completed_at END,
            completed_by     = CASE WHEN $1::text = 'completed' THEN $2::uuid ELSE completed_by END,
            completion_notes = COALESCE($3, completion_notes)
      WHERE id = $4
      RETURNING id`,
    [status, user.id, completionNotes, taskId]
  );

  if (!rows[0]) {
    throw notFound('task_not_found', 'Task not found.');
  }

  return findTaskById(rows[0].id);
}
