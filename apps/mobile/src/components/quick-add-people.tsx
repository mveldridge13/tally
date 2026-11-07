import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Contact, requestPermissionsAsync } from 'expo-contacts';
import { Pressable, TextInput, View } from 'react-native';

import { brand, radius, space, type, useColors } from '@/theme';
import { Text } from './ui';

/**
 * Compact "add someone new" row: a name box with a contacts button inside it, a round + button,
 * and the added names as removable chips above. Only names are kept; nothing from contacts is saved.
 * If contacts access is refused or unavailable, typing still works.
 */
export function QuickAddPeople({
  names,
  onNamesChange,
  draft,
  onDraftChange,
}: {
  names: string[];
  onNamesChange: (names: string[]) => void;
  draft: string;
  onDraftChange: (text: string) => void;
}) {
  const c = useColors();

  const add = (raw = draft) => {
    const n = raw.trim().slice(0, 60);
    if (!n) return;
    if (!names.some((x) => x.toLowerCase() === n.toLowerCase())) onNamesChange([...names, n]);
    onDraftChange('');
  };

  async function pickContact() {
    try {
      if (!(await requestPermissionsAsync()).granted) return;
      const contact = await Contact.presentPicker();
      if (!contact) return;
      const full = (await contact.getFullName()).trim() || ((await contact.getGivenName()) ?? '').trim();
      if (full) add(full);
    } catch {
      // Picker unavailable: typing still works.
    }
  }

  return (
    <View style={{ gap: space.md }}>
      {names.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {names.map((p) => (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${p}`}
              onPress={() => onNamesChange(names.filter((x) => x !== p))}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.xs,
                paddingVertical: space.xs + 2,
                paddingLeft: space.md,
                paddingRight: space.sm,
                borderRadius: radius.pill,
                backgroundColor: c.surfaceAlt,
              }}>
              <Text variant="label">{p}</Text>
              <MaterialIcons name="close" size={16} color={c.textMuted} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            height: 52,
            paddingLeft: space.lg,
            paddingRight: space.xs,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.surface,
          }}>
          <TextInput
            value={draft}
            onChangeText={onDraftChange}
            placeholder="Name"
            placeholderTextColor={c.textMuted}
            maxLength={60}
            autoCapitalize="words"
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={() => add()}
            accessibilityLabel="Name of someone new"
            style={{ ...type.body, flex: 1, color: c.text, padding: 0 }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick from contacts"
            onPress={pickContact}
            hitSlop={8}
            style={({ pressed }) => ({ padding: space.sm, borderRadius: radius.pill, opacity: pressed ? 0.6 : 1 })}>
            <MaterialIcons name="contacts" size={22} color={c.primary} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={draft.trim() ? `Add ${draft.trim()}` : 'Add'}
          disabled={!draft.trim()}
          onPress={() => add()}
          style={({ pressed }) => ({
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: brand.deep,
            opacity: !draft.trim() ? 0.4 : pressed ? 0.8 : 1,
          })}>
          <MaterialIcons name="add" size={28} color={brand.onDeep} />
        </Pressable>
      </View>
    </View>
  );
}
