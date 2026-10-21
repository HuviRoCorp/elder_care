// ============================================================================
// Geofence geometry — shared by geofenceCheck.js (breach detection) and
// routes.js's GET /emergency/geofences/:id/history (the recent-activity
// sanity check). Split out so the distance/classify logic exists in exactly
// one place instead of drifting between the two callers.
// ============================================================================

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points, in metres. No PostGIS — matches schema.sql's own choice for `geofences`. */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

export function classify(distanceMeters, radiusMeters) {
  return distanceMeters <= radiusMeters ? 'inside' : 'outside';
}
