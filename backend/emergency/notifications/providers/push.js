// ============================================================================
// Expo push provider — the primary channel, live with no configuration.
//
// Talks to Expo's push API directly over fetch rather than the expo-server-sdk
// package: the API is one POST with a JSON body, not enough surface to justify
// a dependency, matching this project's existing no-extra-dependency stance
// (see: no HTTP client library on the frontend either).
// ============================================================================

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export const name = 'expo';

/** Push needs no credentials to send — this always returns true. */
export function isConfigured() {
  return true;
}

/**
 * @param {{ destination: string, title: string, body: string, data?: object, categoryId?: string }} message
 * @returns {Promise<{ success: boolean, providerMessageId?: string, errorMessage?: string, staleToken?: boolean }>}
 */
export async function send({ destination, title, body, data, categoryId }) {
  let response;
  try {
    response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify([
        { to: destination, title, body, data, categoryId, priority: 'high', sound: 'default' },
      ]),
    });
  } catch (err) {
    return { success: false, errorMessage: `Could not reach Expo's push API: ${err.message}` };
  }

  const payload = await response.json().catch(() => null);
  const ticket = payload?.data?.[0];

  if (!response.ok || !ticket) {
    return { success: false, errorMessage: `Expo push API returned ${response.status}` };
  }

  if (ticket.status === 'error') {
    // 'DeviceNotRegistered' means the token is dead — uninstalled app, or the
    // device stopped accepting pushes from it. The caller (dispatcher) uses
    // staleToken to deactivate the device_tokens row so future alerts don't
    // keep retrying a token that can never succeed.
    return {
      success: false,
      errorMessage: ticket.message || ticket.details?.error || 'Unknown Expo push error',
      staleToken: ticket.details?.error === 'DeviceNotRegistered',
    };
  }

  return { success: true, providerMessageId: ticket.id };
}
