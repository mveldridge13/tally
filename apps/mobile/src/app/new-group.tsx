import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createGroupSchema } from '@tally/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Gutter, HeroScreen, SectionTitle } from '@/components/dashboard';
import { SplitPartnerRow, SplitPartnerSheet, useSelection } from '@/components/split-partners';
import { QuickAddPeople } from '@/components/quick-add-people';
import { Button, Field, Notice, Text } from '@/components/ui';
import { CURRENCIES, isSupportedCurrency, type Currency } from '@/lib/currencies';
import { useAddGuest, useAddMembers, useCreateGroup, useSplitPartners, useTallyData } from '@/lib/data';
import { brand, radius, space, useColors } from '@/theme';

const CURRENCY_INFO: Record<Currency, { symbol: string; name: string }> = {
  AUD: { symbol: 'A$', name: 'Australian dollar' },
  USD: { symbol: 'US$', name: 'US dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British pound' },
  NZD: { symbol: 'NZ$', name: 'New Zealand dollar' },
  CAD: { symbol: 'CA$', name: 'Canadian dollar' },
  SGD: { symbol: 'S$', name: 'Singapore dollar' },
  INR: { symbol: '₹', name: 'Indian rupee' },
};

/** What the group is for. The emoji is saved as the group's icon; "Other" uses the name's first letter. */
const GROUP_TYPES = [
  { id: 'trip', label: 'Trip', icon: 'flight', emoji: '✈️', example: 'e.g. Bali 2027' },
  { id: 'home', label: 'Home', icon: 'home', emoji: '🏠', example: 'e.g. Our place' },
  { id: 'housemates', label: 'Housemates', icon: 'groups', emoji: '🛋️', example: 'e.g. Flat 4B' },
  { id: 'family', label: 'Family', icon: 'family-restroom', emoji: '👨‍👩‍👧', example: 'e.g. The Smiths' },
  { id: 'dining', label: 'Dining', icon: 'restaurant', emoji: '🍽️', example: 'e.g. Friday dinners' },
  { id: 'other', label: 'Other', icon: 'more-horiz', emoji: null, example: 'e.g. Book club' },
] as const;
type GroupType = (typeof GROUP_TYPES)[number];

function TypeTile({ type, selected, onPress }: { type: GroupType; selected: boolean; onPress: () => void }) {
  const c = useColors();
  const ink = selected ? brand.onDeep : c.primary;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={type.label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: '31.5%',
        alignItems: 'center',
        gap: space.xs,
        paddingVertical: space.lg,
        borderRadius: radius.lg,
        backgroundColor: selected ? brand.deep : c.surfaceAlt,
        opacity: pressed ? 0.75 : 1,
      })}>
      <MaterialIcons name={type.icon} size={26} color={ink} />
      <Text variant="label" color={ink} numberOfLines={1}>
        {type.label}
      </Text>
    </Pressable>
  );
}

