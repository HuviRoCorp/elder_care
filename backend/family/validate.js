// ============================================================================
// Input validation for the family link routes
//
// Same shape as emergency/validate.js: collect every problem and report them
// together rather than one at a time.
// ============================================================================

import { badRequest } from '../shared/http/errors.js';
import { normalizePhone } from '../shared/phone.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERMISSION_LEVELS = ['view', 'manage', 'owner'];
const LINK_STATUSES = ['pending', 'active', 'revoked'];

function fieldErrors(checks) {
  return checks.filter((c) => c.when).map(({ field, message }) => ({ field, message }));
}

/**
 * POST /family/invites — `phone` identifies the invitee, who must already be
 * registered (see BUILD_LOG.md, "known limitations" — there is no way to
 * invite someone who has not signed up yet). `elderlyUserId` is required only
 * when the caller is not the elderly user themselves; routes.js decides that.
 *
 * `canManageCaregivers` is accepted and stored like the other permission
 * flags, but nothing reads it back yet — left dead on purpose, see
 * BUILD_LOG.md and the comment on toPublicFamilyLink.
 */
export function validateInviteBody(body = {}) {
  const {
    elderlyUserId,
    phone,
    relationship,
    permissionLevel,
    canViewLocation,
    canManageContacts,
    canManageCaregivers,
    canAcknowledgeAlerts,
  } = body;

  const normalizedPhone = normalizePhone(phone);

  const errors = fieldErrors([
    { when: elderlyUserId !== undefined && !UUID_RE.test(elderlyUserId),
      field: 'elderlyUserId', message: 'elderlyUserId must be a UUID.' },
    { when: !normalizedPhone.ok, field: 'phone', message: normalizedPhone.reason },
    { when: relationship !== undefined && (typeof relationship !== 'string' || relationship.length > 50),
      field: 'relationship', message: 'Relationship must be a string of 50 characters or fewer.' },
    { when: permissionLevel !== undefined && !PERMISSION_LEVELS.includes(permissionLevel),
      field: 'permissionLevel', message: `permissionLevel must be one of: ${PERMISSION_LEVELS.join(', ')}.` },
    { when: canViewLocation !== undefined && typeof canViewLocation !== 'boolean',
      field: 'canViewLocation', message: 'canViewLocation must be a boolean.' },
    { when: canManageContacts !== undefined && typeof canManageContacts !== 'boolean',
      field: 'canManageContacts', message: 'canManageContacts must be a boolean.' },
    { when: canManageCaregivers !== undefined && typeof canManageCaregivers !== 'boolean',
      field: 'canManageCaregivers', message: 'canManageCaregivers must be a boolean.' },
    { when: canAcknowledgeAlerts !== undefined && typeof canAcknowledgeAlerts !== 'boolean',
      field: 'canAcknowledgeAlerts', message: 'canAcknowledgeAlerts must be a boolean.' },
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'One or more fields are invalid.', { details: errors });
  }

  return {
    elderlyUserId: elderlyUserId ?? null,
    phone: normalizedPhone.value,
    relationship: typeof relationship === 'string' && relationship.trim() !== '' ? relationship.trim() : null,
    permissionLevel: permissionLevel ?? 'view',
    canViewLocation: canViewLocation ?? true,
    canManageContacts: canManageContacts ?? false,
    canManageCaregivers: canManageCaregivers ?? false,
    canAcknowledgeAlerts: canAcknowledgeAlerts ?? true,
  };
}

/**
 * PATCH /family/links/:id — elderly-only edit of an existing active link's
 * permission fields. Every field optional, but at least one must be present
 * — same shape as emergency/validate.js's validateUpdateContactBody.
 */
export function validateUpdateLinkPermissionsBody(body = {}) {
  const { permissionLevel, canViewLocation, canManageContacts, canManageCaregivers, canAcknowledgeAlerts } = body;

  const anyFieldProvided = [permissionLevel, canViewLocation, canManageContacts, canManageCaregivers, canAcknowledgeAlerts]
    .some((v) => v !== undefined);

  const errors = fieldErrors([
    { when: !anyFieldProvided, field: 'body', message: 'At least one field must be provided.' },
    { when: permissionLevel !== undefined && !PERMISSION_LEVELS.includes(permissionLevel),
      field: 'permissionLevel', message: `permissionLevel must be one of: ${PERMISSION_LEVELS.join(', ')}.` },
    { when: canViewLocation !== undefined && typeof canViewLocation !== 'boolean',
      field: 'canViewLocation', message: 'canViewLocation must be a boolean.' },
    { when: canManageContacts !== undefined && typeof canManageContacts !== 'boolean',
      field: 'canManageContacts', message: 'canManageContacts must be a boolean.' },
    { when: canManageCaregivers !== undefined && typeof canManageCaregivers !== 'boolean',
      field: 'canManageCaregivers', message: 'canManageCaregivers must be a boolean.' },
    { when: canAcknowledgeAlerts !== undefined && typeof canAcknowledgeAlerts !== 'boolean',
      field: 'canAcknowledgeAlerts', message: 'canAcknowledgeAlerts must be a boolean.' },
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'One or more fields are invalid.', { details: errors });
  }

  const result = {};
  if (permissionLevel !== undefined) result.permissionLevel = permissionLevel;
  if (canViewLocation !== undefined) result.canViewLocation = canViewLocation;
  if (canManageContacts !== undefined) result.canManageContacts = canManageContacts;
  if (canManageCaregivers !== undefined) result.canManageCaregivers = canManageCaregivers;
  if (canAcknowledgeAlerts !== undefined) result.canAcknowledgeAlerts = canAcknowledgeAlerts;
  return result;
}

/** GET /family/links — optional status filter, same values the column allows. */
export function validateListLinksQuery(query = {}) {
  const { status } = query;

  const errors = fieldErrors([
    { when: status !== undefined && !LINK_STATUSES.includes(status),
      field: 'status', message: `status must be one of: ${LINK_STATUSES.join(', ')}.` },
  ]);

  if (errors.length > 0) {
    throw badRequest('validation_failed', 'One or more fields are invalid.', { details: errors });
  }

  return { status: status ?? null };
}
