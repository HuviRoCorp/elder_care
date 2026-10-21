// ============================================================================
// Daily Activity Reports Routes (Phase 4)
// ============================================================================

import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/auth/middleware.js';
import { forbidden } from '../../shared/http/errors.js';
import { hasManageCaregiversPermission } from '../../family/links.js';
import { isAssignedCaregiver } from '../services/authorize.js';
import {
  validateActivityReport,
  validateUuid,
} from '../services/validate.js';
import {
  createActivityReport,
  findActivityReportById,
  listActivityReports,
} from '../services/reports.service.js';

export const reportsRouter = Router();

// The caregiverId in the body must be the caller's own caregiver profile —
// a caregiver files a report as themselves, never on another caregiver's
// behalf. Admin exempted.
async function requireReportCreatePermission(req, data) {
  if (req.user.role === 'admin') return;
  if (await isAssignedCaregiver(req.user.id, data.caregiverId)) return;
  throw forbidden('not_permitted', 'You are not permitted to submit a report as this caregiver.');
}

// Elderly self, the reporting caregiver, family with
// hasManageCaregiversPermission, or admin.
async function requireReportAccess(req, report) {
  if (req.user.id === report.elderlyUserId || req.user.role === 'admin') return;
  if (req.user.role === 'caregiver' && (await isAssignedCaregiver(req.user.id, report.caregiverId))) return;
  if (await hasManageCaregiversPermission(req.user.id, report.elderlyUserId)) return;
  throw forbidden('not_permitted', 'You are not permitted to access this report.');
}

// Caregiver submits a daily activity report
reportsRouter.post('/', requireAuth, requireRole('caregiver', 'admin'), async (req, res) => {
  const data = validateActivityReport(req.body);
  await requireReportCreatePermission(req, data);
  const report = await createActivityReport(data);
  res.status(201).json({ status: 'ok', report });
});

// List activity reports with filters
reportsRouter.get('/', requireAuth, async (req, res) => {
  const { elderlyUserId, caregiverId, startDate, endDate } = req.query;
  const reports = await listActivityReports({
    elderlyUserId,
    caregiverId,
    startDate,
    endDate,
    user: req.user,
  });
  res.json({ status: 'ok', count: reports.length, reports });
});

// Get specific activity report
reportsRouter.get('/:id', requireAuth, async (req, res) => {
  validateUuid(req.params.id, 'reportId');
  const report = await findActivityReportById(req.params.id);
  await requireReportAccess(req, report);
  res.json({ status: 'ok', report });
});
