// ============================================================================
// Password hashing
//
// bcrypt, not a plain SHA hash: bcrypt is deliberately slow and salts every
// password individually, so a leaked users table cannot be cracked with
// precomputed tables and each password must be attacked separately.
// ============================================================================

import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';

// bcrypt only reads the first 72 BYTES of input and silently ignores the rest.
// Callers must reject longer passwords rather than let two different long
// passwords hash to the same value. See validate.js.
export const BCRYPT_MAX_BYTES = 72;

export function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, config.bcryptRounds);
}

/**
 * Constant-time comparison of a candidate password against a stored hash.
 * Returns false rather than throwing when the stored hash is malformed.
 */
export function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}
