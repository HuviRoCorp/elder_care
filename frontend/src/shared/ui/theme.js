// ============================================================================
// Shared visual constants
//
// A deliberately small set — enough to keep the placeholder screens consistent
// without pretending to be the design system. Phase 6 covers accessible design
// properly (large text, high contrast, simple flow); the sizes here already
// lean large because the primary user is an elderly person holding a phone at
// arm's length.
// ============================================================================

export const colors = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  border: '#E2E6EC',
  text: '#111827',
  textMuted: '#6B7280',
  primary: '#1D4ED8',
  danger: '#B91C1C',
  success: '#047857',
  // Approximate-location marking on the family dashboard (Phase 1 step 4) —
  // deliberately its own color, not reused danger/success: an approximate
  // position is a different kind of signal from the alert's own severity or
  // from a confirmed reading, and conflating them would blur two different
  // facts into one color.
  warning: '#B45309',
  warningBg: '#FEF3C7',
};

export const spacing = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const type = {
  title: 28,
  heading: 20,
  body: 17,
  small: 14,
};
