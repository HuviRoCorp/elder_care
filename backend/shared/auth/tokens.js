// ============================================================================
// Token issuing and storage
//
// Two different kinds of token, for two different reasons:
//
//   Access token  — a signed JWT, 15 minutes, never stored. Verifying it needs
//                   no database round trip, which is why it is the one sent on
//                   every request. The cost is that it cannot be revoked, so
//                   it is kept short-lived.
//
//   Refresh token — a random 256-bit string, 30 days, one row in
//                   refresh_tokens. Because it IS stored, it can be revoked:
//                   that is what makes remote logout possible.
//
// The refresh token is hashed with SHA-256 before storage, so a leaked
// database yields no usable sessions. SHA-256 rather than bcrypt because the
// column is UNIQUE and must be looked up by value — bcrypt salts each hash
// differently, so an equality lookup could never match. That is safe here
// only because the token is 256 bits of randomness, not a guessable password.
// ============================================================================

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { config } from '../config/env.js';

// ---------------------------------------------------------------------------
// Access tokens
// ---------------------------------------------------------------------------

export function signAccessToken(user) {
  return jwt.sign(
    { role: user.role },
    config.jwtSecret,
    {
      subject: user.id,
      expiresIn: config.accessTokenTtl,
      issuer: config.jwtIssuer,
    }
  );
}

/** Throws jwt.TokenExpiredError / JsonWebTokenError on any problem. */
export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret, { issuer: config.jwtIssuer });
}

// ---------------------------------------------------------------------------
// Refresh tokens
// ---------------------------------------------------------------------------

const generateRefreshToken = () => crypto.randomBytes(32).toString('base64url');
const hashRefreshToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

function expiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + config.refreshTokenTtlDays);
  return d;
}

/** Details about the caller, recorded so a user can recognise their sessions. */
function clientInfo(req) {
  return {
    ip: req?.ip ?? null,
    userAgent: req?.get?.('user-agent') ?? null,
    deviceLabel: req?.body?.deviceLabel ?? null,
  };
}

/** Creates a refresh_tokens row and returns the raw token (shown once, never stored). */
export async function issueRefreshToken(userId, req) {
  const raw = generateRefreshToken();
  const { ip, userAgent, deviceLabel } = clientInfo(req);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_label, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, hashRefreshToken(raw), deviceLabel, ip, userAgent, expiryDate()]
  );

  return raw;
}

/**
 * Looks up a refresh token by value.
 *
 * Returns the row whether or not it is still valid, including revoked_reason:
 * the caller must tell an ended session apart from a replayed one. A token
 * revoked by logout is simply finished, but a token revoked by rotation being
 * presented again means two parties hold the same secret.
 */
export async function findRefreshToken(raw) {
  const { rows } = await query(
    `SELECT id, user_id, revoked_at, revoked_reason, expires_at
       FROM refresh_tokens
      WHERE token_hash = $1`,
    [hashRefreshToken(raw)]
  );
  return rows[0] ?? null;
}

/**
 * Atomically replaces one refresh token with a new one.
 *
 * Done as a single data-modifying CTE so the insert and the revocation cannot
 * be separated by a crash — there is never a moment where the old token is
 * dead but no replacement exists, or where both are live.
 */
export async function rotateRefreshToken(oldTokenId, userId, req) {
  const raw = generateRefreshToken();
  const { ip, userAgent, deviceLabel } = clientInfo(req);

  await query(
    `WITH inserted AS (
       INSERT INTO refresh_tokens
              (user_id, token_hash, device_label, ip_address, user_agent, expires_at)
       VALUES ($2, $3, $4, $5, $6, $7)
       RETURNING id
     )
     UPDATE refresh_tokens
        SET revoked_at           = now(),
            revoked_reason       = 'rotated',
            replaced_by_token_id = (SELECT id FROM inserted),
            last_used_at         = now()
      WHERE id = $1`,
    [oldTokenId, userId, hashRefreshToken(raw), deviceLabel, ip, userAgent, expiryDate()]
  );

  return raw;
}

/** Revokes one token. Returns true if a live token was actually revoked. */
export async function revokeRefreshToken(raw, reason = 'logout') {
  const { rowCount } = await query(
    `UPDATE refresh_tokens
        SET revoked_at = now(), revoked_reason = $2
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashRefreshToken(raw), reason]
  );
  return rowCount > 0;
}

/**
 * Revokes every live token for a user.
 * Used as the breach response when a token that was already rotated away is
 * presented again: either it was stolen, or the real user's copy was. Ending
 * all sessions is the safe reaction to not knowing which.
 */
export async function revokeAllUserTokens(userId, reason = 'token_reuse_detected') {
  const { rowCount } = await query(
    `UPDATE refresh_tokens
        SET revoked_at = now(), revoked_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, reason]
  );
  return rowCount;
}
