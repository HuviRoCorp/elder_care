// ============================================================================
// Auth endpoints
//
// One function per endpoint in API.md, so no screen ever writes a URL. If the
// contract changes, it changes here and nowhere else.
//
// Note what is NOT here: any reshaping of the phone number. The backend
// normalises to E.164 and is the only place that does, deliberately — two
// implementations of that rule drift, and the moment they disagree the app and
// the server disagree about which account a number belongs to. Send the field
// exactly as the user typed it.
// ============================================================================

import { apiRequest } from './client';

/**
 * POST /auth/register — creates an account and returns tokens, so there is no
 * need to call login afterwards.
 *
 * @param {object} input
 * @param {string} input.phone     as typed; the server normalises it
 * @param {string} input.password
 * @param {string} input.fullName
 * @param {string} input.role      'elderly' | 'family' | 'caregiver'
 * @param {string} [input.email]   optional — omit it rather than sending ''
 * @param {string} [input.preferredLanguage]
 * @param {string} [input.deviceLabel]
 */
export function register(input) {
  return apiRequest('/auth/register', { method: 'POST', body: input, auth: false });
}

/**
 * POST /auth/login — send `phone` or `email`, plus `password`.
 * Phone is the primary identity; if both are sent the server uses the phone.
 */
export function login(credentials) {
  return apiRequest('/auth/login', { method: 'POST', body: credentials, auth: false });
}

/**
 * POST /auth/logout — revokes one refresh token, this device only.
 * Other devices stay signed in. Returns 200 whether or not the token was live.
 */
export function logout(refreshToken) {
  return apiRequest('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false });
}

/** GET /auth/me — the caller's own record. */
export function me() {
  return apiRequest('/auth/me');
}

/** GET /health — used by the placeholder screens to show whether the backend is up. */
export function health() {
  return apiRequest('/health', { auth: false });
}
