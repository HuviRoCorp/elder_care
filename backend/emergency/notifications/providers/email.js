// ============================================================================
// Email provider — Resend. Secondary channel, live once RESEND_API_KEY is set.
//
// Resend's API is one POST with a JSON body and a bearer key — plain fetch,
// no SDK, same reasoning as push.js.
// ============================================================================

import { config } from '../../../shared/config/env.js';

const RESEND_URL = 'https://api.resend.com/emails';

export const name = 'resend';

export function isConfigured() {
  return Boolean(config.resendApiKey);
}

/**
 * @param {{ destination: string, subject: string, text: string }} message
 * @returns {Promise<{ success: boolean, providerMessageId?: string, errorMessage?: string }>}
 */
export async function send({ destination, subject, text }) {
  if (!isConfigured()) {
    return {
      success: false,
      errorMessage: 'Email is not configured. Set RESEND_API_KEY in .env — sign up free at resend.com.',
    };
  }

  let response;
  try {
    response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: config.emailFromAddress, to: destination, subject, text }),
    });
  } catch (err) {
    return { success: false, errorMessage: `Could not reach Resend's API: ${err.message}` };
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return { success: false, errorMessage: payload?.message || `Resend API returned ${response.status}` };
  }

  return { success: true, providerMessageId: payload?.id ?? null };
}
