// ============================================================================
// Mock Disaster Alert Provider
//
// Simulates an external disaster warning feed (e.g. IMD / NDMA).
// Seeds demo alerts directly into the PostgreSQL `disaster_alerts` table.
// Isolated behind the service layer so replacing this with a real disaster API
// in the future requires zero changes to frontend screens or database schemas.
// ============================================================================

import { query } from '../../shared/db/pool.js';

const DEMO_DISASTER_ALERTS = [
  {
    externalId: 'MOCK-DIS-001',
    title: 'Severe Flood Warning',
    description:
      'Heavy rainfall has led to severe waterlogging and flash flood risks in low-lying areas. Stay indoors, avoid underpasses, and move to higher ground if instructed by emergency personnel.',
    disasterType: 'flood',
    severity: 'critical',
    areaName: 'Hyderabad Central',
    source: 'IMD / Disaster Relief Feed (Mock)',
    issuedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(), // 25 mins ago
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), // 24h later
  },
  {
    externalId: 'MOCK-DIS-002',
    title: 'Heavy Rain Advisory',
    description:
      'Continuous heavy downpours accompanied by squally winds (40-50 km/h) are expected. Public transport may experience delays. Keep emergency battery backups charged.',
    disasterType: 'rain',
    severity: 'high',
    areaName: 'Cyberabad / Gachibowli',
    source: 'IMD / Disaster Relief Feed (Mock)',
    issuedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // 2 hrs ago
    expiresAt: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
  },
  {
    externalId: 'MOCK-DIS-003',
    title: 'Extreme Heatwave Warning',
    description:
      'Temperatures projected to exceed 42°C during afternoon hours. High risk of dehydration and heat exhaustion for senior citizens. Remain indoors between 11 AM and 4 PM and consume adequate water.',
    disasterType: 'heatwave',
    severity: 'medium',
    areaName: 'Secunderabad',
    source: 'IMD / Disaster Relief Feed (Mock)',
    issuedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), // 5 hrs ago
    expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
  },
  {
    externalId: 'MOCK-DIS-004',
    title: 'Thunderstorm & Lightning Alert',
    description:
      'Scattered thunderstorms with heavy lightning strikes expected in low-elevation zones. Stay away from tall trees, electrical poles, and metal structures.',
    disasterType: 'thunderstorm',
    severity: 'low',
    areaName: 'Telangana Region',
    source: 'IMD / Disaster Relief Feed (Mock)',
    issuedAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(), // 10 hrs ago
    expiresAt: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
  },
];

/**
 * Ensures the PostgreSQL `disaster_alerts` table has active mock feed items.
 * Inserts missing records using ON CONFLICT DO NOTHING on external_id.
 */
export async function syncMockDisasterFeed() {
  for (const alert of DEMO_DISASTER_ALERTS) {
    await query(
      `INSERT INTO disaster_alerts (
          external_id,
          title,
          description,
          disaster_type,
          severity,
          area_name,
          source,
          issued_at,
          expires_at,
          is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
        ON CONFLICT (external_id) DO NOTHING`,
      [
        alert.externalId,
        alert.title,
        alert.description,
        alert.disasterType,
        alert.severity,
        alert.areaName,
        alert.source,
        alert.issuedAt,
        alert.expiresAt,
      ]
    );
  }
}
