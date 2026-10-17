// ============================================================================
// Application Configuration & Environment Settings
// ============================================================================

import Constants from 'expo-constants';

/** Port the backend listens on. Matches PORT in the repository's .env. */
const BACKEND_PORT = 5000;

/**
 * The address Metro is served from, e.g. "192.168.1.7:8081".
 * `hostUri` is the current field; `debuggerHost` is where older Expo Go builds
 * put the same value, so both are checked.
 */
function metroHost() {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? null;
  if (!hostUri) return null;

  const [host] = hostUri.split(':');
  return host || null;
}

/**
 * Phase 1 step 5. `EXPO_PUBLIC_API_URL` — inlined into the bundle at build
 * time by Expo's own env-var convention (SDK 49+), same value app.config.js
 * requires for a preview/production EAS build before it will even build (see
 * that file) — always wins when set.
 *
 * Below that, only __DEV__ builds (dev client / Expo Go) fall back to
 * Metro's own host, then to bare localhost — both fine there, since a dev
 * client is either running on the same machine as the backend or is actively
 * connected to Metro on the machine that is. A non-__DEV__ build (preview or
 * production) reaching this point means EXPO_PUBLIC_API_URL was missing —
 * app.config.js's build-time check exists to make that impossible for an EAS
 * build, but this is the last line of defence, so it throws rather than
 * silently resolving to a localhost address that can never reach a real
 * server from an installed APK. This is exactly the failure mode that put
 * every SOS location capture in doubt until it was traced — see
 * BUILD_LOG.md, 2026-08-26.
 */
function resolveApiUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL;

  if (typeof configured === 'string' && configured.trim() !== '') {
    return configured.trim().replace(/\/+$/, '');
  }

  if (__DEV__) {
    const host = metroHost();
    if (host) return `http://${host}:${BACKEND_PORT}`;
    return `http://localhost:${BACKEND_PORT}`;
  }

  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. This build has no way to reach a backend — ' +
      'refusing to silently fall back to localhost, which can never work from an ' +
      'installed app. See SETUP.md.'
  );
}

export const API_URL = resolveApiUrl();

// Log at startup so Metro console confirms the resolved URL.
console.log('[ElderCare] API_URL =', API_URL);

/** How long a request may take before it is given up on, in milliseconds (30s for Render free tier). */
export const REQUEST_TIMEOUT_MS = 30000;

/** Configurable 24/7 Emergency Response Center contact number. */
export const EMERGENCY_RESPONSE_CENTER_PHONE =
  Constants.expoConfig?.extra?.responseCenterPhone || '+919876543210';

/** Configurable Emergency Response Center desk name. */
export const EMERGENCY_RESPONSE_CENTER_NAME =
  Constants.expoConfig?.extra?.responseCenterName || 'ElderCare 24/7 Emergency Response Desk';
