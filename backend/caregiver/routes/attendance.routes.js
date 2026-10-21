// ============================================================================
// Caregiver Attendance Tracking Routes (GPS Check-in / Check-out)
// ============================================================================

import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/auth/middleware.js';
import { forbidden } from '../../shared/http/errors.js';
import { hasManageCaregiversPermission } from '../../family/links.js';
import { isAssignedCaregiver } from '../services/authorize.js';
import {
  validateAttendanceCheck,
  validateUuid,
} from '../services/validate.js';
import {
  recordCheckIn,
  recordCheckOut,
  verifyAttendance,
  listAttendance,
  findAttendanceById,
} from '../services/attendance.service.js';

export const attendanceRouter = Router();

// Elderly self, the assigned caregiver, family with
// hasManageCaregiversPermission, or admin.
async function requireAttendanceAccess(req, attendance) {
  if (req.user.id === attendance.elderlyUserId || req.user.role === 'admin') return;
  if (req.user.role === 'caregiver' && (await isAssignedCaregiver(req.user.id, attendance.caregiverId))) return;
  if (await hasManageCaregiversPermission(req.user.id, attendance.elderlyUserId)) return;
  throw forbidden('not_permitted', 'You are not permitted to view this attendance record.');
}

// Elderly self, family with hasManageCaregiversPermission, or admin.
// Caregiver excluded on purpose — verifying your own attendance defeats the
// point of a family/elderly confirmation.
async function requireAttendanceVerifyPermission(req, attendance) {
  if (req.user.id === attendance.elderlyUserId || req.user.role === 'admin') return;
  if (await hasManageCaregiversPermission(req.user.id, attendance.elderlyUserId)) return;
  throw forbidden('not_permitted', 'You are not permitted to verify this attendance record.');
}

// Caregiver GPS Check-in for a schedule slot
attendanceRouter.post('/schedules/:scheduleId/check-in', requireAuth, requireRole('caregiver', 'admin'), async (req, res) => {
  validateUuid(req.params.scheduleId, 'scheduleId');
  const checkData = validateAttendanceCheck(req.body);
  const attendance = await recordCheckIn(req.params.scheduleId, req.user, checkData);
  res.json({ status: 'ok', attendance });
});

// Caregiver GPS Check-out for a schedule slot
attendanceRouter.post('/schedules/:scheduleId/check-out', requireAuth, requireRole('caregiver', 'admin'), async (req, res) => {
  validateUuid(req.params.scheduleId, 'scheduleId');
  const checkData = validateAttendanceCheck(req.body);
  const attendance = await recordCheckOut(req.params.scheduleId, req.user, checkData);
  res.json({ status: 'ok', attendance });
});

// Family/Elderly verifies attendance
attendanceRouter.patch('/:id/verify', requireAuth, requireRole('family', 'elderly', 'admin'), async (req, res) => {
  validateUuid(req.params.id, 'attendanceId');
  const existing = await findAttendanceById(req.params.id);
  await requireAttendanceVerifyPermission(req, existing);
  const attendance = await verifyAttendance(req.params.id, req.user);
  res.json({ status: 'ok', attendance });
});

// List attendance logs
attendanceRouter.get('/', requireAuth, async (req, res) => {
  const { caregiverId, elderlyUserId, status } = req.query;
  const attendanceLogs = await listAttendance({
    caregiverId,
    elderlyUserId,
    status,
    user: req.user,
  });
  res.json({ status: 'ok', count: attendanceLogs.length, attendance: attendanceLogs });
});

// Get attendance log by ID
attendanceRouter.get('/:id', requireAuth, async (req, res) => {
  validateUuid(req.params.id, 'attendanceId');
  const attendance = await findAttendanceById(req.params.id);
  await requireAttendanceAccess(req, attendance);
  res.json({ status: 'ok', attendance });
});
