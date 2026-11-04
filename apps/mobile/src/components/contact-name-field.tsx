import { Contact, requestPermissionsAsync } from 'expo-contacts';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { brand, radius, space, useColors } from '@/theme';
import { Field, LinkButton, Notice, Text } from './ui';

/** How to reach a picked contact. Used once to address an invite; never saved. */
export interface ContactReach {
  phone?: string;
  email?: string;
}

/**
 * A name field that fills itself from the phone's contacts.
 * Tapping it asks for contacts permission (the first time) and opens the system contact picker.
 * Only the picked name is saved. The contact's mobile number and email are passed to `onContact`
 * so an invite can be addressed to them, but they are not stored.
 * If permission is refused, or the person isn't in your contacts, you can type the name instead.
 */
export function ContactNameField({
  value,
  onChange,
  onContact,
  onSubmit,
}: {
  value: string;
  onChange: (name: string) => void;
  /** The picked contact's number and email, or null when the name is typed. */
  onContact?: (reach: ContactReach | null) => void;
  onSubmit?: () => void;
}) {
  const c = useColors();
  const [typing, setTyping] = useState(false);
  const [denied, setDenied] = useState<null | 'ask-again' | 'settings'>(null);
  const [busy, setBusy] = useState(false);

  async function pick() {
    setBusy(true);
    try {
      const permission = await requestPermissionsAsync();
      if (!permission.granted) {
        setDenied(permission.canAskAgain ? 'ask-again' : 'settings');
        setTyping(true);
        return;
      }
      setDenied(null);
      const contact = await Contact.presentPicker();
      if (!contact) return; // cancelled
      const name = (await contact.getFullName()).trim() || ((await contact.getGivenName()) ?? '').trim();
      if (!name) return;
      onChange(name.slice(0, 60));
      // Prefer a mobile number; fall back to the first number listed.
      const [phones, emails] = await Promise.all([contact.getPhones().catch(() => []), contact.getEmails().catch(() => [])]);
      const mobile = phones.find((p) => /mobile|cell/i.test(p.label ?? '')) ?? phones[0];
      onContact?.({ phone: mobile?.number?.trim() || undefined, email: emails[0]?.address?.trim() || undefined });
    } catch {
      // Picker unavailable on this device: fall back to typing.
      setTyping(true);
    } finally {
      setBusy(false);
    }
  }

  if (typing) {
    return (
      <View style={{ gap: space.sm }}>
        <Field
          label="Name"
          value={value}
          onChangeText={(text) => {
            onChange(text);
            onContact?.(null);
          }}
          placeholder="e.g. Sam"
          maxLength={60}
          autoCapitalize="words"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />
        {denied === 'settings' ? (
          <Notice tone="info">
            Contacts access is turned off for Tally. Type the name, or turn it on in Settings to pick from your contacts.
          </Notice>
        ) : denied === 'ask-again' ? (
          <Notice tone="info">No problem. Type the name instead, or tap “Pick from contacts” to try again.</Notice>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.lg }}>
          <LinkButton label="Pick from contacts" onPress={() => (denied === 'settings' ? Linking.openSettings() : pick())} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label">Name</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? `${value}. Tap to pick someone else from your contacts` : 'Pick someone from your contacts'}
        onPress={pick}
        disabled={busy}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          minHeight: 54,
          paddingHorizontal: space.lg,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: pressed ? c.surfaceAlt : c.surface,
        })}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: brand.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: brand.onAccent }}>{value ? value.slice(0, 1).toUpperCase() : '+'}</Text>
        </View>
        <Text variant="body" color={value ? c.text : c.textMuted} style={{ flex: 1 }} numberOfLines={1}>
          {busy ? 'Opening contacts…' : value || 'Pick from your contacts'}
        </Text>
        {value ? (
          <Text variant="label" color={c.focus}>
            Change
          </Text>
        ) : null}
      </Pressable>
      <LinkButton label="Type a name instead" onPress={() => setTyping(true)} color={c.textMuted} />
    </View>
  );
}
