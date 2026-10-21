// ============================================================================
// One-off migration: bring existing users.phone values into E.164
//
//   node scripts/normalize-phones.js          dry run — reports, changes nothing
//   node scripts/normalize-phones.js --apply  writes the changes
//
// Run from backend/. Needed once per database that has rows predating
// shared/phone.js; every row written after it is already canonical.
//
// Dry run is the default because this rewrites the column every account is
// identified by, and because a collision here means two rows are the same
// person and one of them has to be dealt with by hand.
// ============================================================================

import { query, closePool } from '../shared/db/pool.js';
import { normalizePhone } from '../shared/phone.js';

const apply = process.argv.includes('--apply');

const { rows } = await query(`SELECT id, phone, full_name FROM users ORDER BY created_at`);

const unchanged = [];
const changes = [];
const failures = [];

for (const row of rows) {
  const result = normalizePhone(row.phone);

  if (!result.ok) {
    failures.push({ ...row, reason: result.reason });
  } else if (result.value === row.phone) {
    unchanged.push(row);
  } else {
    changes.push({ ...row, normalized: result.value });
  }
}

// Two rows reducing to one number means the same person registered twice in
// two different formats — exactly the problem this migration exists to stop.
// The UNIQUE constraint would reject the second UPDATE anyway; catching it here
// reports every clash at once instead of failing on whichever row came first.
const destinations = new Map();
for (const row of [...unchanged, ...changes]) {
  const value = row.normalized ?? row.phone;
  destinations.set(value, [...(destinations.get(value) ?? []), row]);
}
const collisions = [...destinations.entries()].filter(([, group]) => group.length > 1);

console.log(`${rows.length} user row(s) examined\n`);
console.log(`  already canonical : ${unchanged.length}`);
console.log(`  to be rewritten   : ${changes.length}`);
console.log(`  cannot normalise  : ${failures.length}`);
console.log(`  collisions        : ${collisions.length}\n`);

for (const row of changes) {
  console.log(`  ${row.phone}  ->  ${row.normalized}   (${row.full_name})`);
}
for (const row of failures) {
  console.log(`  SKIPPED ${row.phone}   (${row.full_name}) — ${row.reason}`);
}
for (const [value, group] of collisions) {
  console.log(`  COLLISION on ${value}:`);
  for (const row of group) console.log(`      ${row.id}  ${row.phone}  (${row.full_name})`);
}

if (collisions.length > 0) {
  console.error('\nAborting: resolve the collisions by hand first. Nothing was written.');
  await closePool();
  process.exit(1);
}

if (!apply) {
  console.log('\nDry run. Re-run with --apply to write these changes.');
  await closePool();
  process.exit(0);
}

if (changes.length === 0) {
  console.log('\nNothing to write.');
  await closePool();
  process.exit(0);
}

// One transaction: a half-migrated table would leave some users unable to log
// in with the format the screens now send.
await query('BEGIN');
try {
  for (const row of changes) {
    await query(`UPDATE users SET phone = $2 WHERE id = $1`, [row.id, row.normalized]);
  }
  await query('COMMIT');
  console.log(`\nDone. ${changes.length} row(s) updated.`);
} catch (err) {
  await query('ROLLBACK');
  console.error(`\nRolled back, nothing written: ${err.message}`);
  process.exitCode = 1;
}

await closePool();
