// ============================================================================
// End-to-End Caregiver Flow Test (Team B: Phase 2 & Phase 4)
// ============================================================================

import http from 'http';
import { app } from '../app.js';
import { query, closePool } from '../shared/db/pool.js';
import { hashPassword } from '../shared/auth/password.js';
import { normalizePhone } from '../shared/phone.js';

const TEST_PASSWORD = 'TestPassword123!';

const USERS = {
  elderly: { phone: '9000000001', fullName: 'Elderly User', role: 'elderly' },
  family: { phone: '9000000002', fullName: 'Family Member', role: 'family' },
  caregiver: { phone: '9000000003', fullName: 'Professional Caregiver', role: 'caregiver' },
  admin: { phone: '9000000004', fullName: 'System Admin', role: 'admin' },
};

let server;
let baseUrl;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: response.status, data: json };
}

async function run() {
  console.log('--- 1. Seeding Users for Team B Test ---');
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const seeded = {};
  for (const [key, user] of Object.entries(USERS)) {
    const norm = normalizePhone(user.phone).value;
    const { rows } = await query(
      `INSERT INTO users (phone, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone) DO UPDATE
          SET password_hash = EXCLUDED.password_hash,
              full_name     = EXCLUDED.full_name,
              role          = EXCLUDED.role,
              is_active     = TRUE
       RETURNING id, phone, role`,
      [norm, passwordHash, user.fullName, user.role]
    );
    seeded[key] = rows[0];
  }

  // Clean up any previous test runs for these test users so the test can be re-run indefinitely
  await query(`DELETE FROM caregiver_bookings WHERE elderly_user_id = $1`, [seeded.elderly.id]);
  await query(`DELETE FROM care_plans WHERE elderly_user_id = $1`, [seeded.elderly.id]);
  await query(`DELETE FROM tasks WHERE elderly_user_id = $1`, [seeded.elderly.id]);
  await query(`DELETE FROM activity_reports WHERE elderly_user_id = $1`, [seeded.elderly.id]);
  await query(`DELETE FROM reviews WHERE reviewer_user_id = $1`, [seeded.family.id]);
  await query(`UPDATE caregivers SET average_rating = 0, total_reviews = 0 WHERE user_id = $1`, [seeded.caregiver.id]);

  // Link family to elderly in family_links
  await query(
    `INSERT INTO family_links (elderly_user_id, family_user_id, relationship, status)
     VALUES ($1, $2, 'child', 'active')
     ON CONFLICT (elderly_user_id, family_user_id) DO UPDATE SET status = 'active'`,
    [seeded.elderly.id, seeded.family.id]
  );

  // Start test server on random port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`Test server running at ${baseUrl}`);
      resolve();
    });
  });

  console.log('\n--- 2. Logging in all 4 roles ---');
  const tokens = {};
  for (const [key, user] of Object.entries(USERS)) {
    const res = await request('/auth/login', {
      method: 'POST',
      body: { phone: user.phone, password: TEST_PASSWORD },
    });
    if (res.status !== 200 || !res.data.accessToken) {
      throw new Error(`Login failed for ${key}: ${JSON.stringify(res.data)}`);
    }
    tokens[key] = res.data.accessToken;
    console.log(`  ✓ Logged in as ${key} (${user.role})`);
  }

  console.log('\n--- 3. Phase 2: Caregiver sets up profile ---');
  const profileRes = await request('/caregiver/profile', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.caregiver}` },
    body: {
      bio: 'Experienced in dementia and post-op care for seniors.',
      experienceYears: 7,
      qualifications: 'Certified Geriatric Nursing Assistant (CGNA)',
      specializations: ['Dementia Care', 'Mobility Support', 'Medication Management'],
      languages: ['English', 'Hindi', 'Telugu'],
      hourlyRate: 350.0,
      currency: 'INR',
      serviceAreaCity: 'Bangalore',
      idProofType: 'Aadhaar Card',
      isAvailable: true,
    },
  });
  if (profileRes.status !== 200) {
    throw new Error(`Profile setup failed: ${JSON.stringify(profileRes.data)}`);
  }
  const caregiverId = profileRes.data.caregiver.id;
  console.log(`  ✓ Profile created. Caregiver ID: ${caregiverId}`);

  console.log('\n--- 4. Admin verifies caregiver ---');
  const verifyRes = await request(`/caregiver/${caregiverId}/verification`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokens.admin}` },
    body: { verificationStatus: 'verified' },
  });
  if (verifyRes.status !== 200 || !verifyRes.data.caregiver.idVerified) {
    throw new Error(`Verification failed: ${JSON.stringify(verifyRes.data)}`);
  }
  console.log(`  ✓ Caregiver verified by Admin.`);

  console.log('\n--- 5. Family searches for caregivers in Bangalore ---');
  const searchRes = await request('/caregiver/search?city=Bangalore', {
    headers: { Authorization: `Bearer ${tokens.family}` },
  });
  if (searchRes.status !== 200 || searchRes.data.caregivers.length === 0) {
    throw new Error(`Search failed: ${JSON.stringify(searchRes.data)}`);
  }
  console.log(`  ✓ Search returned ${searchRes.data.caregivers.length} verified caregiver(s).`);

  console.log('\n--- 6. Family books caregiver for elderly user ---');
  const bookingRes = await request('/caregiver/bookings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.family}` },
    body: {
      elderlyUserId: seeded.elderly.id,
      caregiverId,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      recurrence: 'daily',
      hoursPerVisit: 4,
      agreedRate: 350,
      specialInstructions: 'Please assist with morning physiotherapy and blood pressure monitoring.',
    },
  });
  if (bookingRes.status !== 201) {
    throw new Error(`Booking creation failed: ${JSON.stringify(bookingRes.data)}`);
  }
  const bookingId = bookingRes.data.booking.id;
  console.log(`  ✓ Booking created. ID: ${bookingId} (status: ${bookingRes.data.booking.status})`);

  console.log('\n--- 7. Caregiver confirms the booking ---');
  const confirmRes = await request(`/caregiver/bookings/${bookingId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokens.caregiver}` },
    body: { status: 'confirmed' },
  });
  if (confirmRes.status !== 200 || confirmRes.data.booking.status !== 'confirmed') {
    throw new Error(`Booking confirmation failed: ${JSON.stringify(confirmRes.data)}`);
  }
  console.log(`  ✓ Booking confirmed by caregiver.`);

  console.log('\n--- 8. Create a scheduled visit slot ---');
  const scheduleRes = await request('/caregiver/schedules', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.caregiver}` },
    body: {
      bookingId,
      caregiverId,
      elderlyUserId: seeded.elderly.id,
      visitDate: '2026-09-01',
      startTime: '09:00:00',
      endTime: '13:00:00',
      notes: 'Morning shift with mobility exercises.',
    },
  });
  if (scheduleRes.status !== 201) {
    throw new Error(`Schedule creation failed: ${JSON.stringify(scheduleRes.data)}`);
  }
  const scheduleId = scheduleRes.data.schedule.id;
  console.log(`  ✓ Schedule slot created. ID: ${scheduleId}`);

  console.log('\n--- 9. Caregiver GPS Check-in ---');
  const checkInRes = await request(`/caregiver/attendance/schedules/${scheduleId}/check-in`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.caregiver}` },
    body: {
      latitude: 12.9716,
      longitude: 77.5946,
      notes: 'Arrived at elder home on time.',
    },
  });
  if (checkInRes.status !== 200 || checkInRes.data.attendance.status !== 'checked_in') {
    throw new Error(`Check-in failed: ${JSON.stringify(checkInRes.data)}`);
  }
  const attendanceId = checkInRes.data.attendance.id;
  console.log(`  ✓ Checked in. Status: ${checkInRes.data.attendance.status}`);

  console.log('\n--- 10. Caregiver GPS Check-out ---');
  const checkOutRes = await request(`/caregiver/attendance/schedules/${scheduleId}/check-out`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.caregiver}` },
    body: {
      latitude: 12.9718,
      longitude: 77.5948,
      notes: 'Completed morning routine and physiotherapy.',
    },
  });
  if (checkOutRes.status !== 200 || checkOutRes.data.attendance.status !== 'checked_out') {
    throw new Error(`Check-out failed: ${JSON.stringify(checkOutRes.data)}`);
  }
  console.log(`  ✓ Checked out. Status: ${checkOutRes.data.attendance.status}, Duration: ${checkOutRes.data.attendance.durationMinutes} mins`);

  console.log('\n--- 11. Family verifies attendance ---');
  const verifyAttRes = await request(`/caregiver/attendance/${attendanceId}/verify`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokens.family}` },
  });
  if (verifyAttRes.status !== 200 || !verifyAttRes.data.attendance.verifiedByFamily) {
    throw new Error(`Attendance verification failed: ${JSON.stringify(verifyAttRes.data)}`);
  }
  console.log(`  ✓ Attendance verified by family.`);

  console.log('\n--- 12. Phase 4: Family creates Care Plan ---');
  const carePlanRes = await request('/caregiver/care-plans', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.family}` },
    body: {
      elderlyUserId: seeded.elderly.id,
      title: 'Hypertension & Mobility Care Plan',
      description: 'Comprehensive care plan focusing on blood pressure regulation and morning walks.',
      medicalConditions: 'Stage 1 Hypertension, mild osteoarthritis in left knee.',
      allergies: 'Penicillin, Peanuts',
      medications: 'Amlodipine 5mg at 8:00 AM, Calcium + D3 supplement at 1:00 PM',
      dietaryNotes: 'Low sodium diet, warm water throughout the day.',
      mobilityNotes: 'Assistance needed when getting up from low chairs.',
      emergencyInstructions: 'Contact Dr. Sharma at Apollo Hospital or trigger SOS immediately if BP exceeds 160/100.',
      startDate: '2026-09-01',
    },
  });
  if (carePlanRes.status !== 201) {
    throw new Error(`Care plan creation failed: ${JSON.stringify(carePlanRes.data)}`);
  }
  const carePlanId = carePlanRes.data.carePlan.id;
  console.log(`  ✓ Care plan created. ID: ${carePlanId}`);

  console.log('\n--- 13. Family assigns Task to Caregiver ---');
  const taskRes = await request('/caregiver/tasks', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.family}` },
    body: {
      carePlanId,
      elderlyUserId: seeded.elderly.id,
      assignedToCaregiverId: caregiverId,
      scheduleId,
      title: 'Morning Blood Pressure Check',
      description: 'Measure and record systolic/diastolic BP and pulse before breakfast.',
      category: 'Health Monitoring',
      priority: 'high',
      dueDate: '2026-09-01',
      dueTime: '09:30:00',
    },
  });
  if (taskRes.status !== 201) {
    throw new Error(`Task creation failed: ${JSON.stringify(taskRes.data)}`);
  }
  const taskId = taskRes.data.task.id;
  console.log(`  ✓ Task assigned. ID: ${taskId}`);

  console.log('\n--- 14. Caregiver completes the Task ---');
  const taskCompleteRes = await request(`/caregiver/tasks/${taskId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokens.caregiver}` },
    body: {
      status: 'completed',
      completionNotes: 'BP recorded at 122/80 mmHg, pulse 74 bpm. Normal resting vitals.',
    },
  });
  if (taskCompleteRes.status !== 200 || taskCompleteRes.data.task.status !== 'completed') {
    throw new Error(`Task completion failed: ${JSON.stringify(taskCompleteRes.data)}`);
  }
  console.log(`  ✓ Task completed. Status: ${taskCompleteRes.data.task.status}`);

  console.log('\n--- 15. Caregiver submits Daily Activity Report ---');
  const reportRes = await request('/caregiver/reports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.caregiver}` },
    body: {
      scheduleId,
      caregiverId,
      elderlyUserId: seeded.elderly.id,
      carePlanId,
      reportDate: '2026-09-01',
      summary: 'Pleasant morning. Completed 20 min walk in the garden, had healthy breakfast, vitals stable.',
      mealsTaken: 'Oatmeal with almonds, 1 boiled egg, green tea.',
      medicationsGiven: 'Amlodipine 5mg given at 8:00 AM after breakfast.',
      mood: 'Happy and energetic',
      sleepHours: 7.5,
      vitals: { bloodPressure: '122/80', pulse: 74, temperature: '98.4 F', spO2: 98 },
      concerns: 'Mild knee stiffness early morning, improved after gentle stretching.',
      photoUrls: ['https://example.com/photos/activity-walk.jpg'],
    },
  });
  if (reportRes.status !== 201) {
    throw new Error(`Report submission failed: ${JSON.stringify(reportRes.data)}`);
  }
  console.log(`  ✓ Activity report submitted. ID: ${reportRes.data.report.id}`);

  console.log('\n--- 15b. Caregiver Marks Booking as Completed ---');
  const completeBookingRes = await request(`/caregiver/bookings/${bookingId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokens.caregiver}` },
    body: { status: 'completed' },
  });
  if (completeBookingRes.status !== 200 || completeBookingRes.data.booking.status !== 'completed') {
    throw new Error(`Completing booking failed: ${JSON.stringify(completeBookingRes.data)}`);
  }
  console.log('  ✓ Booking marked as completed.');

  console.log('\n--- 16. Family submits a 5-Star Review ---');
  const reviewRes = await request('/caregiver/reviews', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.family}` },
    body: {
      caregiverId,
      bookingId,
      elderlyUserId: seeded.elderly.id,
      rating: 5,
      punctualityRating: 5,
      careQualityRating: 5,
      communicationRating: 5,
      comment: 'Exceptional caregiver! Very patient, punctual, and attentive to my father’s daily routine.',
    },
  });
  if (reviewRes.status !== 201) {
    throw new Error(`Review submission failed: ${JSON.stringify(reviewRes.data)}`);
  }
  console.log(`  ✓ Review created. Rating: 5/5`);

  console.log('\n--- 17. Verify Recalculated Caregiver Rating ---');
  const updatedCgRes = await request(`/caregiver/${caregiverId}`, {
    headers: { Authorization: `Bearer ${tokens.family}` },
  });
  if (updatedCgRes.status !== 200 || updatedCgRes.data.caregiver.averageRating !== 5 || updatedCgRes.data.caregiver.totalReviews !== 1) {
    throw new Error(`Caregiver rating recalculation verification failed: ${JSON.stringify(updatedCgRes.data)}`);
  }
  console.log(`  ✓ Caregiver average rating updated to: ${updatedCgRes.data.caregiver.averageRating} (${updatedCgRes.data.caregiver.totalReviews} review)`);

  console.log('\n========================================');
  console.log('🎉 ALL TEAM B END-TO-END TESTS PASSED!');
  console.log('========================================\n');
}

try {
  await run();
} catch (err) {
  console.error('\n❌ Test execution failed:', err);
  process.exitCode = 1;
} finally {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closePool();
}
