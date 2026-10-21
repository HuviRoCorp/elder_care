// ============================================================================
// Auth routes — mounted at /auth
//
//   POST /auth/register   create an account
//   POST /auth/login      exchange credentials for tokens
//   POST /auth/refresh    exchange a refresh token for a new pair
//   POST /auth/logout     revoke a refresh token
//   GET  /auth/me         the caller's own record
//   GET  /auth/admin/users  admin-only, demonstrates requireRole
//
// Lives under shared/ because both the emergency and caregiver modules depend
// on it. Express 5 forwards rejected promises to the error handler, so these
// handlers throw ApiError rather than writing error responses themselves.
// ============================================================================

import { Router } from 'express';
import { query } from '../db/pool.js';
import { unauthorized, forbidden, conflict } from '../http/errors.js';
import { hashPassword, verifyPassword } from './password.js';
import { requireAuth, requireRole } from './middleware.js';
import {
  signAccessToken,
  issueRefreshToken,
  findRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} from './tokens.js';
import { createUser, findUserForLogin, markLoggedIn, toPublicUser } from './users.js';
import { validateRegister, validateLogin, validateRefreshTokenBody, SELF_ASSIGNABLE_ROLES } from './validate.js';

export const authRouter = Router();

const PG_UNIQUE_VIOLATION = '23505';

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------

authRouter.post('/register', async (req, res) => {
  const input = validateRegister(req.body);

  // Checked after validation so an unknown role is reported as a validation
  // error, while a known-but-privileged role gets its own explanation.
  if (!SELF_ASSIGNABLE_ROLES.includes(input.role)) {
    throw forbidden(
      'role_not_self_assignable',
      `Role '${input.role}' cannot be chosen at registration. Allowed: ${SELF_ASSIGNABLE_ROLES.join(', ')}.`
    );
  }

  const passwordHash = await hashPassword(input.password);

  let user;
  try {
    user = await createUser({ ...input, passwordHash });
  } catch (err) {
    // Relying on the unique constraint rather than a pre-check: two
    // simultaneous registrations would both pass a pre-check and one would
    // still fail here. The database is the only thing that can decide.
    if (err.code === PG_UNIQUE_VIOLATION) {
      const field = err.constraint === 'users_phone_key' ? 'phone' : 'email';
      throw conflict('account_exists', `An account with this ${field} already exists.`);
    }
    throw err;
  }

  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id, req);

  res.status(201).json({ status: 'ok', user: toPublicUser(user), accessToken, refreshToken });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

authRouter.post('/login', async (req, res) => {
  const { phone, email, password } = validateLogin(req.body);

  const user = await findUserForLogin({ phone, email });

  // One message for "no such account" and for "wrong password", so the endpoint
  // cannot be used to discover which numbers or addresses are registered.
  const invalid = unauthorized('invalid_credentials', 'Phone/email or password is incorrect.');

  if (!user) {
    // Hash anyway: returning instantly for unknown emails leaks their absence
    // through response timing alone.
    await hashPassword(password);
    throw invalid;
  }

  if (!(await verifyPassword(password, user.password_hash))) throw invalid;

  if (!user.is_active) {
    throw forbidden('account_disabled', 'This account has been deactivated.');
  }

  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id, req);
  await markLoggedIn(user.id);

  res.json({ status: 'ok', user: toPublicUser(user), accessToken, refreshToken });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

authRouter.post('/refresh', async (req, res) => {
  const presented = validateRefreshTokenBody(req.body);
  const stored = await findRefreshToken(presented);

  if (!stored) {
    throw unauthorized('invalid_refresh_token', 'Refresh token is not recognised.');
  }

  if (stored.revoked_at) {
    // Why the token was revoked decides how alarming this is.
    //
    // 'rotated' means the token was already exchanged for a successor, yet
    // someone still holds this copy and is trying to spend it a second time.
    // Either it was stolen or the legitimate holder's was, and there is no way
    // to tell which — so end every session for the account.
    if (stored.revoked_reason === 'rotated') {
      const revoked = await revokeAllUserTokens(stored.user_id);
      console.warn(
        `Refresh token reuse detected for user ${stored.user_id}; revoked ${revoked} active token(s).`
      );
      throw unauthorized('refresh_token_reused', 'Refresh token has already been used. All sessions ended.');
    }

    // Any other reason — 'logout' being the ordinary one — is a session that
    // is simply over. This device must log in again; the user's other devices
    // are none of its business and keep working.
    throw unauthorized('refresh_token_revoked', 'This session has ended. Please log in again.');
  }

  if (new Date(stored.expires_at) <= new Date()) {
    throw unauthorized('refresh_token_expired', 'Refresh token has expired. Please log in again.');
  }

  const { rows } = await query(
    `SELECT id, role, is_active FROM users WHERE id = $1`,
    [stored.user_id]
  );
  const user = rows[0];

  if (!user) throw unauthorized('user_not_found', 'The user for this token no longer exists.');
  if (!user.is_active) throw forbidden('account_disabled', 'This account has been deactivated.');

  const accessToken = signAccessToken(user);
  const refreshToken = await rotateRefreshToken(stored.id, user.id, req);

  res.json({ status: 'ok', accessToken, refreshToken });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

authRouter.post('/logout', async (req, res) => {
  const presented = validateRefreshTokenBody(req.body);
  const revoked = await revokeRefreshToken(presented, 'logout');

  // Deliberately 200 either way. Logging out is not a place to tell an
  // attacker whether the token they hold was real, and a client retrying a
  // logout should not see it fail.
  res.json({ status: 'ok', revoked });
});

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ status: 'ok', user: req.user });
});

// ---------------------------------------------------------------------------
// GET /auth/admin/users — admin only
//
// The smallest real route that exercises requireRole. Any non-admin gets 403
// even with a perfectly valid access token.
// ---------------------------------------------------------------------------

authRouter.get('/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  const { rows } = await query(
    `SELECT id, full_name, email, role, is_active, created_at
       FROM users
      ORDER BY created_at DESC
      LIMIT 50`
  );

  res.json({
    status: 'ok',
    count: rows.length,
    users: rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      role: r.role,
      isActive: r.is_active,
      createdAt: r.created_at,
    })),
  });
});
