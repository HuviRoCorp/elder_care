// ============================================================================
// Auth middleware
//
// requireAuth        — proves who the caller is
// requireRole(...)   — decides whether that person may do this
//
// Both are exported for the emergency and caregiver modules to use on their
// own routes; neither is specific to the auth endpoints.
// ============================================================================

import jwt from 'jsonwebtoken';
import { unauthorized, forbidden } from '../http/errors.js';
import { verifyAccessToken } from './tokens.js';
import { findUserById, toPublicUser } from './users.js';

function bearerToken(req) {
  const header = req.get('authorization');
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (!/^Bearer$/i.test(scheme) || !token) return null;

  return token;
}

/**
 * Verifies the access token and attaches req.user.
 *
 * Reloads the user from the database on every request rather than trusting the
 * claims inside the token. A JWT cannot be recalled once issued, so without
 * this a deactivated account would keep working until its token expired, and a
 * role change would not take effect. One indexed primary-key lookup is a cheap
 * price for revocation taking effect immediately.
 */
export async function requireAuth(req, res, next) {
  const token = bearerToken(req);

  if (!token) {
    return next(unauthorized('missing_token', 'Authorization header with a Bearer token is required.'));
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    // Distinguished so a client knows to call /auth/refresh instead of
    // sending the user back to the login screen.
    if (err instanceof jwt.TokenExpiredError) {
      return next(unauthorized('token_expired', 'Access token has expired.'));
    }
    return next(unauthorized('invalid_token', 'Access token is invalid.'));
  }

  const user = await findUserById(payload.sub);

  if (!user) {
    return next(unauthorized('user_not_found', 'The user for this token no longer exists.'));
  }
  if (!user.is_active) {
    return next(forbidden('account_disabled', 'This account has been deactivated.'));
  }

  req.user = toPublicUser(user);
  next();
}

/**
 * Restricts a route to the given roles. Must run after requireAuth.
 *
 *   router.get('/admin/users', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...roles) {
  const allowed = roles.flat();

  return (req, res, next) => {
    if (!req.user) {
      // A programming mistake, not a client one: requireAuth was left out.
      return next(unauthorized('not_authenticated', 'Authentication is required for this route.'));
    }
    if (!allowed.includes(req.user.role)) {
      return next(
        forbidden('insufficient_role', `This route requires one of these roles: ${allowed.join(', ')}.`)
      );
    }
    next();
  };
}
