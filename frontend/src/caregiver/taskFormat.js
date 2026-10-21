// ============================================================================
// Task formatting helpers
// ============================================================================

export const TASK_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

const PRIORITY_LABELS = { low: 'Low', normal: 'Normal', high: 'High' };
export function taskPriorityLabel(priority) {
  return PRIORITY_LABELS[priority] ?? priority;
}

const STATUS_LABELS = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
};
export function taskStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}
