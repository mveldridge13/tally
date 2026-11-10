import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createGroupSchema } from '@tally/shared';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeroIconButton } from '@/components/dashboard';
import { Bouncy, buzz, Confetti } from '@/components/fun';
import { SplitPartnerSheet, useSelection } from '@/components/split-partners';
import { Avatar, Button, Notice, Text } from '@/components/ui';
import { CURRENCIES, isSupportedCurrency, type Currency } from '@/lib/currencies';
import { GROUP_TYPES, type GroupType } from '@/lib/group-types';
import { useAddGuest, useAddMembers, useCreateGroup, useSplitPartners, useTallyData } from '@/lib/data';
import { useMyId } from '@/lib/auth';
import { groupColor, radius, space, type as typeScale, useColors } from '@/theme';

const CURRENCY_INFO: Record<Currency, { symbol: string; name: string }> = {
  AUD: { symbol: 'A$', name: 'Australian dollars' },
  USD: { symbol: 'US$', name: 'US dollars' },
  EUR: { symbol: '€', name: 'Euros' },
  GBP: { symbol: '£', name: 'British pounds' },
  NZD: { symbol: 'NZ$', name: 'New Zealand dollars' },
  CAD: { symbol: 'CA$', name: 'Canadian dollars' },
  SGD: { symbol: 'S$', name: 'Singapore dollars' },
  INR: { symbol: '₹', name: 'Indian rupees' },
};

/** How many faces show on "Who's in?" before See all. */
const FIRST_FACES = 8;

function Dots({ step }: { step: number }) {
  const c = useColors();
  return (
    <View accessibilityLabel={`Step ${step + 1} of 3`} style={{ flexDirection: 'row', gap: 6 }}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          layout={LinearTransition}
          style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i <= step ? c.primary : c.border }}
        />
      ))}
    </View>
  );
}

