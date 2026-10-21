// ============================================================================
// Emergency contact endpoints
//
// One function per endpoint in API.md's "Emergency Contacts" section. Hand
// entered contacts and linked-family contacts (contactUserId set — see
// family/api/links.js's promoteToEmergencyContact) both live in this same
// table and come back together, priority order.
// ============================================================================

import { apiRequest } from '../../shared/api/client';

/** GET /emergency/contacts — the signed-in elderly user's contact list, priority order. */
export function listContacts() {
  return apiRequest('/emergency/contacts');
}

/**
 * POST /emergency/contacts — add a hand-entered contact.
 * @param {object} input
 * @param {string} input.fullName
 * @param {string} input.phone           as typed; the server normalises it
 * @param {string} [input.email]
 * @param {string} [input.relationship]
 * @param {number} [input.priority]      1-10; omit to append after the current highest
 * @param {boolean} [input.notifyBySms]
 * @param {boolean} [input.notifyByCall]
 * @param {boolean} [input.notifyByPush]
 */
export function createContact(input) {
  return apiRequest('/emergency/contacts', { method: 'POST', body: input });
}

/**
 * PATCH /emergency/contacts/:id — edit any field, including `priority` on
 * its own for reordering. There is no separate reorder endpoint.
 */
export function updateContact(id, changes) {
  return apiRequest(`/emergency/contacts/${id}`, { method: 'PATCH', body: changes });
}

/** DELETE /emergency/contacts/:id — soft delete. No undelete through this API. */
export function deleteContact(id) {
  return apiRequest(`/emergency/contacts/${id}`, { method: 'DELETE' });
}
