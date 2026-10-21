// ============================================================================
// Caregiver Profile & Search Service
// ============================================================================

import { query } from '../../shared/db/pool.js';
import { notFound } from '../../shared/http/errors.js';

export function toCaregiverResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    profilePhotoUrl: row.profile_photo_url,
    bio: row.bio,
    experienceYears: row.experience_years,
    qualifications: row.qualifications,
    specializations: row.specializations || [],
    languages: row.languages || [],
    hourlyRate: row.hourly_rate ? parseFloat(row.hourly_rate) : null,
    currency: row.currency,
    serviceAreaCity: row.service_area_city,
    idProofType: row.id_proof_type,
    idVerified: row.id_verified,
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    isAvailable: row.is_available,
    averageRating: row.average_rating ? parseFloat(row.average_rating) : 0,
    totalReviews: row.total_reviews,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertCaregiverProfile(userId, profile) {
  const {
    bio,
    experienceYears,
    qualifications,
    specializations,
    languages,
    hourlyRate,
    currency,
    serviceAreaCity,
    idProofType,
    isAvailable,
  } = profile;

  const { rows } = await query(
    `INSERT INTO caregivers (
        user_id, bio, experience_years, qualifications, specializations,
        languages, hourly_rate, currency, service_area_city, id_proof_type, is_available
     ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, TRUE)
     )
     ON CONFLICT (user_id) DO UPDATE SET
        bio                = COALESCE(EXCLUDED.bio, caregivers.bio),
        experience_years   = COALESCE(EXCLUDED.experience_years, caregivers.experience_years),
        qualifications     = COALESCE(EXCLUDED.qualifications, caregivers.qualifications),
        specializations    = COALESCE(EXCLUDED.specializations, caregivers.specializations),
        languages          = COALESCE(EXCLUDED.languages, caregivers.languages),
        hourly_rate        = COALESCE(EXCLUDED.hourly_rate, caregivers.hourly_rate),
        currency           = COALESCE(EXCLUDED.currency, caregivers.currency),
        service_area_city  = COALESCE(EXCLUDED.service_area_city, caregivers.service_area_city),
        id_proof_type      = COALESCE(EXCLUDED.id_proof_type, caregivers.id_proof_type),
        is_available       = COALESCE($11, caregivers.is_available)
     RETURNING *`,
    [
      userId,
      bio ?? null,
      experienceYears ?? null,
      qualifications ?? null,
      specializations ?? null,
      languages ?? null,
      hourlyRate ?? null,
      currency ?? 'INR',
      serviceAreaCity ?? null,
      idProofType ?? null,
      isAvailable ?? null,
    ]
  );

  return findCaregiverById(rows[0].id);
}

export async function findCaregiverByUserId(userId) {
  const { rows } = await query(
    `SELECT c.*, u.full_name, u.email, u.phone, u.profile_photo_url
       FROM caregivers c
       JOIN users u ON u.id = c.user_id
      WHERE c.user_id = $1`,
    [userId]
  );
  return rows[0] ? toCaregiverResponse(rows[0]) : null;
}

export async function findCaregiverById(id) {
  const { rows } = await query(
    `SELECT c.*, u.full_name, u.email, u.phone, u.profile_photo_url
       FROM caregivers c
       JOIN users u ON u.id = c.user_id
      WHERE c.id = $1`,
    [id]
  );
  if (!rows[0]) {
    throw notFound('caregiver_not_found', 'Caregiver profile does not exist.');
  }
  return toCaregiverResponse(rows[0]);
}

export async function searchCaregivers({
  city,
  language,
  specialization,
  minRating,
  verifiedOnly = true,
  availableOnly = true,
  page = 1,
  limit = 20,
}) {
  const conditions = ['u.is_active = TRUE'];
  const params = [];

  if (verifiedOnly) {
    conditions.push(`c.verification_status = 'verified'`);
  }
  if (availableOnly) {
    conditions.push(`c.is_available = TRUE`);
  }
  if (city) {
    params.push(`%${city.toLowerCase()}%`);
    conditions.push(`LOWER(c.service_area_city) LIKE $${params.length}`);
  }
  if (language) {
    params.push(language.toLowerCase());
    conditions.push(`EXISTS (SELECT 1 FROM unnest(c.languages) l WHERE LOWER(l) = $${params.length})`);
  }
  if (specialization) {
    params.push(specialization.toLowerCase());
    conditions.push(`EXISTS (SELECT 1 FROM unnest(c.specializations) s WHERE LOWER(s) = $${params.length})`);
  }
  if (minRating) {
    params.push(parseFloat(minRating));
    conditions.push(`c.average_rating >= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (Math.max(1, page) - 1) * Math.max(1, limit);

  const countQuery = `
    SELECT COUNT(*) AS total
      FROM caregivers c
      JOIN users u ON u.id = c.user_id
    ${whereClause}
  `;
  const { rows: countRows } = await query(countQuery, params);
  const total = parseInt(countRows[0]?.total || 0, 10);

  params.push(limit);
  const limitParam = params.length;
  params.push(offset);
  const offsetParam = params.length;

  const dataQuery = `
    SELECT c.*, u.full_name, u.email, u.phone, u.profile_photo_url
      FROM caregivers c
      JOIN users u ON u.id = c.user_id
    ${whereClause}
    ORDER BY c.average_rating DESC, c.total_reviews DESC, c.created_at DESC
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;
  const { rows } = await query(dataQuery, params);

  return {
    total,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    caregivers: rows.map(toCaregiverResponse),
  };
}

export async function listPendingCaregivers() {
  const { rows } = await query(
    `SELECT c.*, u.full_name, u.email, u.phone, u.profile_photo_url
       FROM caregivers c
       JOIN users u ON u.id = c.user_id
      WHERE c.verification_status = 'pending' AND u.is_active = TRUE
      ORDER BY c.created_at ASC`
  );
  return rows.map(toCaregiverResponse);
}

export async function updateCaregiverVerification(caregiverId, status, adminUserId) {
  const isVerified = status === 'verified';
  const { rows } = await query(
    `UPDATE caregivers
        SET verification_status = $1::verification_status,
            id_verified         = $2,
            verified_at         = CASE WHEN $2 = TRUE THEN now() ELSE NULL END,
            verified_by         = CASE WHEN $2 = TRUE THEN $3::uuid ELSE NULL END
      WHERE id = $4
      RETURNING *`,
    [status, isVerified, adminUserId, caregiverId]
  );

  if (!rows[0]) {
    throw notFound('caregiver_not_found', 'Caregiver profile not found.');
  }

  return findCaregiverById(caregiverId);
}
