// ============================================================================
// Caregiver-side ownership checks
//
// family/links.js covers "is this family member permitted to act for this
// elderly user" — there is no equivalent for "is this caller the specific
// caregiver assigned to this resource," because family/emergency have no
// concept of a caregiver. bookings.service.js and attendance.service.js each
// used to inline their own `SELECT user_id FROM caregivers WHERE id = $1`
// check; this is that check pulled out once so schedules/tasks/reports don't
// grow a third and fourth copy of it.
// ============================================================================

import { query } from '../../shared/db/pool.js';

/** True if `userId` is the account behind the caregiver profile `caregiverId`. */
export async function isAssignedCaregiver(userId, caregiverId) {
  if (!caregiverId) return false;
  const { rows } = await query(`SELECT 1 FROM caregivers WHERE id = $1 AND user_id = $2`, [caregiverId, userId]);
  return rows.length > 0;
}

/**
 * True if `userId`'s caregiver profile has a real assignment with
 * `elderlyUserId` — a booking past the request stage, or a scheduled visit.
 * Backs the caregiver's read-only access to that elderly user's care plan
 * (see care-plans.routes.js): being searchable is not being assigned.
 */
export async function caregiverHasAssignmentWith(userId, elderlyUserId) {
  const { rows } = await query(
    `SELECT 1
       FROM caregivers c
      WHERE c.user_id = $1
        AND (
          EXISTS (
            SELECT 1 FROM caregiver_bookings b
             WHERE b.caregiver_id = c.id AND b.elderly_user_id = $2
               AND b.status IN ('confirmed', 'active', 'completed')
          )
          OR EXISTS (
            SELECT 1 FROM schedules s
             WHERE s.caregiver_id = c.id AND s.elderly_user_id = $2
          )
        )
      LIMIT 1`,
    [userId, elderlyUserId]
  );
  return rows.length > 0;
}
