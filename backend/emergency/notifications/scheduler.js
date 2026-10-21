// ============================================================================
// Escalation scheduler — a plain setInterval, not a cron dependency.
//
// Wakes up every SWEEP_INTERVAL_MS and asks the database which active,
// unacknowledged alerts are due (see findAlertsDueForEscalation), then
// advances each one. The sweep interval is fixed and short relative to
// ESCALATION_INTERVAL_MINUTES — it just needs to be frequent enough that no
// alert waits much longer than the configured interval before escalating,
// not something that needs to be tuned separately.
//
// Started and stopped from server.js's own lifecycle, alongside the database
// pool — see the shutdown handler there.
// ============================================================================

import { findAlertsDueForEscalation } from './records.js';
import { advanceFanout } from './fanout.js';
import { config } from '../../shared/config/env.js';

const SWEEP_INTERVAL_MS = 60_000;

let intervalHandle = null;

async function sweep() {
  const alertIds = await findAlertsDueForEscalation(config.escalationIntervalMinutes);
  for (const alertId of alertIds) {
    // One alert failing to escalate must not stop the rest from being tried.
    await advanceFanout(alertId).catch((err) =>
      console.error(`Escalation failed for alert ${alertId}:`, err)
    );
  }
}

export function startEscalationScheduler() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    sweep().catch((err) => console.error('Escalation sweep failed:', err));
  }, SWEEP_INTERVAL_MS);
}

export function stopEscalationScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
