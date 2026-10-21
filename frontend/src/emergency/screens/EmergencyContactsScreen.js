// ============================================================================
// Emergency Contacts screen — elderly side
//
// The actual call list: who gets contacted, in what order, when SOS fires.
// Two kinds of row come back from GET /emergency/contacts, mixed together in
// priority order — hand-entered contacts (added here) and contacts created
// by promoting a linked family member (contactUserId set — see
// family/screens/ManageFamilyScreen.js's "Also call them in an emergency"
// toggle). Only hand-entered rows can be edited or removed from this screen;
// a linked row is managed from Who Can See You, where the toggle that
// created it lives — keeps the one action in one place instead of two ways
// to do the same thing.
//
// A linked row's name/phone/email were copied once, at the moment it was
// promoted, and never refresh (see API.md's "Known limitations" — this is
// documented as a real safety gap, not a footnote). That is shown as a full
// width warning panel on every such row, not a small badge — a stale phone
// number on an emergency contact is a failure mode worth noticing, not
// trivia.
//
// Reordering (priority — who gets tried first) has no dedicated endpoint;
// PATCH /emergency/contacts/:id accepts `priority` like any other field, so
// "move up" / "move down" swaps the priority of the two adjacent rows.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listContacts, createContact, updateContact, deleteContact } from '../api/contacts';
import { ApiError, NetworkError } from '../../shared/api/client';
import { colors, spacing, type } from '../../shared/ui/theme';

const EMPTY_FORM = {
  fullName: '',
  phone: '',
  relationship: '',
  notifyBySms: true,
  notifyByCall: true,
  notifyByPush: true,
};

