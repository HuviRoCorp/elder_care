// ============================================================================
// Headless-safe network calls for background location — Phase 3 step 2.
//
// Deliberately does not go through shared/api/client.js. That module's
// Bearer-token wiring (configureApiClient) is set up inside AuthProvider's
// mount effect, which never runs when Android executes this bundle headless
// — the app fully closed, woken only to run the location task (see
// backgroundLocationTask.js). This reads tokens directly from tokenStore
// (SecureStore, safe to call outside React) and repeats client.js's own
// refresh-on-401 dance in miniature, rather than sharing code that assumes a
// mounted app.
// ============================================================================

import { API_URL, REQUEST_TIMEOUT_MS } from '../config';
import { loadTokens, saveTokens, clearTokens } from '../auth/tokenStore';
import { peekQueue, removeOldest } from './locationQueue';
import { disableBackgroundTrackingSilently } from './backgroundTracking';

let flushing = false; // non-reentrant guard: a headless tick and a foreground call could overlap

async function rawPost(path, body, accessToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : null),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? safeParse(text) : null;
    return { ok: response.ok, status: response.status, payload };
  } catch {
    // Unreachable backend, timeout, or DNS failure — never distinguished
    // here, same as client.js: any of them means "try again later."
    return { ok: false, networkError: true };
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function refreshTokens(refreshToken) {
  if (!refreshToken) return null;

  const result = await rawPost('/auth/refresh', { refreshToken }, null);
  if (!result.ok) {
    // Invalid, reused, expired or revoked — every one of these means the
    // session is genuinely over (see API.md's /auth/refresh error table).
    // There is no legitimate way to keep reporting location without a
    // session, and leaving the foreground-service notification running for
    // a dead session would be actively misleading.
    await clearTokens();
    await disableBackgroundTrackingSilently();
    return null;
  }

  const renewed = { accessToken: result.payload.accessToken, refreshToken: result.payload.refreshToken };
  await saveTokens(renewed);
  return renewed;
}

/** Sends one reading, refreshing the token once if needed. */
async function sendReading(reading, tokens) {
  const result = await rawPost('/emergency/locations', reading, tokens.accessToken);
  if (result.ok) return { ok: true };
  if (result.networkError) return { ok: false };

  if (result.status === 401 && result.payload?.code === 'token_expired') {
    const renewed = await refreshTokens(tokens.refreshToken);
    if (!renewed) return { ok: false };
    const retry = await rawPost('/emergency/locations', reading, renewed.accessToken);
    return retry.ok ? { ok: true, tokens: renewed } : { ok: false };
  }

  // Any other 4xx means the server will never accept this exact reading —
  // shouldn't happen, since the task builds every field itself, but a stuck
  // malformed reading must not block everything queued behind it forever.
  if (result.status >= 400 && result.status < 500) {
    console.warn(`Background location reading rejected (${result.status}) — dropping it.`);
    return { ok: true };
  }

  return { ok: false }; // 5xx or anything else — worth retrying next tick
}

/**
 * Drains the on-device queue, oldest first, stopping at the first reading
 * that can't be resolved (network down, or an unrecoverable auth failure —
 * see refreshTokens above). Called after every task delivery (see
 * backgroundLocationTask.js) rather than on a separate connectivity
 * listener: the next scheduled tick already retries automatically once
 * connectivity returns, which bounds the worst-case delay to one interval
 * (90s) without a dedicated NetInfo dependency.
 */
export async function flushLocationQueue() {
  if (flushing) return;
  flushing = true;
  try {
    const items = await peekQueue();
    if (items.length === 0) return;

    let tokens = await loadTokens();
    if (!tokens.accessToken) return; // signed out — nothing to authenticate with

    let sent = 0;
    for (const item of items) {
      const { queuedAt, ...reading } = item; // queuedAt is local bookkeeping only, not part of the API body
      const result = await sendReading(reading, tokens);
      if (!result.ok) break;
      if (result.tokens) tokens = result.tokens;
      sent += 1;
    }
    if (sent > 0) await removeOldest(sent);
  } finally {
    flushing = false;
  }
}
