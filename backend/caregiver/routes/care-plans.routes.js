// ============================================================================
// Care Plans Routes (Phase 4)
// ============================================================================

import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/auth/middleware.js';
import { forbidden } from '../../shared/http/errors.js';
import { hasManageCaregiversPermission } from '../../family/links.js';
import { caregiverHasAssignmentWith } from '../services/authorize.js';
import {
  validateCarePlan,
  validateUpdateCarePlan,
  validateUuid,
} from '../services/validate.js';
import {
  createCarePlan,
  findCarePlanById,
  listCarePlansByElderlyId,
  updateCarePlan,
} from '../services/care-plans.service.js';

export const carePlansRouter = Router();

// Elderly self, or a family member with hasManageCaregiversPermission, or
// admin — creating/editing a care plan on someone's behalf.
async function requireCarePlanWritePermission(req, elderlyUserId) {
  if (req.user.id === elderlyUserId || req.user.role === 'admin') return;
  if (await hasManageCaregiversPermission(req.user.id, elderlyUserId)) return;
  throw forbidden('not_permitted', 'You are not permitted to manage care plans for this account.');
}

// The write set, plus a caregiver with a real assignment (a confirmed/active/
// completed booking, or a schedule) — being searchable is not being
// assigned, so search alone grants nothing here. Allergies and medications
// are exactly what someone on shift needs; read-only, no write access.
async function requireCarePlanReadPermission(req, elderlyUserId) {
  if (req.user.id === elderlyUserId || req.user.role === 'admin') return;
  if (await hasManageCaregiversPermission(req.user.id, elderlyUserId)) return;
  if (req.user.role === 'caregiver' && (await caregiverHasAssignmentWith(req.user.id, elderlyUserId))) return;
  throw forbidden('not_permitted', 'You are not permitted to view care plans for this account.');
}

// Create a new care plan (elderly, family, admin)
carePlansRouter.post('/', requireAuth, requireRole('elderly', 'family', 'admin'), async (req, res) => {
  const data = validateCarePlan(req.body);
  await requireCarePlanWritePermission(req, data.elderlyUserId);
  const carePlan = await createCarePlan(data, req.user.id);
  res.status(201).json({ status: 'ok', carePlan });
});

// List care plans for an elderly user
carePlansRouter.get('/elderly/:elderlyUserId', requireAuth, async (req, res) => {
  validateUuid(req.params.elderlyUserId, 'elderlyUserId');
  await requireCarePlanReadPermission(req, req.params.elderlyUserId);
  const { status } = req.query;
  const carePlans = await listCarePlansByElderlyId(req.params.elderlyUserId, status);
  res.json({ status: 'ok', count: carePlans.length, carePlans });
});

// Get a specific care plan
carePlansRouter.get('/:id', requireAuth, async (req, res) => {
  validateUuid(req.params.id, 'carePlanId');
  const carePlan = await findCarePlanById(req.params.id);
  await requireCarePlanReadPermission(req, carePlan.elderlyUserId);
  res.json({ status: 'ok', carePlan });
});

// Update care plan
carePlansRouter.patch('/:id', requireAuth, requireRole('elderly', 'family', 'admin'), async (req, res) => {
  validateUuid(req.params.id, 'carePlanId');
  const patch = validateUpdateCarePlan(req.body);
  const existing = await findCarePlanById(req.params.id);
  await requireCarePlanWritePermission(req, existing.elderlyUserId);
  const carePlan = await updateCarePlan(req.params.id, patch);
  res.json({ status: 'ok', carePlan });
});
