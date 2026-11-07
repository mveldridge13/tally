import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { Sheet } from '@/components/friendly';
import { Avatar, Button, Card, Divider, LinkButton, Text } from '@/components/ui';
import type { SplitPartner } from '@/lib/data';
import { PRESS_DELAY, brand, radius, space, type, useColors } from '@/theme';

/** How many people show before "Show more". */
const FIRST = 6;

/**
 * Tick list of people you split with. Tapping a row selects or unselects them;
 * the screen decides what to do with the selection.
 */
export function SplitPartnerPicker({
  partners,
  selected,
  onToggle,
  all = false,
  plain = false,
}: {
  partners: SplitPartner[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Show everyone, with no "Show more" (e.g. inside the search sheet). */
  all?: boolean;
  /** No card around the rows (inside a sheet, so it isn't a box in a box). */
  plain?: boolean;
}) {
  const c = useColors();
  const [showAll, setShowAll] = useState(all);
  const shown = showAll ? partners : partners.slice(0, FIRST);

  return (
    <>
      <Card style={plain ? { padding: 0, paddingVertical: 0, borderWidth: 0, backgroundColor: 'transparent' } : { paddingVertical: 0 }}>
        {shown.map((p, i) => {
          const on = selected.has(p.id);
          return (
            <View key={p.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`Add ${p.name}`}
                onPress={() => onToggle(p.id)}
                android_ripple={{ color: c.surfaceAlt }}
                unstable_pressDelay={PRESS_DELAY}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <Avatar name={p.name} size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="heading" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text variant="caption" muted>
                    {p.sharedGroups === 1 ? 'In 1 group with you' : `In ${p.sharedGroups} groups with you`}
                  </Text>
                </View>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    borderWidth: 2,
                    borderColor: on ? c.focus : c.border,
                    backgroundColor: on ? c.focus : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  {on ? <Text style={{ color: brand.onDeep, fontSize: 14, fontWeight: '800', lineHeight: 16 }}>✓</Text> : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </Card>
      {partners.length > FIRST && !all ? (
        <LinkButton label={showAll ? 'Show fewer' : `Show ${partners.length - FIRST} more`} onPress={() => setShowAll((v) => !v)} />
      ) : null}
    </>
  );
}

/** How many people show in the sideways row before "See all". */
const ROW = 8;

/**
 * People you split with as one sideways row of initials (most recent first): tap to tick.
 * "See all" (always shown) opens a searchable list, so the section stays the same height however many
 * people there are. Everyone ticked shows as a removable chip underneath.
 */
export function SplitPartnerRow({
  partners,
  selected,
  onToggle,
  onSeeAll,
}: {
  partners: SplitPartner[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Open SplitPartnerSheet. The screen renders the sheet outside its scrolling area. */
  onSeeAll: () => void;
}) {
  const c = useColors();
  const recent = partners.slice(0, ROW);
  const picked = partners.filter((p) => selected.has(p.id));

  return (
    <View style={{ gap: space.md }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -space.lg }}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
        {recent.map((p) => {
          const on = selected.has(p.id);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={p.name}
              onPress={() => onToggle(p.id)}
              style={{ width: 64, alignItems: 'center', gap: space.xs }}>
              <View style={{ padding: 2, borderRadius: 30, borderWidth: 2, borderColor: on ? brand.deep : 'transparent' }}>
                <Avatar name={p.name} size={50} color={on ? brand.deep : undefined} />
                {on ? (
                  <View
                    style={{
                      position: 'absolute',
                      right: -2,
                      bottom: -2,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: brand.deep,
                      borderWidth: 2,
                      borderColor: c.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <MaterialIcons name="check" size={13} color={brand.onDeep} />
                  </View>
                ) : null}
              </View>
              <Text variant="caption" numberOfLines={1} color={on ? c.text : c.textMuted} style={{ fontWeight: on ? '700' : '400' }}>
                {p.name.split(' ')[0]}
              </Text>
            </Pressable>
          );
        })}
        {/* Always there, so search is one tap away however many people there are. */}
        {partners.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`See all ${partners.length} people`}
            onPress={onSeeAll}
            style={{ width: 64, alignItems: 'center', gap: space.xs }}>
            <View
              style={{
                margin: 4,
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: c.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <MaterialIcons name="search" size={24} color={c.primary} />
            </View>
            <Text variant="caption" color={c.primary} style={{ fontWeight: '700' }}>
              See all
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {picked.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {picked.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${p.name}`}
              onPress={() => onToggle(p.id)}
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
              <Text variant="label">{p.name}</Text>
              <MaterialIcons name="close" size={16} color={c.textMuted} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Everyone you split with, searchable, in a slide-up sheet. */
export function SplitPartnerSheet({
  visible,
  onClose,
  partners,
  selected,
  onToggle,
}: {
  visible: boolean;
  onClose: () => void;
  partners: SplitPartner[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const c = useColors();
  const [query, setQuery] = useState('');
  const picked = partners.filter((p) => selected.has(p.id)).length;
  const q = query.trim().toLowerCase();
  // A-Z here (the row on the form stays most recent first).
  const matches = (q ? partners.filter((p) => p.name.toLowerCase().includes(q)) : [...partners]).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
  const close = () => {
    onClose();
    setQuery('');
  };
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="People you split with"
      footer={<Button label={picked ? `Done · ${picked} picked` : 'Done'} onPress={close} />}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          height: 46,
          paddingHorizontal: space.md,
          borderRadius: radius.pill,
          backgroundColor: c.surfaceAlt,
        }}>
        <MaterialIcons name="search" size={20} color={c.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={c.textMuted}
          selectionColor={c.focus}
          cursorColor={c.focus}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search people"
          style={{ ...type.body, flex: 1, color: c.text, paddingVertical: 0 }}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={10}>
            <MaterialIcons name="close" size={18} color={c.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {matches.length ? (
        <SplitPartnerPicker partners={matches} selected={selected} onToggle={onToggle} all plain />
      ) : (
        <Text muted>No one called “{query.trim()}”.</Text>
      )}
    </Sheet>
  );
}

/** Selection state for the picker: a set of ids with a toggle. */
export function useSelection() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return { selected, toggle, clear: () => setSelected(new Set()) };
}
