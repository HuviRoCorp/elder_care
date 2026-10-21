// ============================================================================
// One-off cleanup: remove duplicate locations rows sharing (user_id, recorded_at)
//
//   node scripts/dedupe-locations.js          dry run — reports, changes nothing
//   node scripts/dedupe-locations.js --apply  writes the changes
//
// Run from backend/, before adding the locations_user_recorded_at_key unique
// constraint (see schema.sql) — that constraint will reject a schema load
// against a database that still has duplicates.
//
// Within each (user_id, recorded_at) group, keeps the row with the earliest
// created_at (the first successful write) and deletes the rest. Dry run is
// the default because this deletes rows outright.
// ============================================================================

import { query, closePool } from '../shared/db/pool.js';

const apply = process.argv.includes('--apply');

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run against NODE_ENV=production.');
  process.exit(1);
}

const { rows } = await query(
  `SELECT id, user_id, recorded_at, created_at
     FROM locations
    ORDER BY user_id, recorded_at, created_at`
);

const groups = new Map();
for (const row of rows) {
  const key = `${row.user_id}|${row.recorded_at.toISOString()}`;
  groups.set(key, [...(groups.get(key) ?? []), row]);
}

const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
const toDelete = duplicateGroups.flatMap((group) => group.slice(1)); // keep earliest created_at

console.log(`${rows.length} location row(s) examined`);
console.log(`  duplicate groups : ${duplicateGroups.length}`);
console.log(`  rows to delete   : ${toDelete.length}\n`);

for (const group of duplicateGroups) {
  const [keep, ...rest] = group;
  console.log(`  user ${keep.user_id}  recorded_at ${keep.recorded_at.toISOString()}`);
  console.log(`      KEEP   ${keep.id}  created_at ${keep.created_at.toISOString()}`);
  for (const row of rest) {
    console.log(`      DELETE ${row.id}  created_at ${row.created_at.toISOString()}`);
  }
}

if (!apply) {
  console.log('\nDry run. Re-run with --apply to delete these rows.');
  await closePool();
  process.exit(0);
}

if (toDelete.length === 0) {
  console.log('\nNothing to delete.');
  await closePool();
  process.exit(0);
}

await query('BEGIN');
try {
  for (const row of toDelete) {
    await query('DELETE FROM locations WHERE id = $1', [row.id]);
  }
  await query('COMMIT');
  console.log(`\nDone. ${toDelete.length} row(s) deleted.`);
} catch (err) {
  await query('ROLLBACK');
  console.error(`\nRolled back, nothing deleted: ${err.message}`);
  process.exitCode = 1;
}

await closePool();
