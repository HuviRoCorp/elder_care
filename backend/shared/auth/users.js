// ============================================================================
// User lookups
//
// Every query here names its columns explicitly. `SELECT *` would pull
// password_hash along with everything else, and sooner or later that row gets
// handed to res.json().
// ============================================================================

import { query } from '../db/pool.js';

// The only columns that may ever leave the server.
const PUBLIC_COLUMNS = `
  id, phone, email, full_name, role, preferred_language,
  profile_photo_url, is_active, last_login_at, created_at
`;

/** Maps a snake_case database row to the camelCase shape the API returns. */
export function toPublicUser(row) {
  return {
    id: row.id,
    phone: row.phone,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    preferredLanguage: row.preferred_language,
    profilePhotoUrl: row.profile_photo_url,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

export async function findUserById(id) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** Used by the family-link invite flow to resolve a typed phone number to an
 * account — phone is expected already normalized (E.164) by the caller. */
export async function findUserByPhone(phone) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE phone = $1`, [phone]);
  return rows[0] ?? null;
}

/**
 * Fetches a user for the login check, by phone or by email. This is the one
 * place password_hash is read, and it must never reach a response body.
 *
 * Exactly one identity is used — validateLogin picks phone when both are sent —
 * because an OR across two unique columns can match two different accounts.
 */
export async function findUserForLogin({ phone, email }) {
  const [column, value] = phone ? ['phone', phone] : ['email', email];

  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE ${column} = $1`,
    [value]
  );
  return rows[0] ?? null;
}

export async function createUser({ email, phone, passwordHash, fullName, role, preferredLanguage }) {
  const { rows } = await query(
    `INSERT INTO users (email, phone, password_hash, full_name, role, preferred_language)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${PUBLIC_COLUMNS}`,
    [email, phone, passwordHash, fullName, role, preferredLanguage]
  );
  return rows[0];
}

export function markLoggedIn(userId) {
  return query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
}
