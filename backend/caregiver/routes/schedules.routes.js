// ============================================================================
// Caregiver Schedules & Calendar Routes
// ============================================================================

import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/auth/middleware.js';
import { forbidden } from '../../shared/http/errors.js';
import { hasManageCaregiversPermission } from '../../family/links.js';
import { isAssignedCaregiver } from '../services/authorize.js';
import {
  validateCreateSchedule,
  validateScheduleStatusUpdate,
  validateUuid,
} from '../services/validate.js';
import {
  createSchedule,
  findScheduleById,
  listSchedules,
  updateScheduleStatus,
} from '../services/schedules.service.js';

export const schedulesRouter = Router();

// Elderly self, the caregiver being scheduled, family with
// hasManageCaregiversPermission, or admin.
async function requireScheduleCreatePermission(req, data) {
  if (req.user.id === data.elderlyUserId || req.user.role === 'admin') return;
  if (req.user.role === 'caregiver' && (await isAssignedCaregiver(req.user.id, data.caregiverId))) return;
  if (await hasManageCaregiversPermission(req.user.id, data.elderlyUserId)) return;
  throw forbidden('not_permitted', 'You are not permitted to create this schedule.');
}

// Same set — read and write (marking a visit completed/missed/etc.) share
// the same actors here, unlike bookings where status transitions are more
// tightly split by who's allowed to do what.
async function requireScheduleAccess(req, schedule) {
  if (req.user.id === schedule.elderlyUserId || req.user.role === 'admin') return;
  if (req.user.role === 'caregiver' && (await isAssignedCaregiver(req.user.id, schedule.caregiverId))) return;
  if (await hasManageCaregiversPermission(req.user.id, schedule.elderlyUserId)) return;
  throw forbidden('not_permitted', 'You are not permitted to access this schedule.');
}

// Create schedule visit slot
schedulesRouter.post('/', requireAuth, requireRole('caregiver', 'family', 'elderly', 'admin'), async (req, res) => {
  const data = validateCreateSchedule(req.body);
  await requireScheduleCreatePermission(req, data);
  const schedule = await createSchedule(data);
  res.status(201).json({ status: 'ok', schedule });
});

// List schedules
schedulesRouter.get('/', requireAuth, async (req, res) => {
  const { caregiverId, elderlyUserId, startDate, endDate, status } = req.query;
  const schedules = await listSchedules({
    caregiverId,
    elderlyUserId,
    startDate,
    endDate,
    status,
    user: req.user,
  });
  res.json({ status: 'ok', count: schedules.length, schedules });
});

// Get schedule slot by ID
schedulesRouter.get('/:id', requireAuth, async (req, res) => {
  validateUuid(req.params.id, 'scheduleId');
  const schedule = await findScheduleById(req.params.id);
  await requireScheduleAccess(req, schedule);
  res.json({ status: 'ok', schedule });
});

// Update schedule status
schedulesRouter.patch('/:id', requireAuth, requireRole('caregiver', 'elderly', 'family', 'admin'), async (req, res) => {
  validateUuid(req.params.id, 'scheduleId');
  const { status, notes } = validateScheduleStatusUpdate(req.body);
  const existing = await findScheduleById(req.params.id);
  await requireScheduleAccess(req, existing);
  const schedule = await updateScheduleStatus(req.params.id, status, notes);
  res.json({ status: 'ok', schedule });
});
