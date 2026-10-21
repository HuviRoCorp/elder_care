// ============================================================================
// Caregiver Reviews & Ratings Routes (Phase 4)
// ============================================================================

import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/auth/middleware.js';
import {
  validateCreateReview,
  validateUuid,
} from '../services/validate.js';
import {
  createReview,
  listReviewsForCaregiver,
  findReviewById,
} from '../services/reviews.service.js';

export const reviewsRouter = Router();

// Submit a review for a caregiver
reviewsRouter.post('/', requireAuth, requireRole('elderly', 'family', 'admin'), async (req, res) => {
  const data = validateCreateReview(req.body);
  const review = await createReview(data, req.user);
  res.status(201).json({ status: 'ok', review });
});

// List reviews for a specific caregiver
reviewsRouter.get('/caregiver/:caregiverId', requireAuth, async (req, res) => {
  validateUuid(req.params.caregiverId, 'caregiverId');
  const reviews = await listReviewsForCaregiver(req.params.caregiverId);
  res.json({ status: 'ok', count: reviews.length, reviews });
});

// Get review by ID
reviewsRouter.get('/:id', requireAuth, async (req, res) => {
  validateUuid(req.params.id, 'reviewId');
  const review = await findReviewById(req.params.id);
  res.json({ status: 'ok', review });
});
