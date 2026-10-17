// ============================================================================
// API client
//
// One place that knows how to talk to the backend. Every screen goes through
// it, so the Bearer header, the refresh dance and the error shape are written
// once instead of in every component.
//
// What it does, in order, for an authenticated request:
//
//   1. Attaches `Authorization: Bearer <accessToken>`.
//   2. If the server answers 401 `token_expired`, calls POST /auth/refresh,
//      stores the new pair, and retries the original request once.
//   3. If the refresh itself fails, the session is genuinely over: it clears
//      the tokens and tells the app to show the login screen.
//
// A screen therefore never sees a token, never handles an expiry, and never
// has to know that refreshing exists.
//
// It holds no React state. AuthContext injects the few things it needs through
// configureApiClient, which keeps this file importable from anywhere without a
// circular dependency back into the component tree.
// ============================================================================

import { API_URL, REQUEST_TIMEOUT_MS } from '../config';

/** Anything the server said no to, in the shape API.md documents. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details ?? null;
  }
}

/** The request never reached the server, or took too long. */
export class NetworkError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'NetworkError';
    this.message = message;
    this.details = details || null;
  }
}

// ---------------------------------------------------------------------------
// Wiring, supplied by AuthContext at startup
// ---------------------------------------------------------------------------

let handlers = {
  getTokens: () => ({ accessToken: null, refreshToken: null }),
  onTokensRenewed: async () => {},
  onSessionEnded: async () => {},
};

export function configureApiClient(next) {
  handlers = { ...handlers, ...next };
}

// ---------------------------------------------------------------------------
// The single request
// ---------------------------------------------------------------------------

async function rawRequest(path, { method = 'GET', body, accessToken } = {}) {
  const targetUrl = `${API_URL}${path}`;
  const reqId = Math.random().toString(36).substring(2, 7);
  const startTime = Date.now();
  console.log(`[ElderCare API][${reqId}] >>> ${method} ${targetUrl}`);

  // Without a timeout a request to an unreachable backend hangs until the
  // platform gives up, which on a phone can be a minute of a spinner and no
  // explanation.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(targetUrl, {
      method,
      headers: {
        Accept: 'application/json',
        'Bypass-Tunnel-Reminder': '1',
        ...(body ? { 'Content-Type': 'application/json' } : null),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : null),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const isTimeout = err.name === 'AbortError';
    console.log(
      `[ElderCare API][${reqId}] <<< FAILED after ${elapsed}ms: ${err.name} - ${err.message}`
    );
    if (isTimeout) {
      throw new NetworkError(
        `Timeout after ${elapsed}ms: Server did not respond within ${REQUEST_TIMEOUT_MS / 1000}s (${targetUrl})`,
        { isTimeout: true, elapsed, url: targetUrl }
      );
    }
    throw new NetworkError(
      `Network failed after ${elapsed}ms: ${err.message || err.name} (${targetUrl})`,
      { isTimeout: false, elapsed, url: targetUrl, error: err.message }
    );
  } finally {
    clearTimeout(timer);
  }

  const elapsed = Date.now() - startTime;
  console.log(`[ElderCare API][${reqId}] <<< HTTP ${response.status} in ${elapsed}ms`);

  // 204 and friends have no body to parse.
  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    console.log(
      `[ElderCare API][${reqId}] <<< ERROR code=${payload?.code || 'none'}: ${payload?.error || response.statusText}`
    );
    throw new ApiError(
      response.status,
      payload?.code ?? 'unknown_error',
      payload?.error ?? `Request failed with status ${response.status}.`,
      payload?.details
    );
  }

  return payload;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    // A proxy or a captive portal returning HTML is the usual cause.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Refresh, shared between callers
// ---------------------------------------------------------------------------

// Several screens can fire requests at once, and if the access token has just
// expired they all get a 401 together. Without this, each would start its own
// refresh; the first would rotate the token and the rest would present a token
// that had already been exchanged — which the backend correctly treats as theft
// and answers by ending every session for the account. One shared promise means
// exactly one refresh happens and everyone waits for it.
let refreshInFlight = null;

function refreshTokens() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const { refreshToken } = handlers.getTokens();
    if (!refreshToken) throw new ApiError(401, 'no_refresh_token', 'There is no session to refresh.');

    const result = await rawRequest('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    });

    // Every refresh returns a new refresh token and invalidates the one just
    // used, so this has to be stored before anything else runs.
    await handlers.onTokensRenewed({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    return result.accessToken;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

// ---------------------------------------------------------------------------
// What the rest of the app calls
// ---------------------------------------------------------------------------

/**
 * Makes a request, refreshing the access token once if it has expired.
 *
 * @param {string} path            e.g. '/auth/me'
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {object} [options.body]
 * @param {boolean} [options.auth] send the Bearer token. Default true.
 */
export async function apiRequest(path, options = {}) {
  const { auth = true, ...rest } = options;

  const send = (accessToken) => rawRequest(path, { ...rest, accessToken });

  if (!auth) return send(null);

  const { accessToken } = handlers.getTokens();

  try {
    return await send(accessToken);
  } catch (err) {
    const expired = err instanceof ApiError && err.status === 401 && err.code === 'token_expired';
    if (!expired) throw err;

    let renewedAccessToken;
    try {
      renewedAccessToken = await refreshTokens();
    } catch (refreshErr) {
      // The refresh token is gone, expired, already used, or the account was
      // deactivated. Whichever it is, this session is over.
      await handlers.onSessionEnded(refreshErr);
      throw refreshErr;
    }

    // Retried exactly once. A second 401 is not an expiry problem, and
    // retrying in a loop would hammer the server.
    return send(renewedAccessToken);
  }
}
