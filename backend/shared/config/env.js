// ============================================================================
// Environment configuration
//
// Single place where the process reads .env. Everything else imports the
// frozen `config` object below, so no other file calls process.env directly
// and a missing variable is caught here at startup instead of surfacing as a
// confusing error deep inside a request.
// ============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

// .env lives at the repository root, not inside backend/, so that the same
// file can serve any tooling added later. Resolved from this file's own
// location rather than process.cwd(), so `npm start` works from any directory.
const envPath = path.resolve(here, '../../../.env');

dotenv.config({ path: envPath, quiet: true });

// Fail loudly and immediately if the server was started without its settings.
const required = ['DATABASE_URL', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missing.join(', ')}\n` +
      `Expected them in ${envPath}\n` +
      `Copy .env.example to .env and fill in the values.`
  );
  process.exit(1);
}

// A short signing key is the weak link in an otherwise sound token scheme: it
// can be brute-forced offline from a single captured JWT. This used to be a
// console.warn, which meant a deployment with a weak secret would start up
// fine and stay silently vulnerable until someone happened to read the logs.
// Same fail-loud-at-startup treatment as the missing-variable check above,
// for the same reason: catching this here is a one-line message pointing at
// this file, not a security incident discovered later.
const MIN_SECRET_LENGTH = 32;
if (process.env.JWT_SECRET.length < MIN_SECRET_LENGTH) {
  console.error(
    `JWT_SECRET is ${process.env.JWT_SECRET.length} characters; ${MIN_SECRET_LENGTH}+ required.\n` +
      `Expected it in ${envPath}\n` +
      `Generate one with:\n` +
      `  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
  );
  process.exit(1);
}

export const config = Object.freeze({
  databaseUrl: process.env.DATABASE_URL,
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  jwtSecret: process.env.JWT_SECRET,
  // Short, because an access token cannot be revoked once issued — the window
  // in which a stolen one is useful is exactly this long.
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  // Long, because this one lives in the refresh_tokens table and CAN be revoked.
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30,
  jwtIssuer: 'eldercare',
  bcryptRounds: 12,

  // Country assumed when someone types a bare national number with no country
  // code. Configurable rather than hard-coded so serving another country later
  // is a settings change, not a code change. Numbers already written in
  // international form (+... or 00...) are accepted for any country regardless
  // of what these say. See shared/phone.js.
  defaultCallingCode: (process.env.DEFAULT_CALLING_CODE || '91').replace(/^\+/, ''),
  defaultNationalDigits: Number(process.env.DEFAULT_NATIONAL_DIGITS) || 10,

  // Notification channels — Phase 1 step 3. None of these are in `required`
  // above: every channel is optional at startup, and each provider checks its
  // own isConfigured() before sending. An unconfigured channel is not a
  // startup error, it is a per-attempt `notifications` row with status
  // 'failed' and an error_message naming exactly what's missing. See
  // backend/emergency/notifications/providers/.
  resendApiKey: process.env.RESEND_API_KEY || null,
  // Resend's own sandbox sender, valid with no domain verification — fine for
  // development, replace once a real sending domain is verified.
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev',

  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || null,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || null,
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER || null,

  // How long an active, unacknowledged alert waits before the next contact is
  // notified. "A few minutes" per the product requirement — configurable
  // rather than hard-coded so it can be tuned without a code change.
  escalationIntervalMinutes: Number(process.env.ESCALATION_INTERVAL_MINUTES) || 5,
});
