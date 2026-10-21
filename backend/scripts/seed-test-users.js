// ============================================================================
// Development seed: one test account per role
//
//   node scripts/seed-test-users.js <password>
//
// Run from backend/. Creates four accounts — elderly, family, caregiver and
// admin — all sharing the password you pass in. They exist so the mobile app's
// role-based routing can be exercised: sign in as each and confirm you land on
// a different home screen.
//
// The password is an argument rather than a constant in this file, so no
// working credential is ever committed. Re-running with a different password
// updates the existing accounts instead of failing.
//
// The accounts carry no email address, which also exercises the phone-only
// registration path.
//
// Why this writes to the database directly instead of calling POST
// /auth/register: 'admin' cannot be self-assigned through the API, deliberately
// — a public endpoint that grants admin is a privilege-escalation hole. Seeding
// through the API would mean creating three accounts and then reaching into
// SQL for the fourth anyway. It uses the same hashPassword and normalizePhone
// the API uses, so the rows are identical to registered ones.
// ============================================================================

import { config } from '../shared/config/env.js';
import { query, closePool } from '../shared/db/pool.js';
import { hashPassword } from '../shared/auth/password.js';
import { normalizePhone } from '../shared/phone.js';
import { PASSWORD_MIN_LENGTH } from '../shared/auth/validate.js';

// Test numbers are valid 10-digit Indian mobile numbers so they survive
// normalisation unchanged, and are obviously sequential so nobody mistakes one
// for a real person's.
const TEST_USERS = [
  { phone: '9000000001', fullName: 'Test Elderly', role: 'elderly' },
  { phone: '9000000002', fullName: 'Test Family', role: 'family' },
  { phone: '9000000003', fullName: 'Test Caregiver', role: 'caregiver' },
  { phone: '9000000004', fullName: 'Test Admin', role: 'admin' },
  { phone: '9000000005', fullName: 'Test Caregiver Pending', role: 'caregiver' },
];

// A verified profile makes /caregiver/search return something; a pending one
// makes the admin verification queue (GET /caregiver/verification-queue)
// return something. Without both, one of those two screens is empty in a
// fresh install and looks broken even though it works.
const TEST_CAREGIVER_PROFILES = [
  {
    phone: '9000000003',
    serviceAreaCity: 'Bengaluru',
    hourlyRate: 250,
    specializations: ['elderly_care', 'dementia_care'],
    languages: ['English', 'Hindi', 'Kannada'],
    experienceYears: 5,
    qualifications: 'Certified Nursing Assistant',
    verificationStatus: 'verified',
  },
  {
    phone: '9000000005',
    serviceAreaCity: 'Bengaluru',
    hourlyRate: 200,
    specializations: ['post_surgery_care'],
    languages: ['English', 'Tamil'],
    experienceYears: 2,
    qualifications: 'Home Health Aide',
    verificationStatus: 'pending',
  },
];

// POST /family/invites now exists, but going through invite-then-accept here
// would just be two more upsert-shaped round trips for the same deterministic
// result this script already produces directly. Written straight to 'active'
// so the seeded family account can exercise every gated action immediately,
// with no invite left pending for someone to accept by hand first.
const TEST_FAMILY_LINK = { elderlyPhone: '9000000001', familyPhone: '9000000002' };

