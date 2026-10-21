// ============================================================================
// Disaster Alert API Client Functions
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/**
 * Fetches active disaster alerts.
 *
 * @param {object} [options]
 * @param {string} [options.area] optional area filter
 * @param {number} [options.limit] max alerts to return
 */
export function listDisasterAlerts({ area, limit = 20 } = {}) {
  const query = [];
  if (area) query.push(`area=${encodeURIComponent(area)}`);
  if (limit) query.push(`limit=${limit}`);

  const queryString = query.length > 0 ? `?${query.join('&')}` : '';
  return apiRequest(`/emergency/disaster-alerts${queryString}`);
}

/** Fetches detailed information for a specific disaster alert by ID. */
export function getDisasterAlert(id) {
  return apiRequest(`/emergency/disaster-alerts/${id}`);
}