function Face({
  id,
  name,
  size = 56,
  picked,
  onPress,
}: {
  id: string;
  name: string;
  size?: number;
  picked?: boolean;
  onPress?: () => void;
}) {
  const c = useColors();
  const face = (
    <View style={{ alignItems: 'center', gap: 6, width: size + 20 }}>
      <View style={{ opacity: picked ? 0.4 : 1 }}>
        <Avatar name={name} size={size} color={id.startsWith('new:') ? c.textMuted : groupColor(id)} />
        {picked ? (
          <View
            style={{
              position: 'absolute',
              right: -4,
              bottom: -4,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: c.primary,
              borderWidth: 2,
              borderColor: c.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <MaterialIcons name="check" size={14} color={c.onPrimary} />
          </View>
        ) : null}
      </View>
      <Text variant="label" numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
  if (!onPress) return face;
  return (
    <Bouncy accessibilityRole="checkbox" accessibilityState={{ checked: !!picked }} accessibilityLabel={name} onPress={onPress}>
      {face}
    </Bouncy>
  );
}

/**
 * New group in three quick steps: what it's for (tapping a type moves you on), who's in (faces hop
 * into the group as you pick them), and a name (suggested from the type). Then a small celebration.
 */
export default function NewGroupScreen() {
  // Opened from Add expense's group picker: when done, go back to that expense with this group.
  const { forExpense } = useLocalSearchParams<{ forExpense?: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const myId = useMyId();
  const { data } = useTallyData();
  const createGroup = useCreateGroup();
  const addMembers = useAddMembers();
  const addGuest = useAddGuest();
  const { data: partners } = useSplitPartners();
  const people = useSelection();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<GroupType | null>(null);
  // People not in "People you split with", added by name (they join the group as guests).
  const [newPeople, setNewPeople] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [name, setName] = useState('');
  const myCurrency = data.me?.currency;
  const [currency, setCurrency] = useState<Currency>(isSupportedCurrency(myCurrency) ? myCurrency : 'USD');
  const [pickingCurrency, setPickingCurrency] = useState(false);
  const [seeingAll, setSeeingAll] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [confetti, setConfetti] = useState(0);

  const total = people.selected.size + newPeople.length;
  const finalName = name.trim() || (type && type.id !== 'other' ? type.label : '');
  const parsed = createGroupSchema.safeParse({ name: finalName, currency });
  const busy = createGroup.isPending || addMembers.isPending || addGuest.isPending;
  const pickedPartners = partners.filter((p) => people.selected.has(p.id));
  const shownPartners = [...partners.slice(0, FIRST_FACES), ...partners.slice(FIRST_FACES).filter((p) => people.selected.has(p.id))];
  const meName = data.people[myId]?.name ?? 'You';

  const back = useCallback(() => {
    if (created || step === 0) router.back();
    else setStep((s) => s - 1);
    return true;
  }, [created, step]);

  // Android's back button goes back a step, not out of the form.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', back);
      return () => sub.remove();
    }, [back]),
  );

  function pickType(t: GroupType) {
    buzz.tap();
    setType(t);
    setName('');
    setTimeout(() => setStep(1), 320);
  }

  function addNew() {
    const n = newName.trim().slice(0, 60);
    if (n && !newPeople.some((x) => x.toLowerCase() === n.toLowerCase())) {
      buzz.tap();
      setNewPeople((list) => [...list, n]);
    }
    setNewName('');
  }

  async function create() {
    if (!parsed.success || busy) return;
    let group;
    try {
      group = await createGroup.mutateAsync({ ...parsed.data, icon: type?.emoji ?? null });
    } catch {
      return; // shown below the form
    }
    const userIds = [...people.selected];
    if (userIds.length) {
      try {
        await addMembers.mutateAsync({ groupId: group.id, userIds });
      } catch (e) {
        Alert.alert('Group created, but nobody was added', e instanceof Error ? e.message : 'Please try adding them again from the group.');
      }
    }
    const failed: string[] = [];
    for (const guest of newPeople) {
      try {
        await addGuest.mutateAsync({ groupId: group.id, name: guest });
      } catch {
        failed.push(guest);
      }
    }
    if (failed.length) Alert.alert(`Couldn’t add ${failed.join(', ')}`, 'The group was created. Add them from the group with Add people.');
    buzz.success();
    setCreated({ id: group.id, name: parsed.data.name });
    setConfetti((n) => n + 1);
  }

  let body: ReactNode;
  let footer: ReactNode = null;

  if (created) {
    const faces = [
      { id: myId, name: meName },
      ...pickedPartners.map((p) => ({ id: p.id, name: p.name })),
      ...newPeople.map((n) => ({ id: `new:${n}`, name: n })),
    ];
    body = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.lg }}>
        <Animated.View
          entering={ZoomIn.springify().damping(12)}
          style={{ width: 110, height: 110, borderRadius: 34, backgroundColor: c.warm, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 58 }}>{type?.emoji ?? created.name.slice(0, 1).toUpperCase()}</Text>
        </Animated.View>
        <Animated.View entering={ZoomIn.delay(100).springify().damping(14)}>
          <Text variant="title" style={{ fontSize: 28, lineHeight: 34, textAlign: 'center' }}>
            {created.name} is ready 🎉
          </Text>
        </Animated.View>
        <Text muted>
          {faces.length} {faces.length === 1 ? 'person' : 'people'} · {CURRENCY_INFO[currency].name}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: space.sm }}>
          {faces.slice(0, 10).map((f, i) => (
            <Animated.View
              key={f.id}
              entering={ZoomIn.delay(250 + i * 110)
                .springify()
                .damping(10)}
              style={{ marginLeft: i === 0 ? 0 : -10 }}>
              <View style={{ borderRadius: 30, borderWidth: 3, borderColor: c.bg }}>
                <Avatar name={f.name} size={54} color={f.id.startsWith('new:') ? c.textMuted : groupColor(f.id)} />
              </View>
            </Animated.View>
          ))}
        </View>
        {newPeople.length ? (
          <Text variant="caption" muted style={{ textAlign: 'center' }}>
            People you added by name can join later with an invite link.
          </Text>
        ) : null}
      </View>
    );
    footer = forExpense ? (
      <Button
        label="Back to your expense"
        onPress={() => router.dismissTo({ pathname: '/add-expense', params: { newGroupId: created.id } })}
      />
    ) : (
      <>
        <Button
          label="＋ Add the first expense"
          onPress={() => router.replace({ pathname: '/add-expense', params: { groupId: created.id } })}
        />
        <Button kind="secondary" label="Open the group" onPress={() => router.replace(`/group/${created.id}`)} />
      </>
    );
  } else if (step === 0) {
    body = (
      <View style={{ flex: 1, paddingHorizontal: space.lg, paddingBottom: space.lg }}>
        <Text variant="label" muted>
          New group
        </Text>
        <Text variant="display" style={{ marginTop: space.xs, marginBottom: space.lg }}>
          What’s it for?
        </Text>
        <View style={{ gap: space.md }}>
          {[0, 1, 2].map((row) => (
            <View key={row} style={{ flexDirection: 'row', gap: space.md, height: 96 }}>
              {GROUP_TYPES.slice(row * 2, row * 2 + 2).map((t, i) => {
                const chosen = type?.id === t.id;
                const faded = type && !chosen;
                const warm = (row + i) % 2 === 0;
                return (
                  <Animated.View
                    key={t.id}
                    entering={FadeInDown.delay((row * 2 + i) * 50)
                      .springify()
                      .damping(16)}
                    style={{ flex: 1 }}>
                    <Bouncy
                      grow
                      accessibilityRole="radio"
                      accessibilityState={{ selected: chosen }}
                      accessibilityLabel={t.label}
                      onPress={() => pickType(t)}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: space.xs,
                        borderRadius: radius.xl - 8,
                        backgroundColor: chosen ? c.primary : warm ? c.warm : c.surfaceAlt,
                        opacity: faded ? 0.35 : 1,
                        transform: [{ scale: chosen ? 1.04 : 1 }],
                      }}>
                      {t.emoji ? (
                        <Text style={{ fontSize: 26, lineHeight: 32 }}>{t.emoji}</Text>
                      ) : (
                        <MaterialIcons name="auto-awesome" size={26} color={chosen ? c.onPrimary : c.primary} />
                      )}
                      <Text variant="heading" color={chosen ? c.onPrimary : c.text} style={{ fontWeight: '700' }}>
                        {t.label}
                      </Text>
                    </Bouncy>
                  </Animated.View>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    );
  } else if (step === 1) {
    const huddle = [
      { id: myId, name: 'You' },
      ...pickedPartners.map((p) => ({ id: p.id, name: p.name })),
      ...newPeople.map((n) => ({ id: `new:${n}`, name: n })),
    ];
    body = (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg }}>
        <View>
          <Text variant="label" muted>
            {type?.emoji ? `${type.emoji} ` : ''}
            {type?.label}
          </Text>
          <Text variant="display" style={{ marginTop: space.xs }}>
            Who’s in?
          </Text>
        </View>
        <View style={{ gap: space.sm }}>
          <Animated.View
            layout={LinearTransition.springify().damping(16)}
            style={{
              minHeight: 118,
              borderRadius: radius.xl,
              backgroundColor: c.surfaceAlt,
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignContent: 'center',
              padding: space.lg,
              gap: space.sm,
            }}>
            {huddle.map((f) => (
              <Animated.View key={f.id} entering={ZoomIn.springify().damping(11)} layout={LinearTransition.springify()}>
                {f.id.startsWith('new:') ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${f.name}`}
                    onPress={() => setNewPeople((l) => l.filter((x) => `new:${x}` !== f.id))}>
                    <Face id={f.id} name={f.name} size={48} />
                  </Pressable>
                ) : (
                  <Face id={f.id} name={f.name} size={48} />
                )}
              </Animated.View>
            ))}
          </Animated.View>
          <Text variant="caption" muted style={{ textAlign: 'center' }}>
            {huddle.length === 1 ? 'Just you so far. Tap people below.' : `${huddle.length} people in the group`}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg, justifyContent: 'space-between' }}>
          {shownPartners.map((p) => (
            <View key={p.id} style={{ width: '25%', alignItems: 'center' }}>
              <Face
                id={p.id}
                name={p.name.split(' ')[0] ?? p.name}
                picked={people.selected.has(p.id)}
                onPress={() => {
                  buzz.tap();
                  people.toggle(p.id);
                }}
              />
            </View>
          ))}
          <View style={{ width: '25%', alignItems: 'center' }}>
            <Bouncy accessibilityRole="button" accessibilityLabel="Add someone new" onPress={() => setAdding(true)}>
              <View style={{ alignItems: 'center', gap: 6, width: 76 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    borderWidth: 2,
                    borderStyle: 'dashed',
                    borderColor: c.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <MaterialIcons name="add" size={26} color={c.primary} />
                </View>
                <Text variant="label" color={c.primary}>
                  Someone new
                </Text>
              </View>
            </Bouncy>
          </View>
          {/* Fill the last row so faces stay in columns. */}
          {Array.from({ length: (4 - ((shownPartners.length + 1) % 4)) % 4 }, (_, i) => (
            <View key={`gap-${i}`} style={{ width: '25%' }} />
          ))}
        </View>
        {partners.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => setSeeingAll(true)} hitSlop={8} style={{ alignSelf: 'center' }}>
            <Text variant="label" color={c.focus}>
              See all {partners.length} people you split with ›
            </Text>
          </Pressable>
        ) : null}

        {adding ? (
          <Animated.View entering={FadeIn} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={addNew}
              placeholder="Their name"
              placeholderTextColor={c.textMuted}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              submitBehavior="submit"
              maxLength={60}
              selectionColor={c.focus}
              cursorColor={c.focus}
              accessibilityLabel="Name of someone new"
              style={{
                ...typeScale.body,
                flex: 1,
                color: c.text,
                backgroundColor: c.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: c.border,
                paddingHorizontal: space.lg,
                minHeight: 50,
              }}
            />
            <Button size="small" label="Add" onPress={addNew} disabled={!newName.trim()} />
          </Animated.View>
        ) : null}
      </ScrollView>
    );
    footer = (
      <Button label={total ? `That’s everyone (${total + 1})` : 'Pick at least one person'} onPress={() => setStep(2)} disabled={!total} />
    );
  } else {
    const placeholder = type && type.id !== 'other' ? type.label : 'Group name';
    body = (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 140, gap: space.lg }}>
        <View>
          <Text variant="label" muted>
            {type?.emoji ? `${type.emoji} ` : ''}
            {type?.label} · {total + 1} people
          </Text>
          <Text variant="display" style={{ marginTop: space.xs }}>
            Call it…
          </Text>
        </View>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={placeholder}
          placeholderTextColor={c.textMuted}
          maxLength={60}
          autoCapitalize="words"
          returnKeyType="done"
          selectionColor={c.focus}
          cursorColor={c.focus}
          accessibilityLabel="Group name"
          style={{
            fontSize: 26,
            fontWeight: '700',
            color: c.text,
            backgroundColor: c.surface,
            borderRadius: radius.lg,
            borderWidth: 2,
            borderColor: c.border,
            paddingHorizontal: space.lg,
            paddingVertical: space.lg,
          }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {type?.names.map((n) => {
            const on = name.trim() === n;
            return (
              <Bouncy
                key={n}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  buzz.tap();
                  setName(n);
                }}
                style={{
                  paddingVertical: space.sm + 1,
                  paddingHorizontal: space.md + 2,
                  borderRadius: radius.pill,
                  backgroundColor: on ? c.primary : c.surfaceAlt,
                }}>
                <Text variant="label" color={on ? c.onPrimary : c.text}>
                  {n}
                </Text>
              </Bouncy>
            );
          })}
        </View>

        <View style={{ gap: space.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Currency: ${CURRENCY_INFO[currency].name}. Change`}
            onPress={() => setPickingCurrency((v) => !v)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: space.lg,
              borderRadius: radius.lg,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.border,
            }}>
            <Text>
              {CURRENCY_INFO[currency].symbol} · {CURRENCY_INFO[currency].name}
            </Text>
            <Text variant="label" color={c.focus}>
              {pickingCurrency ? 'Done' : 'Change'}
            </Text>
          </Pressable>
          {pickingCurrency ? (
            <Animated.View entering={FadeIn} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {[...CURRENCIES]
                .sort((a, b) => Number(b === myCurrency) - Number(a === myCurrency))
                .map((code) => (
                  <Bouncy
                    key={code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: code === currency }}
                    onPress={() => {
                      setCurrency(code);
                      setPickingCurrency(false);
                    }}
                    style={{
                      paddingVertical: space.sm,
                      paddingHorizontal: space.md,
                      borderRadius: radius.pill,
                      backgroundColor: code === currency ? c.primary : c.surfaceAlt,
                    }}>
                    <Text variant="label" color={code === currency ? c.onPrimary : c.text}>
                      {CURRENCY_INFO[code].symbol} {code}
                    </Text>
                  </Bouncy>
                ))}
            </Animated.View>
          ) : null}
          <Text variant="caption" muted>
            Every expense in this group uses this currency. It can’t be changed later.
          </Text>
        </View>
        {createGroup.isError ? <Notice>{createGroup.error.message}</Notice> : null}
      </ScrollView>
    );
    footer = (
      <Button label={finalName ? `Create ${finalName}` : 'Give it a name'} onPress={create} disabled={!parsed.success} loading={busy} />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View
          style={{
            paddingTop: insets.top + space.md,
            paddingHorizontal: space.lg,
            paddingBottom: space.md,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          {created ? <View style={{ width: 40 }} /> : <HeroIconButton icon={step === 0 ? 'close' : 'back'} onPress={back} />}
          {created ? null : <Dots step={step} />}
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1 }}>{body}</View>
        {footer ? (
          <View
            style={{
              paddingHorizontal: space.lg,
              paddingTop: space.md,
              paddingBottom: insets.bottom + space.lg,
              gap: space.sm,
              backgroundColor: c.bg,
            }}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <SplitPartnerSheet
        visible={seeingAll}
        onClose={() => setSeeingAll(false)}
        partners={partners}
        selected={people.selected}
        onToggle={people.toggle}
      />
      <Confetti fire={confetti} />
    </View>
  );
}
