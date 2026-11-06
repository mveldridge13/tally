import { createGroupSchema } from '@tally/shared';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View, type TextInputInstance } from 'react-native';

import { Gutter, HeroNav, HeroScreen, onDeepMuted, SectionTitle } from '@/components/dashboard';
import { GROUP_ICONS } from '@/components/friendly';
import { SplitPartnerPicker, useSelection } from '@/components/split-partners';
import { Button, Card, Notice, Text } from '@/components/ui';
import { CURRENCIES, isSupportedCurrency, type Currency } from '@/lib/currencies';
import { useAddMembers, useCreateGroup, useSplitPartners, useTallyData } from '@/lib/data';
import { useAfterTransition } from '@/lib/transitions';
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

const SUGGESTIONS = ['Holiday', 'Flatmates', 'Dinner club', 'Road trip', 'Household', 'Weekend away'];

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
        borderRadius: radius.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? c.focus : c.border,
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
    </Pressable>
  );
}

export default function NewGroupScreen() {
  const c = useColors();
  const { data } = useTallyData();
  const createGroup = useCreateGroup();
  const addMembers = useAddMembers();
  const { data: partners } = useSplitPartners();
  const people = useSelection();
  const [name, setName] = useState('');
  const myCurrency = data.me?.currency;
  const [currency, setCurrency] = useState<Currency>(isSupportedCurrency(myCurrency) ? myCurrency : 'USD');
  // Most groups use your usual currency, so the full list stays hidden until asked for.
  const [pickingCurrency, setPickingCurrency] = useState(false);
  const [icon, setIcon] = useState<string | null>(null);

  // Open the keyboard once the form has slid up, not during the animation.
  const nameRef = useRef<TextInputInstance>(null);
  useAfterTransition(() => nameRef.current?.focus());

  const parsed = createGroupSchema.safeParse({ name, currency });
  const initial = name.trim().slice(0, 1).toUpperCase();

  // Your default currency first, then the rest in the usual order.
  const currencies = [...CURRENCIES].sort((a, b) => Number(b === data.me?.currency) - Number(a === data.me?.currency));

  async function create() {
    if (!parsed.success || createGroup.isPending || addMembers.isPending) return;
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
    router.replace(`/group/${group.id}`);
  }

  const header = (
    <>
      <HeroNav mode="close" eyebrow="Groups" title="New group" />

      {/* Live preview of the group's avatar */}
      <View style={{ alignItems: 'center', marginTop: space.xl, gap: space.lg }}>
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: radius.xl,
            backgroundColor: icon || initial ? brand.accent : 'rgba(255,255,255,0.08)',
            borderWidth: icon || initial ? 0 : 1.5,
            borderStyle: 'dashed',
            borderColor: 'rgba(255,255,255,0.3)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text
            style={{
              fontSize: icon ? 44 : 36,
              fontWeight: '800',
              color: initial ? brand.onAccent : onDeepMuted,
            }}>
            {icon || initial || '?'}
          </Text>
        </View>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name your group"
          placeholderTextColor="rgba(255,255,255,0.4)"
          ref={nameRef}
          maxLength={60}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={create}
          selectionColor={brand.accent}
          cursorColor={brand.accent}
          accessibilityLabel="Group name"
          style={{
            fontSize: 30,
            fontWeight: '800',
            letterSpacing: -0.5,
            color: brand.onDeep,
            textAlign: 'center',
            alignSelf: 'stretch',
            padding: 0,
          }}
        />
        <Text variant="caption" color={onDeepMuted}>
          {currency} · {name.trim() ? 'Looks good' : 'A trip, a flat, a dinner club…'}
        </Text>
      </View>

      {/* Optional emoji instead of the first letter. Tap again to go back to the letter. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: space.lg, marginHorizontal: -space.xl }}
        contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.sm }}>
        {GROUP_ICONS.map((emoji) => {
          const on = icon === emoji;
          return (
            <Pressable
              key={emoji}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Icon ${emoji}`}
              onPress={() => setIcon(on ? null : emoji)}
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? brand.accent : 'rgba(255,255,255,0.1)',
              }}>
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );

  return (
    <HeroScreen header={header}>
      <Stack.Screen options={{ headerShown: false }} />

      {!name.trim() ? (
        <View style={{ gap: space.md }}>
          <SectionTitle title="Ideas" />
          <Gutter>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  onPress={() => setName(s)}
                  style={{
                    paddingVertical: space.sm,
                    paddingHorizontal: space.md,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.surface,
                  }}>
                  <Text variant="label">{s}</Text>
                </Pressable>
              ))}
            </View>
          </Gutter>
        </View>
      ) : null}

      {partners.length > 0 ? (
        <View style={{ gap: space.md }}>
          <SectionTitle title="People you split with" />
          <Gutter>
            <SplitPartnerPicker partners={partners} selected={people.selected} onToggle={people.toggle} />
            <Text variant="caption" muted>
              Tick anyone to add them straight away. They’ve been in a group with you before, so no invite is needed.
            </Text>
          </Gutter>
        </View>
      ) : null}

      <View style={{ gap: space.md }}>
        <SectionTitle
          title="Currency"
          action={pickingCurrency ? 'Done' : 'Change'}
          onAction={() => setPickingCurrency((v) => !v)}
        />
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
        <Card
          style={{
            flexDirection: 'row',
            gap: space.md,
            alignItems: 'flex-start',
          }}>
          <Text style={{ fontSize: 20 }}>👥</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{partners.length > 0 ? 'Anyone else? Invite them next' : 'Next: invite people'}</Text>
            <Text variant="caption" muted>
              You’ll be the owner. After creating the group, tap Invite to share a code with {partners.length > 0 ? 'anyone new' : 'friends'}.
            </Text>
          </View>
        </Card>
        {createGroup.isError ? <Notice>{createGroup.error.message}</Notice> : null}
        <Button
          label={
            people.selected.size > 0
              ? `Create group with ${people.selected.size} ${people.selected.size === 1 ? 'person' : 'people'}`
              : 'Create group'
          }
          onPress={create}
          disabled={!parsed.success}
          loading={createGroup.isPending || addMembers.isPending}
        />
      </Gutter>
    </HeroScreen>
  );
}
