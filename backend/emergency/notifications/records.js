// ============================================================================
// Writes to `notifications` — one row per channel attempted for one contact.
//
// This table is the audit trail the product requirement asked for: which
// contact, which channel, which device, whether it succeeded, and why not if
// it failed. Written after every attempt, success or failure — an
// unconfigured channel still gets a row, with the failure reason naming what
// to set in .env. See providers/*.js.
// ============================================================================

import { query } from '../../shared/db/pool.js';

export async function recordNotification({
  alertId,
  recipientUserId,
  emergencyContactId,
  deviceTokenId,
  channel,
  destination,
  status,
  provider,
  providerMessageId,
  errorMessage,
}) {
  await query(
    `INSERT INTO notifications
       (alert_id, recipient_user_id, emergency_contact_id, device_token_id,
        channel, destination, status, provider, provider_message_id,
        error_message, attempt_count, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11)`,
    [
      alertId,
      recipientUserId ?? null,
      emergencyContactId,
      deviceTokenId ?? null,
      channel,
      destination,
      status,
      provider,
      providerMessageId ?? null,
      errorMessage ?? null,
      status === 'sent' ? new Date() : null,
    ]
  );
}

/**
 * The contact and time of the most recently created notification row for an
 * alert. Escalation only ever moves forward through the priority list, so at
 * any point in time the most recent row is always for the current stage's
 * contact — no need to aggregate across every row for that contact.
 */
export async function getLastNotifiedContact(alertId) {
  const { rows } = await query(
    `SELECT emergency_contact_id, created_at
       FROM notifications
      WHERE alert_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [alertId]
  );
  return rows[0]
    ? { emergencyContactId: rows[0].emergency_contact_id, createdAt: rows[0].created_at }
    : null;
}

/**
 * Active, unacknowledged alerts where either nothing has been attempted yet
 * or the last attempt was long enough ago to escalate. Feeds the scheduler's
 * sweep — see notifications/scheduler.js.
 */
export async function findAlertsDueForEscalation(intervalMinutes) {
  const { rows } = await query(
    `SELECT a.id
       FROM alerts a
      WHERE a.status = 'active'
        AND a.acknowledged_at IS NULL
        AND (
          NOT EXISTS (SELECT 1 FROM notifications n WHERE n.alert_id = a.id)
          OR (SELECT MAX(n.created_at) FROM notifications n WHERE n.alert_id = a.id)
               <= now() - make_interval(mins => $1)
        )`,
    [intervalMinutes]
  );
  return rows.map((r) => r.id);
}
