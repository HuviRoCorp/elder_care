// ============================================================================
// Caregiver Profile & Search Routes
// ============================================================================

import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/auth/middleware.js';
import {
  validateCaregiverProfile,
  validateVerificationStatus,
  validateUuid,
} from '../services/validate.js';
import {
  upsertCaregiverProfile,
  findCaregiverByUserId,
  findCaregiverById,
  searchCaregivers,
  listPendingCaregivers,
  updateCaregiverVerification,
} from '../services/caregivers.service.js';

export const caregiversRouter = Router();

// Caregiver sets up or updates their own profile
caregiversRouter.post('/profile', requireAuth, requireRole('caregiver', 'admin'), async (req, res) => {
  const profile = validateCaregiverProfile(req.body);
  const result = await upsertCaregiverProfile(req.user.id, profile);
  res.status(200).json({ status: 'ok', caregiver: result });
});

// Caregiver fetches their own profile
caregiversRouter.get('/profile/me', requireAuth, requireRole('caregiver', 'admin'), async (req, res) => {
  const result = await findCaregiverByUserId(req.user.id);
  res.json({ status: 'ok', caregiver: result });
});

// Search available and verified caregivers
caregiversRouter.get('/search', requireAuth, async (req, res) => {
  const { city, language, specialization, minRating, page, limit, verifiedOnly, availableOnly } = req.query;
  const result = await searchCaregivers({
    city,
    language,
    specialization,
    minRating,
    verifiedOnly: verifiedOnly !== 'false',
    availableOnly: availableOnly !== 'false',
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? parseInt(limit, 10) : 20,
  });
  res.json({ status: 'ok', ...result });
});

// Admin views caregivers awaiting verification, oldest first
caregiversRouter.get('/verification-queue', requireAuth, requireRole('admin'), async (req, res) => {
  const result = await listPendingCaregivers();
  res.json({ status: 'ok', caregivers: result });
});

// Admin updates verification status
caregiversRouter.patch('/:id/verification', requireAuth, requireRole('admin'), async (req, res) => {
  validateUuid(req.params.id, 'caregiverId');
  const status = validateVerificationStatus(req.body);
  const result = await updateCaregiverVerification(req.params.id, status, req.user.id);
  res.json({ status: 'ok', caregiver: result });
});

// Get specific caregiver profile
caregiversRouter.get('/:id', requireAuth, async (req, res) => {
  validateUuid(req.params.id, 'caregiverId');
  const result = await findCaregiverById(req.params.id);
  res.json({ status: 'ok', caregiver: result });
});
