// ============================================================================
// PostgreSQL connection pool
//
// One pool for the whole process, shared by the emergency and caregiver
// modules. A pool, not a single connection: opening a TCP connection and
// authenticating costs several round trips, and doing that per request would
// dominate the response time of every endpoint.
// ============================================================================

import pg from 'pg';
import { config } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10, // ceiling on simultaneous connections; PostgreSQL defaults to 100 total
  idleTimeoutMillis: 30_000, // release connections the app has stopped using
  connectionTimeoutMillis: 5_000, // fail fast if the database is unreachable
});

// A backend connection can die while sitting idle in the pool — database
// restart, network drop. Without a listener, node-pg emits this on the pool as
// an unhandled 'error' event, which terminates the process.
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err.message);
});

/**
 * Runs a query against the pool.
 * Wrapping pool.query keeps `pg` imported in exactly one file, so swapping or
 * instrumenting the driver later touches only this module.
 */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Confirms the database is reachable and answering.
 * SELECT 1 is deliberately trivial: it proves the connection, authentication
 * and the database being online without depending on any table existing.
 */
export async function checkConnection() {
  const started = Date.now();
  const result = await pool.query(
    'SELECT 1 AS ok, current_database() AS database, version() AS version'
  );
  const row = result.rows[0];

  return {
    database: row.database,
    // e.g. "PostgreSQL 18.4 on x86_64-windows, compiled by ..." — first two words are enough
    serverVersion: row.version.split(' ').slice(0, 2).join(' '),
    latencyMs: Date.now() - started,
  };
}

/** Closes every connection in the pool. Called during shutdown. */
export function closePool() {
  return pool.end();
}
