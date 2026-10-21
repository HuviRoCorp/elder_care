// ============================================================================
// Disaster Alert Routes — mounted under /emergency/disaster-alerts
//
//   GET /emergency/disaster-alerts      list current active disaster warnings
//   GET /emergency/disaster-alerts/:id  get detailed view of a specific warning
// ============================================================================

import { Router } from 'express';
import { badRequest, notFound } from '../../shared/http/errors.js';
import { requireAuth } from '../../shared/auth/middleware.js';
import { listActiveDisasterAlerts, findDisasterAlertById } from './disaster.js';

export const disasterRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// All disaster alert routes require authentication
disasterRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /emergency/disaster-alerts
// ---------------------------------------------------------------------------
disasterRouter.get('/', async (req, res) => {
  const { area } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

  const alerts = await listActiveDisasterAlerts({ area, limit });
  res.json({ status: 'ok', count: alerts.length, alerts });
});

// ---------------------------------------------------------------------------
// GET /emergency/disaster-alerts/:id
// ---------------------------------------------------------------------------
disasterRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    throw badRequest('validation_failed', 'Disaster alert id must be a valid UUID.', {
      details: [{ field: 'id', message: 'Must be a UUID.' }],
    });
  }

  const alert = await findDisasterAlertById(id);
  if (!alert) {
    throw notFound('disaster_alert_not_found', 'No disaster alert found with that ID.');
  }

  res.json({ status: 'ok', alert });
});
