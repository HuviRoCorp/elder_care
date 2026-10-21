// ============================================================================
// Phone number normalisation (E.164)
//
// users.phone is UNIQUE on the exact string it was given, so without this the
// same person typing "9876543210" today and "+91 98765 43210" tomorrow creates
// two accounts and then cannot log in to the one they meant. Every phone number
// entering the system is reduced to one canonical form first:
//
//   +<country code><national number>, digits only, no spaces or punctuation
//
// Examples, all resolving to +919876543210 with the default country:
//
//   9876543210        bare national number
//   09876543210       with the Indian trunk prefix
//   919876543210      country code, no plus
//   +91 98765 43210   spaced
//   +91-98765-43210   hyphenated
//   0091 9876543210   international prefix instead of a plus
//
// Lives under shared/ rather than shared/auth/ because Phase 1 stores phone
// numbers for emergency contacts too, and those must match the same rule.
//
// Deliberately not libphonenumber: that library carries per-country number
// plans for the whole world and weighs several megabytes. What is needed here
// is one default country plus anything already written in international form.
// If the product ever ships outside India, swap this module for libphonenumber
// rather than growing a country table inside it.
// ============================================================================

import { config } from './config/env.js';

// E.164 permits at most 15 digits after the plus. The lower bound is a sanity
// check: no real subscriber number is shorter than this.
const E164_MAX_DIGITS = 15;
const E164_MIN_DIGITS = 8;

// Characters people actually type as separators. Stripped before validation so
// a correctly typed number is never rejected for its formatting.
const SEPARATORS = /[\s()\-.]/g;

/**
 * Reduces a phone number to E.164.
 *
 * @param {unknown} raw           what the user typed
 * @param {object}  [options]
 * @param {string}  [options.callingCode]    digits only, no plus, e.g. '91'
 * @param {number}  [options.nationalDigits] length of a national number in that country
 * @returns {{ok: true, value: string} | {ok: false, reason: string}}
 *
 * Returns a result rather than throwing, because the caller collects several
 * field errors and reports them together.
 */
export function normalizePhone(raw, options = {}) {
  const callingCode = options.callingCode ?? config.defaultCallingCode;
  const nationalDigits = options.nationalDigits ?? config.defaultNationalDigits;

  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, reason: 'Phone is required.' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'Phone must be a string.' };
  }

  const cleaned = raw.trim().replace(SEPARATORS, '');

  if (cleaned === '') {
    return { ok: false, reason: 'Phone is required.' };
  }

  // '00' is the international access prefix in most of the world and means the
  // same thing as a leading plus.
  const candidate = cleaned.startsWith('00') ? `+${cleaned.slice(2)}` : cleaned;

  const isInternational = candidate.startsWith('+');
  const digits = isInternational ? candidate.slice(1) : candidate;

  if (!/^[0-9]+$/.test(digits)) {
    return {
      ok: false,
      reason: 'Phone may contain only digits, an optional leading +, and spaces or hyphens.',
    };
  }

  let e164Digits;

  if (isInternational) {
    // Already carries its own country code — any country, not just the default.
    // This is what keeps the module from blocking a future non-Indian user.
    e164Digits = digits;
  } else if (digits.length === nationalDigits) {
    // A bare national number: assume the default country.
    e164Digits = callingCode + digits;
  } else if (digits.startsWith('0') && digits.length === nationalDigits + 1) {
    // National trunk prefix, as in 09876543210. The 0 is a dialling
    // instruction, not part of the number, and never appears in E.164.
    e164Digits = callingCode + digits.slice(1);
  } else if (digits.startsWith(callingCode) && digits.length === callingCode.length + nationalDigits) {
    // Country code present but the plus was left off.
    e164Digits = digits;
  } else {
    return {
      ok: false,
      reason:
        `Phone must be ${nationalDigits} digits, or start with + and its country code ` +
        `(for example +${callingCode}${'9'.repeat(nationalDigits)}).`,
    };
  }

  if (e164Digits.startsWith('0')) {
    return { ok: false, reason: 'A country code cannot start with 0.' };
  }
  if (e164Digits.length < E164_MIN_DIGITS || e164Digits.length > E164_MAX_DIGITS) {
    return {
      ok: false,
      reason: `Phone must be between ${E164_MIN_DIGITS} and ${E164_MAX_DIGITS} digits including the country code.`,
    };
  }

  return { ok: true, value: `+${e164Digits}` };
}