// Accepting a family invite now auto-creates one of these (see
// backend/family/contactSync.js), but there is still no endpoint to manage
// emergency_contacts by hand — add/edit/remove/reorder remains unbuilt (see
// API.md, "Not yet built"), so seeding still writes the row directly. Two
// contacts, deliberately different:
// #1 is also the seeded family account, so fanout has a real contact_user_id
// to find a device token for once one is registered — the only way to
// exercise the push channel without a third real phone. #2 has no
// contact_user_id at all, so escalating past #1 is actually testable, and
// gives the email/SMS "not configured" failure path something to record
// against a destination that isn't also a real app account.
const TEST_EMERGENCY_CONTACTS = [
  { elderlyPhone: '9000000001', fullName: 'Test Family', contactPhone: '9000000002', contactUserPhone: '9000000002', email: null, priority: 1 },
  { elderlyPhone: '9000000001', fullName: 'Test Neighbour', contactPhone: '9000000099', contactUserPhone: null, email: 'neighbour@example.test', priority: 2 },
];

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/seed-test-users.js <password>');
  console.error(`The password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  process.exit(1);
}

if (password.length < PASSWORD_MIN_LENGTH) {
  console.error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  process.exit(1);
}

// These are known-password accounts. Creating them anywhere real would be
// handing out four working logins, one of them an administrator.
if (config.nodeEnv === 'production') {
  console.error('Refusing to run with NODE_ENV=production. This script is for development databases only.');
  process.exit(1);
}

const passwordHash = await hashPassword(password);

console.log(`Seeding ${TEST_USERS.length} test accounts into ${config.databaseUrl.replace(/:[^:@]*@/, ':****@')}\n`);

const idByPhone = {};

for (const user of TEST_USERS) {
  const normalized = normalizePhone(user.phone);

  if (!normalized.ok) {
    console.error(`  ${user.phone}  SKIPPED — ${normalized.reason}`);
    process.exitCode = 1;
    continue;
  }

  // Upsert on phone: re-running the script resets the password and the role
  // rather than colliding with the UNIQUE constraint.
  const { rows } = await query(
    `INSERT INTO users (phone, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (phone) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            full_name     = EXCLUDED.full_name,
            role          = EXCLUDED.role,
            is_active     = TRUE
     RETURNING id, phone, role, (xmax = 0) AS inserted`,
    [normalized.value, passwordHash, user.fullName, user.role]
  );

  const row = rows[0];
  idByPhone[user.phone] = row.id;
  console.log(`  ${row.phone.padEnd(15)} ${row.role.padEnd(10)} ${row.inserted ? 'created' : 'updated'}`);
}

const adminId = idByPhone[TEST_USERS.find((u) => u.role === 'admin').phone];

for (const profile of TEST_CAREGIVER_PROFILES) {
  const userId = idByPhone[profile.phone];
  if (!userId) {
    console.error(`  caregiver_profile SKIPPED — ${profile.phone}`);
    process.exitCode = 1;
    continue;
  }

  const isVerified = profile.verificationStatus === 'verified';

  // Upsert on user_id, same conflict target upsertCaregiverProfile uses.
  const { rows } = await query(
    `INSERT INTO caregivers (
        user_id, service_area_city, hourly_rate, specializations, languages,
        experience_years, qualifications, verification_status, id_verified,
        verified_at, verified_by
     ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::verification_status, $9,
        CASE WHEN $9 = TRUE THEN now() ELSE NULL END,
        CASE WHEN $9 = TRUE THEN $10::uuid ELSE NULL END
     )
     ON CONFLICT (user_id) DO UPDATE
        SET service_area_city   = EXCLUDED.service_area_city,
            hourly_rate         = EXCLUDED.hourly_rate,
            specializations     = EXCLUDED.specializations,
            languages           = EXCLUDED.languages,
            experience_years    = EXCLUDED.experience_years,
            qualifications      = EXCLUDED.qualifications,
            verification_status = EXCLUDED.verification_status,
            id_verified         = EXCLUDED.id_verified,
            verified_at         = EXCLUDED.verified_at,
            verified_by         = EXCLUDED.verified_by
     RETURNING id, (xmax = 0) AS inserted`,
    [
      userId,
      profile.serviceAreaCity,
      profile.hourlyRate,
      profile.specializations,
      profile.languages,
      profile.experienceYears,
      profile.qualifications,
      profile.verificationStatus,
      isVerified,
      adminId,
    ]
  );

  const row = rows[0];
  console.log(`  caregiver_profile  ${profile.phone.padEnd(15)} ${profile.verificationStatus.padEnd(10)} ${row.inserted ? 'created' : 'updated'}`);
}

const elderlyId = idByPhone[TEST_FAMILY_LINK.elderlyPhone];
const familyId = idByPhone[TEST_FAMILY_LINK.familyPhone];

if (elderlyId && familyId) {
  // Upsert on (elderly_user_id, family_user_id): re-running resets the
  // permissions and status rather than colliding with the UNIQUE constraint.
  const { rows } = await query(
    `INSERT INTO family_links
       (elderly_user_id, family_user_id, permission_level, status,
        can_view_location, can_manage_contacts, can_manage_caregivers, can_acknowledge_alerts,
        approved_at)
     VALUES ($1, $2, 'owner', 'active', TRUE, TRUE, TRUE, TRUE, now())
     ON CONFLICT (elderly_user_id, family_user_id) DO UPDATE
        SET permission_level       = EXCLUDED.permission_level,
            status                 = EXCLUDED.status,
            can_view_location      = EXCLUDED.can_view_location,
            can_manage_contacts    = EXCLUDED.can_manage_contacts,
            can_manage_caregivers  = EXCLUDED.can_manage_caregivers,
            can_acknowledge_alerts = EXCLUDED.can_acknowledge_alerts,
            approved_at            = EXCLUDED.approved_at
     RETURNING id, (xmax = 0) AS inserted`,
    [elderlyId, familyId]
  );

  const link = rows[0];
  console.log(`  family_link     ${TEST_FAMILY_LINK.familyPhone} -> ${TEST_FAMILY_LINK.elderlyPhone}  ${link.inserted ? 'created' : 'updated'}`);
} else {
  console.error('  family_link     SKIPPED — one or both test users were not seeded');
  process.exitCode = 1;
}

for (const contact of TEST_EMERGENCY_CONTACTS) {
  const elderlyContactId = idByPhone[contact.elderlyPhone];
  const contactPhone = normalizePhone(contact.contactPhone);
  const contactUserId = contact.contactUserPhone ? idByPhone[contact.contactUserPhone] : null;

  if (!elderlyContactId || !contactPhone.ok) {
    console.error(`  emergency_contact SKIPPED — ${contact.fullName}`);
    process.exitCode = 1;
    continue;
  }

  // Upsert on (user_id, phone), the same UNIQUE constraint the table already has.
  const { rows } = await query(
    `INSERT INTO emergency_contacts
       (user_id, contact_user_id, full_name, phone, email, priority,
        notify_by_sms, notify_by_call, notify_by_push, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, TRUE, TRUE)
     ON CONFLICT (user_id, phone) DO UPDATE
        SET contact_user_id = EXCLUDED.contact_user_id,
            full_name       = EXCLUDED.full_name,
            email           = EXCLUDED.email,
            priority        = EXCLUDED.priority,
            notify_by_sms   = EXCLUDED.notify_by_sms,
            notify_by_call  = EXCLUDED.notify_by_call,
            notify_by_push  = EXCLUDED.notify_by_push,
            is_active       = TRUE
     RETURNING id, (xmax = 0) AS inserted`,
    [elderlyContactId, contactUserId, contact.fullName, contactPhone.value, contact.email, contact.priority]
  );

  const row = rows[0];
  console.log(`  emergency_contact  priority ${contact.priority}  ${contact.fullName.padEnd(14)} ${row.inserted ? 'created' : 'updated'}`);
}

console.log('\nSign in with any of the numbers above and the password you passed.');
console.log('The app normalises nothing — type the number in any format you like.');

await closePool();
