// ============================================================================
// Caregiver task endpoints
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/**
 * POST /caregiver/tasks — elderly self, family with
 * hasManageCaregiversPermission, the caregiver being assigned (self-assign
 * only), or admin.
 * @param {object} input
 * @param {string} input.elderlyUserId
 * @param {string} [input.carePlanId]
 * @param {string} [input.assignedToCaregiverId]
 * @param {string} [input.scheduleId]
 * @param {string} input.title              1-150 chars
 * @param {string} [input.description]
 * @param {string} [input.category]
 * @param {string} [input.priority]         low | normal | high, defaults to normal
 * @param {string} [input.dueDate]          YYYY-MM-DD
 * @param {string} [input.dueTime]          HH:MM
 */
export function createTask(input) {
  return apiRequest('/caregiver/tasks', { method: 'POST', body: input });
}

/**
 * GET /caregiver/tasks — scoped server-side same as schedules/attendance.
 * @param {object} [filters]
 * @param {string} [filters.caregiverId]
 * @param {string} [filters.elderlyUserId]
 * @param {string} [filters.carePlanId]
 * @param {string} [filters.scheduleId]
 * @param {string} [filters.status]  pending | in_progress | completed | skipped | cancelled
 * @param {string} [filters.dueDate]
 */
export function listTasks(filters = {}) {
  const params = new URLSearchParams();
  if (filters.caregiverId) params.set('caregiverId', filters.caregiverId);
  if (filters.elderlyUserId) params.set('elderlyUserId', filters.elderlyUserId);
  if (filters.carePlanId) params.set('carePlanId', filters.carePlanId);
  if (filters.scheduleId) params.set('scheduleId', filters.scheduleId);
  if (filters.status) params.set('status', filters.status);
  if (filters.dueDate) params.set('dueDate', filters.dueDate);
  const query = params.toString();
  return apiRequest(`/caregiver/tasks${query ? `?${query}` : ''}`);
}

/** GET /caregiver/tasks/:id */
export function getTask(id) {
  return apiRequest(`/caregiver/tasks/${id}`);
}

/**
 * PATCH /caregiver/tasks/:id/status — assigned caregiver, elderly self,
 * family with hasManageCaregiversPermission, or admin.
 */
export function updateTaskStatus(id, { status, completionNotes } = {}) {
  return apiRequest(`/caregiver/tasks/${id}/status`, { method: 'PATCH', body: { status, completionNotes } });
}
