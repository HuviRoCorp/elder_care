// ============================================================================
// SMS provider — Twilio. Wired but inactive until TWILIO_* is set in .env.
//
// Twilio's Messages API is one POST with HTTP Basic Auth and a form-encoded
// body — plain fetch, no `twilio` SDK dependency.
//
// India: this can send the moment credentials are added, but SMS will not
// actually reach a real Indian mobile number in production until DLT
// (Distributed Ledger Technology) registration is complete with the telecom
// regulator — an entity registration, sender header and template, each
// needing approval. The client is arranging that; it takes on the order of
// weeks. It does not block development — Twilio trial accounts can text a
// verified number without it — only real delivery to real Indian numbers in
// production. See .env.example.
// ============================================================================

import { config } from '../../../shared/config/env.js';

const messagesUrl = () => `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`;

export const name = 'twilio';

export function isConfigured() {
  return Boolean(config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber);
}

/**
 * @param {{ destination: string, text: string }} message
 * @returns {Promise<{ success: boolean, providerMessageId?: string, errorMessage?: string }>}
 */
export async function send({ destination, text }) {
  if (!isConfigured()) {
    return {
      success: false,
      errorMessage:
        'SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER in .env. ' +
        'Delivery to real Indian numbers in production also needs DLT registration — the client is arranging that.',
    };
  }

  const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');
  const body = new URLSearchParams({ To: destination, From: config.twilioFromNumber, Body: text });

  let response;
  try {
    response = await fetch(messagesUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
  } catch (err) {
    return { success: false, errorMessage: `Could not reach Twilio's API: ${err.message}` };
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return { success: false, errorMessage: payload?.message || `Twilio API returned ${response.status}` };
  }

  return { success: true, providerMessageId: payload?.sid ?? null };
}
