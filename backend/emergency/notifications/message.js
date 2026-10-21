// ============================================================================
// What each channel actually says.
//
// Coordinates are included here whenever the alert has them, unlike the
// family dashboard's family_links.can_view_location gate. That gate is about
// ongoing surveillance access for people with standing app access; this is
// telling someone we're actively asking to go check on the elderly person
// where the emergency is happening right now. Different question, different
// answer — see BUILD_LOG.md.
//
// One summary line per alert_type, not one fixed sentence — added for
// geofence_breach (Phase 3 step 3), and fixes 'fall' along the way: every
// alert type used to get the same "pressed their SOS button" line
// regardless of what actually happened, since this function only ever had
// one caller-independent template. categoryId stays 'sos-alert' for every
// type on purpose — the frontend keys its push "Acknowledge" action off that
// one category name (see alertNotifications.js), and acknowledging is
// already alert-type-agnostic; renaming it would be a frontend contract
// change this pass doesn't need to make.
// ============================================================================

function mapsLink(latitude, longitude) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

const TITLE_PREFIX = {
  sos: 'SOS',
  fall: 'Fall alert',
  geofence_breach: 'Safe zone alert',
};

function summaryFor(alert, elderlyName, when, locationSentence) {
  switch (alert.alert_type) {
    case 'fall':
      return `${elderlyName} reported a fall at ${when}. ${locationSentence}`;
    case 'geofence_breach':
      return `${elderlyName}: ${alert.message ?? 'triggered a safe zone alert'} (${when}). ${locationSentence}`;
    case 'sos':
    default:
      return `${elderlyName} pressed their SOS button at ${when}. ${locationSentence}`;
  }
}

/** Spoken, not written — a location link is never read aloud on a call. */
function voiceSummaryFor(alert, elderlyName) {
  switch (alert.alert_type) {
    case 'fall':
      return `${elderlyName} has reported a fall and may need assistance.`;
    case 'geofence_breach':
      return `${elderlyName} has triggered a safe zone alert.`;
    case 'sos':
    default:
      return `${elderlyName} has pressed their emergency button and needs help.`;
  }
}

/** @param {object} alert  a raw `alerts` row */
export function buildAlertMessage(alert, elderlyName) {
  const when = new Date(alert.triggered_at).toLocaleString();
  const hasLocation = alert.latitude != null && alert.longitude != null;
  const locationSentence = hasLocation
    ? `Last known location: ${mapsLink(alert.latitude, alert.longitude)}`
    : 'Location was not available at the time.';

  const summary = summaryFor(alert, elderlyName, when, locationSentence);
  const titlePrefix = TITLE_PREFIX[alert.alert_type] ?? 'Alert';

  return {
    push: {
      title: `${titlePrefix}: ${elderlyName} needs help`,
      body: summary,
      data: { alertId: alert.id, type: alert.alert_type },
      categoryId: 'sos-alert',
    },
    email: {
      subject: `Emergency alert: ${elderlyName}`,
      text: `${summary}\n\nOpen the ElderCare app to see more and respond.`,
    },
    sms: {
      text: `ElderCare alert: ${summary}`,
    },
    voice_call: {
      text: `This is an emergency alert from Elder Care. ${voiceSummaryFor(alert, elderlyName)} Please open the Elder Care app or contact them directly.`,
    },
  };
}
