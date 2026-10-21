// ============================================================================
// One-off migration: bring existing emergency_contacts.phone values into E.164
//
//   node scripts/normalize-contact-phones.js          dry run — reports, changes nothing
//   node scripts/normalize-contact-phones.js --apply  writes the changes
//
// Run from backend/. Needed once per database that has emergency_contacts
// rows predating normalizePhone being applied in emergency/validate.js's
// validateCreateContactBody/validateUpdateContactBody (see BUILD_LOG.md,
// "emergency_contacts.phone not normalised") — every row written after that
// change, and every row the seed script writes, is already canonical.
//
// Dry run is the default, same reasoning as normalize-phones.js: this
// rewrites a column a unique constraint depends on.
//
// Collision scope differs from normalize-phones.js: uq_contact_per_user is
// UNIQUE (user_id, phone), not phone alone — two different elderly users'
// contact lists sharing a normalised number (the same family doctor, say) is
// normal and not a collision. Only a clash within the same user_id's own
// list is one.
// ============================================================================

import { query, closePool } from '../shared/db/pool.js';
import { normalizePhone } from '../shared/phone.js';

const apply = process.argv.includes('--apply');

const { rows } = await query(
  `SELECT id, user_id, phone, full_name FROM emergency_contacts ORDER BY user_id, created_at`
);

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

// Same reasoning as normalize-phones.js's collision check, scoped to
// (user_id, phone) instead of phone alone — see the file header.
const destinations = new Map();
for (const row of [...unchanged, ...changes]) {
  const value = row.normalized ?? row.phone;
  const key = `${row.user_id}|${value}`;
  destinations.set(key, [...(destinations.get(key) ?? []), row]);
}
const collisions = [...destinations.entries()].filter(([, group]) => group.length > 1);

console.log(`${rows.length} emergency_contacts row(s) examined\n`);
console.log(`  already canonical : ${unchanged.length}`);
console.log(`  to be rewritten   : ${changes.length}`);
console.log(`  cannot normalise  : ${failures.length}`);
console.log(`  collisions        : ${collisions.length}\n`);

for (const row of changes) {
  console.log(`  ${row.phone}  ->  ${row.normalized}   (${row.full_name}, user ${row.user_id})`);
}
for (const row of failures) {
  console.log(`  SKIPPED ${row.phone}   (${row.full_name}, user ${row.user_id}) — ${row.reason}`);
}
for (const [key, group] of collisions) {
  const [userId, value] = key.split('|');
  console.log(`  COLLISION on ${value} within user ${userId}:`);
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

// One transaction: a half-migrated table would leave some contacts matchable
// against a linked user's phone (see family/routes.js's findContactByPhone)
// and others not, depending only on which row happened to update first.
await query('BEGIN');
try {
  for (const row of changes) {
    await query(`UPDATE emergency_contacts SET phone = $2 WHERE id = $1`, [row.id, row.normalized]);
  }
  await query('COMMIT');
  console.log(`\nDone. ${changes.length} row(s) updated.`);
} catch (err) {
  await query('ROLLBACK');
  console.error(`\nRolled back, nothing written: ${err.message}`);
  process.exitCode = 1;
}

await closePool();
