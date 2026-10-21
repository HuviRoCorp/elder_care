// ============================================================================
// Reads used by fanout — emergency_contacts and device_tokens.
//
// Rows reach this table two ways: written directly (see
// backend/scripts/seed-test-users.js), or auto-created when a family invite
// is accepted (backend/family/contactSync.js). There is still no endpoint to
// manage a contact by hand — add/edit/remove/reorder is not this step's
// scope. See BUILD_LOG.md.
// ============================================================================

import { query } from '../../shared/db/pool.js';

/** Active contacts for one elderly user, in the order fanout should try them. */
export async function listActiveContactsOrderedByPriority(elderlyUserId) {
  const { rows } = await query(
    `SELECT * FROM emergency_contacts
      WHERE user_id = $1 AND is_active = TRUE
      ORDER BY priority ASC, created_at ASC`,
    [elderlyUserId]
  );
  return rows;
}

/** Active device tokens for a user — a contact may be reachable on more than one device. */
export async function listActiveDeviceTokensForUser(userId) {
  const { rows } = await query(
    `SELECT * FROM device_tokens WHERE user_id = $1 AND is_active = TRUE`,
    [userId]
  );
  return rows;
}

/** Deactivates a device token Expo reports as no longer registered. */
export async function deactivateDeviceToken(id) {
  await query(`UPDATE device_tokens SET is_active = FALSE WHERE id = $1`, [id]);
}
