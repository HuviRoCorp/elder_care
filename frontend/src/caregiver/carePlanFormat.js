// ============================================================================
// Care plan formatting helpers
// ============================================================================

export const CARE_PLAN_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_LABELS = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

export function carePlanStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

/**
 * GET /caregiver/care-plans/elderly/:id returns every plan on file — a
 * history, not a single record. The view screen shows one: prefer the
 * active one, else the most recent regardless of status (the list already
 * comes back newest-first from the backend). Returns null if the list is
 * empty.
 */
export function pickCurrentCarePlan(carePlans) {
  if (!carePlans || carePlans.length === 0) return null;
  return carePlans.find((p) => p.status === 'active') ?? carePlans[0];
}
