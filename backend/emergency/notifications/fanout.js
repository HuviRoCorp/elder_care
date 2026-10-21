// ============================================================================
// Fanout and escalation.
//
// One function, advanceFanout, does both jobs: called once synchronously
// (fire-and-forget) right after an SOS is created, it notifies contact 1 —
// there being no prior notifications row for the alert yet means "start from
// the top". Called again later by the escalation scheduler once the wait
// interval has passed with no acknowledgement, it notifies whoever comes
// after the last contact that was tried. Same logic, same code path, so
// "who's next" is never computed two different ways.
//
// Deliberately not a schema change: "how far escalation has gotten" is
// derived from the notifications table joined to emergency_contacts.priority,
// not a new column on alerts. See getLastNotifiedContact in records.js and
// BUILD_LOG.md for why.
// ============================================================================

import { query } from '../../shared/db/pool.js';
import { listActiveContactsOrderedByPriority, listActiveDeviceTokensForUser, deactivateDeviceToken } from './contacts.js';
import { recordNotification, getLastNotifiedContact } from './records.js';
import { buildAlertMessage } from './message.js';
import * as pushProvider from './providers/push.js';
import * as emailProvider from './providers/email.js';
import * as smsProvider from './providers/sms.js';
import * as voiceProvider from './providers/voice.js';

const PROVIDERS = {
  push: pushProvider,
  email: emailProvider,
  sms: smsProvider,
  voice_call: voiceProvider,
};

// Exported for reuse by broadcast.js — the family-wide push tier needs the
// same alert-plus-elderly-name shape this one already builds.
export async function getAlertWithOwnerName(alertId) {
  const { rows } = await query(
    `SELECT a.*, u.full_name AS elderly_full_name
       FROM alerts a
       JOIN users u ON u.id = a.user_id
      WHERE a.id = $1`,
    [alertId]
  );
  return rows[0] ?? null;
}

/**
 * Which channels this contact should be tried on, each with its destination.
 * A channel that has nothing to send to (no device token for push, no email
 * address) is left out entirely — that's not a failed attempt, there was
 * never anything to attempt. SMS/call are included whenever the contact has
 * opted in, even if the provider isn't configured yet: that is a failed
 * attempt, with a reason, which is exactly what should be recorded.
 */
async function buildChannelJobs(contact) {
  const jobs = [];

  if (contact.notify_by_push && contact.contact_user_id) {
    const tokens = await listActiveDeviceTokensForUser(contact.contact_user_id);
    for (const token of tokens) {
      jobs.push({ channel: 'push', destination: token.expo_push_token, deviceTokenId: token.id });
    }
  }

  if (contact.email) {
    jobs.push({ channel: 'email', destination: contact.email });
  }

  if (contact.notify_by_sms) {
    jobs.push({ channel: 'sms', destination: contact.phone });
  }

  if (contact.notify_by_call) {
    jobs.push({ channel: 'voice_call', destination: contact.phone });
  }

  return jobs;
}

async function dispatchOne(alert, contact, job, message) {
  const provider = PROVIDERS[job.channel];
  const content = message[job.channel];

  let result;
  try {
    result = await provider.send({ destination: job.destination, ...content });
  } catch (err) {
    result = { success: false, errorMessage: err.message };
  }

  if (result.staleToken && job.deviceTokenId) {
    await deactivateDeviceToken(job.deviceTokenId);
  }

  await recordNotification({
    alertId: alert.id,
    recipientUserId: contact.contact_user_id ?? null,
    emergencyContactId: contact.id,
    deviceTokenId: job.deviceTokenId ?? null,
    channel: job.channel,
    destination: job.destination,
    status: result.success ? 'sent' : 'failed',
    provider: provider.name,
    providerMessageId: result.providerMessageId ?? null,
    errorMessage: result.errorMessage ?? null,
  });
}

/**
 * Notifies the next eligible contact in priority order who hasn't been
 * notified yet, and only that one — never more than one contact per call.
 * No-ops quietly if the alert is no longer active, if it has no contacts, or
 * if every contact has already been tried (the alert stays active; a human
 * closes it — see BUILD_LOG.md).
 *
 * Known race, accepted rather than engineered around: the fire-and-forget
 * call from POST /emergency/alerts and a scheduler sweep could in principle
 * both call this for the same alert within the same instant, both see no
 * prior notifications, and both notify contact 1. Worst case is one
 * redundant round of notifications to the same contact, not a missed one —
 * judged not worth a database advisory lock for how rarely the timing could
 * actually collide.
 */
export async function advanceFanout(alertId) {
  const alert = await getAlertWithOwnerName(alertId);
  if (!alert || alert.status !== 'active') return;

  const contacts = await listActiveContactsOrderedByPriority(alert.user_id);
  if (contacts.length === 0) return;

  const last = await getLastNotifiedContact(alertId);
  let startIndex = 0;
  if (last) {
    const idx = contacts.findIndex((c) => c.id === last.emergencyContactId);
    // If the last-notified contact is no longer active (deactivated since),
    // stop rather than guess where to resume — treated as exhausted.
    startIndex = idx === -1 ? contacts.length : idx + 1;
  }

  const message = buildAlertMessage(alert, alert.elderly_full_name);

  for (let i = startIndex; i < contacts.length; i++) {
    const contact = contacts[i];
    const jobs = await buildChannelJobs(contact);
    if (jobs.length === 0) continue; // nothing reachable for this contact — skip, don't record, try the next

    await Promise.all(jobs.map((job) => dispatchOne(alert, contact, job, message)));
    return;
  }
}
