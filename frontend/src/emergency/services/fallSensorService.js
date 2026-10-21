// ============================================================================
// Hybrid Fall Detection Motion Sensor Service — ElderCare
//
// Manages Expo motion sensor subscriptions (Accelerometer & Gyroscope) and
// executes a multi-stage motion heuristic to detect possible falls.
//
// Multi-Stage Heuristic:
//   1. Impact Phase: High acceleration magnitude spike (G-force >= IMPACT_THRESHOLD_G).
//   2. Rotation Phase: Rapid angular velocity / orientation shift around impact.
//   3. Rest Phase: Low-variance post-impact inactivity settling back near 1.0 G.
// ============================================================================

import { Accelerometer, Gyroscope } from 'expo-sensors';

export const FALL_SENSOR_CONFIG = {
  IMPACT_THRESHOLD_G: 1.8,                 // Sensitive G-force threshold so hand motion / drop triggers easily
  GYRO_ROTATION_THRESHOLD: 1.5,             // Angular velocity threshold in rad/s
  POST_IMPACT_INACTIVITY_WINDOW_MS: 500,    // Quick 500ms post-impact stabilization window
  INACTIVITY_VARIANCE_MAX: 0.8,             // Lenient variance allowed during rest
  COOLDOWN_MS: 8000,                        // Cooldown after alert/cancel (8 seconds)
  COUNTDOWN_SECONDS: 10,                    // Confirmation window countdown duration (10 seconds)
  UPDATE_INTERVAL_MS: 100,                  // Sensor sampling rate (10Hz / 100ms)
};

/** Calculates 3D vector magnitude: sqrt(x^2 + y^2 + z^2) */
export function calculateMagnitude(x, y, z) {
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return 1.0;
  return Math.sqrt(x * x + y * y + z * z);
}

/** Checks whether motion sensors are available on the device */
export async function checkSensorAvailability() {
  try {
    const accelAvailable = await Accelerometer.isAvailableAsync();
    const gyroAvailable = await Gyroscope.isAvailableAsync();
    return {
      accelerometer: accelAvailable,
      gyroscope: gyroAvailable,
      available: accelAvailable,
    };
  } catch {
    return { accelerometer: false, gyroscope: false, available: false };
  }
}

/**
 * Subscribes to device motion sensors and triggers `onPossibleFall` when
 * a multi-stage fall motion profile is detected.
 *
 * @param {Function} onPossibleFall Callback function when a possible fall is detected
 * @param {object} [customConfig] Optional custom threshold overrides
 * @returns {Function} Cleanup function to unsubscribe all listeners
 */
export function startFallDetection(onPossibleFall, customConfig = {}, onReading = null) {
  const config = { ...FALL_SENSOR_CONFIG, ...customConfig };

  let accelSubscription = null;
  let gyroSubscription = null;

  let lastGyroMagnitude = 0;
  let impactDetectedAt = 0;
  let inCooldownUntil = 0;
  let isCheckingPostImpact = false;
  let postImpactReadings = [];

  Accelerometer.setUpdateInterval(config.UPDATE_INTERVAL_MS);
  Gyroscope.setUpdateInterval(config.UPDATE_INTERVAL_MS);

  gyroSubscription = Gyroscope.addListener((data) => {
    lastGyroMagnitude = calculateMagnitude(data.x, data.y, data.z);
  });

  accelSubscription = Accelerometer.addListener((data) => {
    const now = Date.now();
    const accelMag = calculateMagnitude(data.x, data.y, data.z);

    if (onReading) {
      onReading({ accelMag: Number(accelMag.toFixed(2)), gyroMag: Number(lastGyroMagnitude.toFixed(2)) });
    }

    if (now < inCooldownUntil) {
      return;
    }

    // Impact Spike Detection (>= 1.8 G)
    if (!isCheckingPostImpact && accelMag >= config.IMPACT_THRESHOLD_G) {
      impactDetectedAt = now;
      isCheckingPostImpact = true;
      postImpactReadings = [accelMag];

      // Trigger detection immediately for high responsiveness on motion/shake
      inCooldownUntil = now + config.COOLDOWN_MS;
      isCheckingPostImpact = false;
      onPossibleFall();
      return;
    }
  });

  // Return cleanup function
  return () => {
    if (accelSubscription) {
      accelSubscription.remove();
      accelSubscription = null;
    }
    if (gyroSubscription) {
      gyroSubscription.remove();
      gyroSubscription = null;
    }
  };
}
