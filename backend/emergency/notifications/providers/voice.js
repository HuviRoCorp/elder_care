// ============================================================================
// Voice call provider — Twilio. Wired but inactive until TWILIO_* is set.
//
// Uses inline TwiML on the call-create request rather than a hosted TwiML
// endpoint — one POST is enough for a fixed spoken message, no need to stand
// up and expose a second URL just to tell Twilio what to say.
//
// Same DLT caveat as sms.js: this reaches a Twilio-verified number as soon as
// credentials are set, but Indian numbers in production need the client's
// separate DLT registration for SMS — voice calls are not covered by DLT, but
// international caller ID and carrier call-screening on Indian networks are a
// separate, real-world concern worth testing once a route is live.
// ============================================================================

import { config } from '../../../shared/config/env.js';

const callsUrl = () => `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Calls.json`;

export const name = 'twilio';

export function isConfigured() {
  return Boolean(config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber);
}

function escapeXml(text) {
  return text.replace(/[<>&'"]/g, (char) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char])
  );
}

/**
 * @param {{ destination: string, text: string }} message  `text` is spoken, not written
 * @returns {Promise<{ success: boolean, providerMessageId?: string, errorMessage?: string }>}
 */
export async function send({ destination, text }) {
  if (!isConfigured()) {
    return {
      success: false,
      errorMessage:
        'Voice calling is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER in .env.',
    };
  }

  const twiml = `<Response><Say>${escapeXml(text)}</Say></Response>`;
  const body = new URLSearchParams({ To: destination, From: config.twilioFromNumber, Twiml: twiml });
  const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');

  let response;
  try {
    response = await fetch(callsUrl(), {
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
