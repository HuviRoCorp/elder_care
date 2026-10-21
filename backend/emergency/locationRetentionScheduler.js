// ============================================================================
// Location retention scheduler — a plain setInterval, not a cron dependency.
//
// Same choice notifications/scheduler.js already made for the escalation
// sweep, for the same reason: one backend process, no separate infra, no
// horizontal scaling to worry about duplicate runs — a standalone script on
// an OS-level cron only earns its keep when either of those isn't true.
//
// One deliberate difference from that scheduler: this one runs once
// immediately on start, then every SWEEP_INTERVAL_MS after. Escalation
// correctness depends on measuring elapsed time since each alert's own
// trigger, so waiting for the first tick costs nothing there. Retention has
// no such constraint, and waiting up to a full day after every restart
// before ever purging is a real gap in a project that gets restarted often
// during development.
//
// Started and stopped from server.js's own lifecycle, alongside the
// escalation scheduler and the database pool — see the shutdown handler
// there.
// ============================================================================

import { purgeOldLocations } from './locations.js';

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day — retention is date-based, not time-sensitive

let intervalHandle = null;

async function sweep() {
  const deleted = await purgeOldLocations();
  if (deleted > 0) {
    console.log(`Location retention sweep: deleted ${deleted} row(s) older than 30 days.`);
  }
}

export function startLocationRetentionScheduler() {
  if (intervalHandle) return;
  sweep().catch((err) => console.error('Location retention sweep failed:', err));
  intervalHandle = setInterval(() => {
    sweep().catch((err) => console.error('Location retention sweep failed:', err));
  }, SWEEP_INTERVAL_MS);
}

export function stopLocationRetentionScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
