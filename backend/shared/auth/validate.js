// ============================================================================
// Input validation for the auth routes
//
// Every rule here exists to stop a bad row reaching the database, or to keep a
// column's constraint from surfacing as a 500. Collects all problems and
// reports them together, so a client fixing a form is not told about one
// mistake at a time.
// ============================================================================

import { badRequest } from '../http/errors.js';
import { normalizePhone } from '../phone.js';
import { BCRYPT_MAX_BYTES } from './password.js';

// Roles a person may give themselves. 'admin' is deliberately absent: a public
// endpoint that grants admin is a privilege-escalation hole. Admins are made by
// promoting an existing user directly in the database.
export const SELF_ASSIGNABLE_ROLES = ['elderly', 'family', 'caregiver'];
export const ALL_ROLES = [...SELF_ASSIGNABLE_ROLES, 'admin'];

export const PASSWORD_MIN_LENGTH = 8;

// Deliberately permissive. Strict email regexes reject valid addresses; the
// real check is whether mail to it is ever delivered.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Phone numbers are not pattern-matched here. They go through normalizePhone,
// which reduces every accepted way of writing a number to one canonical E.164
// string — registration and login must apply exactly the same reduction, or
// the two ends disagree about which account a number belongs to.

function fieldErrors(checks) {
  return checks.filter((c) => c.when).map(({ field, message }) => ({ field, message }));
}

export function validateRegister(body = {}) {
  const { email, password, fullName, phone, role, preferredLanguage } = body;

  // Phone is the account's identity; email is optional extra contact detail.
  // An absent email and an empty-string email mean the same thing here, so
  // neither is run through the format checks below.
  const hasEmail = typeof email === 'string' && email.trim() !== '';

  // Reduced to E.164 before anything else looks at it, so the value that
  // reaches the UNIQUE constraint is the same one a later login will produce.
  const normalizedPhone = normalizePhone(phone);

  const errors = fieldErrors([
    { when: email !== undefined && email !== null && typeof email !== 'string',
      field: 'email', message: 'Email must be a string.' },
    { when: hasEmail && !EMAIL_RE.test(email.trim()),
      field: 'email', message: 'Email is not a valid address.' },
    { when: hasEmail && email.trim().length > 255,
      field: 'email', message: 'Email must be 255 characters or fewer.' },

    { when: !normalizedPhone.ok, field: 'phone', message: normalizedPhone.reason },

    { when: !password, field: 'password', message: 'Password is required.' },
    { when: typeof password === 'string' && password.length < PASSWORD_MIN_LENGTH,
      field: 'password', message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` },
    // Longer than this and bcrypt silently ignores the tail, so two different
    // passwords could unlock the same account.
    { when: typeof password === 'string' && Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES,
      field: 'password', message: `Password must be ${BCRYPT_MAX_BYTES} bytes or fewer.` },

    { when: !fullName, field: 'fullName', message: 'Full name is required.' },
    { when: typeof fullName === 'string' && (fullName.trim().length < 1 || fullName.trim().length > 120),
      field: 'fullName', message: 'Full name must be 1-120 characters.' },

    { when: !role, field: 'role', message: 'Role is required.' },
    { when: role && !ALL_ROLES.includes(role),
      field: 'role', message: `Role must be one of: ${ALL_ROLES.join(', ')}.` },

    { when: preferredLanguage !== undefined &&
            (typeof preferredLanguage !== 'string' || preferredLanguage.length > 10),
      field: 'preferredLanguage', message: 'Preferred language must be 10 characters or fewer.' },
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'One or more fields are invalid.', { details: errors });
  }

  return {
    // NULL rather than '' when omitted: users.email is a nullable UNIQUE
    // column, and PostgreSQL allows many NULLs but only one empty string.
    email: hasEmail ? email.trim().toLowerCase() : null,
    phone: normalizedPhone.value,
    password,
    fullName: fullName.trim(),
    role,
    preferredLanguage: preferredLanguage?.trim() || 'en',
  };
}

/**
 * Login accepts either identity. Phone is the primary one — many elderly users
 * have no email address — but a family member who registered with both should
 * not be made to remember which field the form wants, so email still works.
 */
export function validateLogin(body = {}) {
  const { phone, email, password } = body;

  const hasPhone = typeof phone === 'string' && phone.trim() !== '';
  const hasEmail = typeof email === 'string' && email.trim() !== '';

  // The same reduction registration used. Applying it here is the whole point:
  // the number is looked up in the form it was stored in, whatever the user
  // typed this time.
  const normalizedPhone = hasPhone ? normalizePhone(phone) : null;

  const errors = fieldErrors([
    { when: !hasPhone && !hasEmail, field: 'phone', message: 'Phone or email is required.' },
    { when: normalizedPhone !== null && !normalizedPhone.ok,
      field: 'phone', message: normalizedPhone?.reason },
    { when: !password || typeof password !== 'string', field: 'password', message: 'Password is required.' },
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'One or more fields are invalid.', { details: errors });
  }

  // Phone wins when both are sent, so the lookup is decided here rather than
  // leaving two possible users to whichever query ran first.
  return {
    phone: hasPhone ? normalizedPhone.value : null,
    email: hasPhone || !hasEmail ? null : email.trim().toLowerCase(),
    password,
  };
}

export function validateRefreshTokenBody(body = {}) {
  const { refreshToken } = body;

  if (!refreshToken || typeof refreshToken !== 'string') {
    throw badRequest('validation_failed', 'One or more fields are invalid.', {
      details: [{ field: 'refreshToken', message: 'Refresh token is required.' }],
    });
  }

  return refreshToken;
}