function CurrencyCard({
  code,
  selected,
  onPress,
  wide = false,
}: {
  code: Currency;
  selected: boolean;
  onPress: () => void;
  /** Full width, for the collapsed view that only shows the chosen currency. */
  wide?: boolean;
}) {
  const c = useColors();
  const info = CURRENCY_INFO[code];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${info.name}, ${code}`}
      onPress={onPress}
      style={{
        width: wide ? '100%' : '48%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        // No outline: filled like the rest of the page's tiles. The chosen one is pale sage with a tick.
        borderRadius: radius.lg,
        backgroundColor: selected ? c.surfaceAlt : c.surface,
      }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.sm + 2,
          backgroundColor: selected ? c.focus : c.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text
          variant="label"
          color={selected ? brand.onDeep : c.text}
          style={{
            fontSize: info.symbol.length > 2 ? 12 : 16,
            fontWeight: '700',
          }}>
          {info.symbol}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="heading">{code}</Text>
        <Text variant="caption" muted numberOfLines={1}>
          {info.name}
        </Text>
      </View>
      {selected && !wide ? <MaterialIcons name="check" size={20} color={c.primary} /> : null}
      {wide ? <MaterialIcons name="expand-more" size={24} color={c.textMuted} /> : null}
    </Pressable>
  );
}

export default function NewGroupScreen() {
  const { data } = useTallyData();
  const createGroup = useCreateGroup();
  const addMembers = useAddMembers();
  const addGuest = useAddGuest();
  const { data: partners } = useSplitPartners();
  const people = useSelection();
  // People not in "People you split with", added by name (they join the group as guests).
  const [newPeople, setNewPeople] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const total = people.selected.size + newPeople.length;
  const [name, setName] = useState('');
  const myCurrency = data.me?.currency;
  const [currency, setCurrency] = useState<Currency>(isSupportedCurrency(myCurrency) ? myCurrency : 'USD');
  // Most groups use your usual currency, so the full list stays hidden until asked for.
  const [pickingCurrency, setPickingCurrency] = useState(false);
  const [type, setType] = useState<GroupType | null>(null);
  const [seeingAll, setSeeingAll] = useState(false);
  const icon = type?.emoji ?? null;

  // The name is optional once you've picked a type: a blank name becomes "Trip", "Family"…
  const finalName = name.trim() || (type && type.id !== 'other' ? type.label : '');
  const parsed = createGroupSchema.safeParse({ name: finalName, currency });

  // Your default currency first, then the rest in the usual order.
  const currencies = [...CURRENCIES].sort((a, b) => Number(b === data.me?.currency) - Number(a === data.me?.currency));

  async function create() {
    if (!parsed.success || createGroup.isPending || addMembers.isPending || addGuest.isPending) return;
    let group;
    try {
      group = await createGroup.mutateAsync({ ...parsed.data, icon });
    } catch {
      return; // shown below the form
    }
    const userIds = [...people.selected];
    if (userIds.length) {
      try {
        await addMembers.mutateAsync({ groupId: group.id, userIds });
      } catch (e) {
        // The group exists either way; open it so they can add people from there.
        Alert.alert('Group created, but nobody was added', e instanceof Error ? e.message : 'Please try adding them again from the group.');
      }
    }
    // A name typed but not yet added with the Add button still counts.
    const names = newName.trim() && !newPeople.includes(newName.trim()) ? [...newPeople, newName.trim()] : newPeople;
    const failed: string[] = [];
    for (const guest of names) {
      try {
        await addGuest.mutateAsync({ groupId: group.id, name: guest });
      } catch {
        failed.push(guest);
      }
    }
    if (failed.length) {
      Alert.alert(`Couldn’t add ${failed.join(', ')}`, 'The group was created. Add them from the group with Add people.');
    }
    router.replace(`/group/${group.id}`);
  }

  return (
    <View style={{ flex: 1 }}>
      <HeroScreen nav="close" title="New group" subtitle="Who are you splitting with?">
        <Stack.Screen options={{ headerShown: false }} />

        <View style={{ gap: space.md }}>
          <SectionTitle title="What’s it for?" />
          <Gutter>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.sm }}>
              {GROUP_TYPES.map((t) => (
                <TypeTile key={t.id} type={t} selected={type?.id === t.id} onPress={() => setType(type?.id === t.id ? null : t)} />
              ))}
            </View>
            <Field
              label={type && type.id !== 'other' ? 'Name (optional)' : 'Name'}
              value={name}
              onChangeText={setName}
              placeholder={type?.example ?? 'e.g. Bali 2027'}
              maxLength={60}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </Gutter>
        </View>

        {partners.length > 0 ? (
          <View style={{ gap: space.md }}>
            <SectionTitle title="People you split with" />
            <Gutter>
              <SplitPartnerRow
                partners={partners}
                selected={people.selected}
                onToggle={people.toggle}
                onSeeAll={() => setSeeingAll(true)}
              />
              <Text variant="caption" muted>
                Tap to add. No invite needed.
              </Text>
            </Gutter>
          </View>
        ) : null}

        <View style={{ gap: space.md }}>
          <SectionTitle title={partners.length > 0 ? 'Someone new' : 'Add people'} />
          <Gutter>
            <QuickAddPeople names={newPeople} onNamesChange={setNewPeople} draft={newName} onDraftChange={setNewName} />
          </Gutter>
        </View>

        <View style={{ gap: space.md }}>
          <SectionTitle title="Currency" action={pickingCurrency ? 'Done' : 'Change'} onAction={() => setPickingCurrency((v) => !v)} />
          <Gutter>
            {pickingCurrency ? (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  rowGap: space.sm,
                }}>
                {currencies.map((code) => (
                  <CurrencyCard
                    key={code}
                    code={code}
                    selected={currency === code}
                    onPress={() => {
                      setCurrency(code);
                      setPickingCurrency(false);
                    }}
                  />
                ))}
              </View>
            ) : (
              <CurrencyCard code={currency} selected wide onPress={() => setPickingCurrency(true)} />
            )}
            <Text variant="caption" muted>
              Every expense in this group uses this currency. It can’t be changed later.
            </Text>
          </Gutter>
        </View>

        <Gutter>
          {createGroup.isError ? <Notice>{createGroup.error.message}</Notice> : null}
          <Button
            label={total > 0 ? `Create group with ${total} ${total === 1 ? 'person' : 'people'}` : 'Create group'}
            onPress={create}
            disabled={!parsed.success}
            loading={createGroup.isPending || addMembers.isPending || addGuest.isPending}
          />
        </Gutter>
      </HeroScreen>

      <SplitPartnerSheet
        visible={seeingAll}
        onClose={() => setSeeingAll(false)}
        partners={partners}
        selected={people.selected}
        onToggle={people.toggle}
      />
    </View>
  );
}