export function EmergencyContactsScreen({ navigation }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [reorderingId, setReorderingId] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState(null);
  const [addFieldErrors, setAddFieldErrors] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editFieldErrors, setEditFieldErrors] = useState({});

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { contacts: list } = await listContacts();
      setContacts(list);
      if (!silent) setBanner(null);
    } catch (err) {
      if (!silent) {
        setBanner({
          kind: 'error',
          text: err instanceof NetworkError ? 'Could not reach the server.' : 'Could not load your contact list.',
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function applyErrors(err, setError, setFieldErrors, fallback) {
    if (err instanceof ApiError) {
      if (err.code === 'contact_already_exists') {
        setError('Someone with this phone number is already on your list.');
      } else if (err.code === 'validation_failed' && Array.isArray(err.details)) {
        const mapped = {};
        err.details.forEach((d) => {
          if (d.field) mapped[d.field] = d.message;
        });
        setFieldErrors(mapped);
        setError('Please check the highlighted fields.');
      } else {
        setError(err.message || fallback);
      }
    } else {
      setError('Could not reach the server. Please try again.');
    }
  }

  async function handleAddContact() {
    setAddError(null);
    setAddFieldErrors({});

    if (!addForm.fullName.trim() || !addForm.phone.trim()) {
      setAddFieldErrors({
        fullName: !addForm.fullName.trim() ? 'Enter their name.' : undefined,
        phone: !addForm.phone.trim() ? 'Enter their phone number.' : undefined,
      });
      return;
    }

    setAddBusy(true);
    try {
      await createContact({
        fullName: addForm.fullName.trim(),
        phone: addForm.phone.trim(),
        relationship: addForm.relationship.trim() || undefined,
        notifyBySms: addForm.notifyBySms,
        notifyByCall: addForm.notifyByCall,
        notifyByPush: addForm.notifyByPush,
      });
      setAddForm(EMPTY_FORM);
      setAddOpen(false);
      setBanner({ kind: 'success', text: 'Contact added.' });
      await load({ silent: true });
    } catch (err) {
      applyErrors(err, setAddError, setAddFieldErrors, 'Could not add that contact.');
    } finally {
      setAddBusy(false);
    }
  }

  function startEdit(contact) {
    setEditingId(contact.id);
    setEditForm({
      fullName: contact.fullName,
      phone: contact.phone,
      relationship: contact.relationship || '',
      notifyBySms: contact.notifyBySms,
      notifyByCall: contact.notifyByCall,
      notifyByPush: contact.notifyByPush,
    });
    setEditError(null);
    setEditFieldErrors({});
  }

  async function handleSaveEdit() {
    setEditError(null);
    setEditFieldErrors({});

    if (!editForm.fullName.trim() || !editForm.phone.trim()) {
      setEditFieldErrors({
        fullName: !editForm.fullName.trim() ? 'Enter their name.' : undefined,
        phone: !editForm.phone.trim() ? 'Enter their phone number.' : undefined,
      });
      return;
    }

    setEditBusy(true);
    try {
      await updateContact(editingId, {
        fullName: editForm.fullName.trim(),
        phone: editForm.phone.trim(),
        relationship: editForm.relationship.trim() || undefined,
        notifyBySms: editForm.notifyBySms,
        notifyByCall: editForm.notifyByCall,
        notifyByPush: editForm.notifyByPush,
      });
      setEditingId(null);
      setBanner({ kind: 'success', text: 'Contact updated.' });
      await load({ silent: true });
    } catch (err) {
      applyErrors(err, setEditError, setEditFieldErrors, 'Could not save those changes.');
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete(id) {
    setDeletingId(id);
    try {
      await deleteContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setConfirmDeleteId(null);
      setBanner({ kind: 'success', text: 'Contact removed.' });
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof NetworkError ? 'Could not reach the server. Please try again.' : 'Could not remove that contact.',
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleMove(index, direction) {
    const other = index + direction;
    if (other < 0 || other >= contacts.length) return;

    const current = contacts[index];
    const swapWith = contacts[other];
    setReorderingId(current.id);

    // Optimistic swap so the list reorders immediately instead of waiting on
    // two round trips.
    const reordered = [...contacts];
    reordered[index] = swapWith;
    reordered[other] = current;
    setContacts(reordered);

    try {
      await Promise.all([
        updateContact(current.id, { priority: swapWith.priority }),
        updateContact(swapWith.id, { priority: current.priority }),
      ]);
      await load({ silent: true });
    } catch {
      setBanner({ kind: 'error', text: 'Could not change the order. Please try again.' });
      await load({ silent: true });
    } finally {
      setReorderingId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" style={styles.backRow}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.title}>People to Call in an Emergency</Text>
          <Text style={styles.subtitle}>
            If you press SOS, we call these people in order, one at a time, until someone responds.
          </Text>

          {banner && (
            <Pressable
              onPress={() => setBanner(null)}
              style={[styles.banner, banner.kind === 'error' ? styles.bannerError : styles.bannerSuccess]}
            >
              <Text style={[styles.bannerText, banner.kind === 'error' ? styles.bannerTextError : styles.bannerTextSuccess]}>
                {banner.text}
              </Text>
            </Pressable>
          )}

          {loading && <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />}

          {!loading && contacts.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nobody is on your call list yet. Add someone below.</Text>
            </View>
          )}

          {!loading &&
            contacts.map((contact, index) =>
              editingId === contact.id ? (
                <ContactForm
                  key={contact.id}
                  title="Edit Contact"
                  form={editForm}
                  setForm={setEditForm}
                  fieldErrors={editFieldErrors}
                  error={editError}
                  busy={editBusy}
                  onCancel={() => setEditingId(null)}
                  onSubmit={handleSaveEdit}
                  submitLabel="Save Changes"
                />
              ) : (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  position={index + 1}
                  isFirst={index === 0}
                  isLast={index === contacts.length - 1}
                  reordering={reorderingId === contact.id}
                  confirmingDelete={confirmDeleteId === contact.id}
                  deleting={deletingId === contact.id}
                  onMoveUp={() => handleMove(index, -1)}
                  onMoveDown={() => handleMove(index, 1)}
                  onEdit={() => startEdit(contact)}
                  onRequestDelete={() => setConfirmDeleteId(contact.id)}
                  onBackOut={() => setConfirmDeleteId(null)}
                  onConfirmDelete={() => handleDelete(contact.id)}
                  onManageLinkedContact={() => navigation.navigate('ManageFamily')}
                />
              )
            )}

          {!addOpen && (
            <Pressable
              style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
              onPress={() => setAddOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a contact"
            >
              <Text style={styles.addButtonText}>+ Add a Contact</Text>
            </Pressable>
          )}

          {addOpen && (
            <ContactForm
              title="Add a Contact"
              form={addForm}
              setForm={setAddForm}
              fieldErrors={addFieldErrors}
              error={addError}
              busy={addBusy}
              onCancel={() => {
                setAddOpen(false);
                setAddForm(EMPTY_FORM);
                setAddError(null);
                setAddFieldErrors({});
              }}
              onSubmit={handleAddContact}
              submitLabel="Add Contact"
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ContactCard({
  contact,
  position,
  isFirst,
  isLast,
  reordering,
  confirmingDelete,
  deleting,
  onMoveUp,
  onMoveDown,
  onEdit,
  onRequestDelete,
  onBackOut,
  onConfirmDelete,
  onManageLinkedContact,
}) {
  const isLinked = contact.contactUserId != null;

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.orderControls}>
          <Pressable
            onPress={onMoveUp}
            disabled={isFirst || reordering}
            accessibilityRole="button"
            accessibilityLabel="Move up, called sooner"
            style={[styles.orderButton, (isFirst || reordering) && styles.orderButtonDisabled]}
          >
            <Text style={styles.orderButtonText}>▲</Text>
          </Pressable>
          <Text style={styles.orderPosition}>{position}</Text>
          <Pressable
            onPress={onMoveDown}
            disabled={isLast || reordering}
            accessibilityRole="button"
            accessibilityLabel="Move down, called later"
            style={[styles.orderButton, (isLast || reordering) && styles.orderButtonDisabled]}
          >
            <Text style={styles.orderButtonText}>▼</Text>
          </Pressable>
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{contact.fullName}</Text>
          {contact.relationship ? <Text style={styles.cardRelationship}>{contact.relationship}</Text> : null}
          <Text style={styles.cardPhone}>{contact.phone}</Text>
        </View>
      </View>

      {isLinked && (
        <View style={styles.stalePanel}>
          <Text style={styles.stalePanelTitle}>⚠ This number may be out of date</Text>
          <Text style={styles.stalePanelText}>
            This contact was copied from {contact.fullName}'s account when you added them. If they've since changed
            their phone number, we won't know — we still call this one. Ask them directly if you're not sure it's
            current.
          </Text>
        </View>
      )}

      <View style={styles.channelRow}>
        <ChannelPill label="Text message" active={contact.notifyBySms} />
        <ChannelPill label="Phone call" active={contact.notifyByCall} />
        <ChannelPill label="App notification" active={contact.notifyByPush} />
      </View>

      {deleting ? (
        <ActivityIndicator color={colors.danger} style={styles.spinner} />
      ) : confirmingDelete ? (
        <View style={styles.confirmBlock}>
          <Text style={styles.confirmText}>Remove {contact.fullName} from your call list?</Text>
          <View style={styles.confirmButtons}>
            <Pressable onPress={onBackOut} accessibilityRole="button" style={styles.confirmNoButton}>
              <Text style={styles.confirmNoButtonText}>Keep Them</Text>
            </Pressable>
            <Pressable onPress={onConfirmDelete} accessibilityRole="button" style={styles.confirmYesButton}>
              <Text style={styles.confirmYesButtonText}>Yes, Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.cardActionRow}>
          {isLinked ? (
            <Pressable onPress={onManageLinkedContact} accessibilityRole="button" style={styles.editButton}>
              <Text style={styles.editButtonText}>Manage from Who Can See You</Text>
            </Pressable>
          ) : (
            <>
              <Pressable onPress={onEdit} accessibilityRole="button" style={styles.editButton}>
                <Text style={styles.editButtonText}>Edit</Text>
              </Pressable>
              <Pressable onPress={onRequestDelete} accessibilityRole="button" style={styles.removeButton}>
                <Text style={styles.removeButtonText}>Remove</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function ChannelPill({ label, active }) {
  return (
    <View style={[styles.channelPill, active ? styles.channelPillOn : styles.channelPillOff]}>
      <Text style={[styles.channelPillText, active ? styles.channelPillTextOn : styles.channelPillTextOff]}>{label}</Text>
    </View>
  );
}

function ContactForm({ title, form, setForm, fieldErrors, error, busy, onCancel, onSubmit, submitLabel }) {
  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>{title}</Text>

      {error ? (
        <View style={styles.formErrorBanner}>
          <Text style={styles.formErrorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={[styles.input, fieldErrors.fullName && styles.inputError]}
          value={form.fullName}
          onChangeText={(v) => set('fullName', v)}
          placeholder="Full name"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          accessibilityLabel="Name"
        />
        {fieldErrors.fullName ? <Text style={styles.fieldErrorText}>{fieldErrors.fullName}</Text> : null}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Phone Number</Text>
        <View style={styles.phoneRow}>
          <View style={styles.countryBadge}>
            <Text style={styles.countryCode}>+91</Text>
          </View>
          <TextInput
            style={[styles.input, styles.phoneInput, fieldErrors.phone && styles.inputError]}
            value={form.phone}
            onChangeText={(v) => set('phone', v)}
            placeholder="10-digit mobile number"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            autoCapitalize="none"
            accessibilityLabel="Phone number"
          />
        </View>
        {fieldErrors.phone ? <Text style={styles.fieldErrorText}>{fieldErrors.phone}</Text> : null}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>How are they related? (Optional)</Text>
        <TextInput
          style={styles.input}
          value={form.relationship}
          onChangeText={(v) => set('relationship', v)}
          placeholder="e.g. Neighbour, Doctor"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          accessibilityLabel="Relationship"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>How should we reach them?</Text>
        <SwitchRow label="Text message" value={form.notifyBySms} onValueChange={(v) => set('notifyBySms', v)} />
        <SwitchRow label="Phone call" value={form.notifyByCall} onValueChange={(v) => set('notifyByCall', v)} />
        <SwitchRow label="App notification" value={form.notifyByPush} onValueChange={(v) => set('notifyByPush', v)} />
      </View>

      <View style={styles.formButtons}>
        <Pressable onPress={onCancel} accessibilityRole="button" style={styles.formCancelButton}>
          <Text style={styles.formCancelButtonText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onSubmit} disabled={busy} accessibilityRole="button" style={styles.formSubmitButton}>
          {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.formSubmitButtonText}>{submitLabel}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function SwitchRow({ label, value, onValueChange }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  backRow: { paddingVertical: spacing.xs },
  backText: { fontSize: type.body, color: colors.primary, fontWeight: '700' },
  title: { fontSize: type.title, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: type.body, color: colors.textMuted, lineHeight: 23 },
  banner: { borderRadius: 12, padding: spacing.md, borderWidth: 1.5 },
  bannerError: { backgroundColor: '#FEE2E2', borderColor: colors.danger },
  bannerSuccess: { backgroundColor: '#DCFCE7', borderColor: colors.success },
  bannerText: { fontSize: type.body - 1, fontWeight: '700', textAlign: 'center' },
  bannerTextError: { color: colors.danger },
  bannerTextSuccess: { color: colors.success },
  spinner: { marginVertical: spacing.md },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyText: { fontSize: type.body, color: colors.textMuted, lineHeight: 23 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardTopRow: { flexDirection: 'row', gap: spacing.md },
  orderControls: { alignItems: 'center', gap: 2, width: 40 },
  orderButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderButtonDisabled: { opacity: 0.35 },
  orderButtonText: { fontSize: type.body - 2, fontWeight: '800', color: colors.text },
  orderPosition: { fontSize: type.body - 1, fontWeight: '900', color: colors.textMuted, marginVertical: 2 },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: type.heading, fontWeight: '800', color: colors.text },
  cardRelationship: { fontSize: type.small + 1, color: colors.textMuted },
  cardPhone: { fontSize: type.body - 1, color: colors.text, fontWeight: '600' },
  stalePanel: {
    backgroundColor: colors.warningBg,
    borderWidth: 2,
    borderColor: colors.warning,
    borderRadius: 14,
    padding: spacing.md,
    gap: 6,
  },
  stalePanelTitle: { fontSize: type.body - 1, fontWeight: '900', color: colors.warning },
  stalePanelText: { fontSize: type.small + 1, color: colors.warning, lineHeight: 20 },
  channelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  channelPill: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  channelPillOn: { backgroundColor: '#DBEAFE' },
  channelPillOff: { backgroundColor: '#F3F4F6' },
  channelPillText: { fontSize: type.small - 1, fontWeight: '700' },
  channelPillTextOn: { color: colors.primary },
  channelPillTextOff: { color: colors.textMuted },
  cardActionRow: { flexDirection: 'row', gap: spacing.sm },
  editButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editButtonText: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  removeButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.danger,
    paddingVertical: 12,
    alignItems: 'center',
  },
  removeButtonText: { fontSize: type.body - 1, fontWeight: '800', color: colors.danger },
  confirmBlock: { gap: spacing.sm },
  confirmText: { fontSize: type.body - 1, fontWeight: '700', color: colors.text, textAlign: 'center', lineHeight: 22 },
  confirmButtons: { gap: spacing.sm },
  confirmNoButton: {
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmNoButtonText: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  confirmYesButton: { backgroundColor: colors.danger, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  confirmYesButtonText: { fontSize: type.body - 1, fontWeight: '800', color: '#FFFFFF' },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  addButtonPressed: { backgroundColor: '#1D4ED8' },
  addButtonText: { fontSize: type.body, fontWeight: '800', color: '#FFFFFF' },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  formTitle: { fontSize: type.heading, fontWeight: '800', color: colors.text },
  formErrorBanner: { backgroundColor: '#FEE2E2', borderRadius: 10, padding: spacing.sm },
  formErrorText: { fontSize: type.small + 1, color: colors.danger, fontWeight: '700' },
  inputGroup: { gap: spacing.xs },
  label: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: type.body,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  fieldErrorText: { fontSize: type.small, color: colors.danger, fontWeight: '600' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  countryBadge: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  countryCode: { fontSize: type.body, fontWeight: '700', color: colors.text },
  phoneInput: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  switchLabel: { fontSize: type.body - 1, color: colors.text, fontWeight: '600' },
  formButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  formCancelButton: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  formCancelButtonText: { fontSize: type.body - 1, fontWeight: '700', color: colors.text },
  formSubmitButton: { flex: 1, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  formSubmitButtonText: { fontSize: type.body - 1, fontWeight: '800', color: '#FFFFFF' },
});
