import {
  centsToDecimalString,
  computeSplit,
  FULL_PERCENT_BPS,
  formatMoney,
  parseToCents,
  SplitError,
  type SplitInput,
  type SplitMethod,
} from '@tally/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View, type TextInputInstance } from 'react-native';

import { Gutter, HeroIconButton, HeroNav, HeroScreen, onDeepMuted } from '@/components/dashboard';
import { GroupIcon, Sheet } from '@/components/friendly';
import { Avatar, Button, Card, Divider, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { useCreateExpense, useNameOf, useTallyData, useUpdateExpense, type Expense } from '@/lib/data';
import { useAfterTransition } from '@/lib/transitions';
import { brand, groupColor, radius, space, type, useColors } from '@/theme';

const METHODS: { id: SplitMethod; label: string; hint: string }[] = [
  { id: 'equal', label: 'Equally', hint: 'Everyone ticked pays the same.' },
  { id: 'exact', label: 'Amounts', hint: 'Enter how much each person owes.' },
  {
    id: 'percentage',
    label: 'Percent',
    hint: 'Enter each person’s percentage. They must add up to 100%.',
  },
  {
    id: 'shares',
    label: 'Shares',
    hint: 'Someone with 2 shares pays twice as much as someone with 1.',
  },
];

type Preview = { ok: true; shares: { userId: string; amount: number }[] } | { ok: false; error: string };

function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ??
      currency
    );
  } catch {
    return currency;
  }
}

/** Form state derived from a saved expense, so editing shows exactly what was entered. */
function initialFromExpense(expense: Expense | undefined, memberIds: string[]) {
  if (!expense) return { included: {}, values: {} };
  const inSplit = new Map(expense.splits.map((s) => [s.userId, s]));
  const included: Record<string, boolean> = {};
  const values: Record<string, string> = {};
  for (const id of memberIds) {
    const s = inSplit.get(id);
    included[id] = !!s;
    if (!s) continue;
    if (expense.method === 'exact') values[id] = centsToDecimalString(s.amount);
    if (expense.method === 'percentage' && s.weight != null) values[id] = centsToDecimalString(s.weight).replace(/\.00$/, '');
    if (expense.method === 'shares' && s.weight != null) values[id] = String(s.weight);
  }
  return { included, values };
}

// ─── Small themed controls ───────────────────────────────────────────────────

/** Avatar + name pill used to pick the payer. */
function PersonPill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingLeft: space.xs,
        paddingRight: space.md,
        paddingVertical: space.xs,
        borderRadius: radius.pill,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? c.focus : c.border,
        backgroundColor: selected ? c.surfaceAlt : c.surface,
      }}>
      <Avatar name={label} size={30} color={selected ? c.focus : undefined} />
      <Text variant="label">{label}</Text>
    </Pressable>
  );
}

/** Four-way segmented control for the split method. */
function Segmented({ value, onChange }: { value: SplitMethod; onChange: (m: SplitMethod) => void }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: c.surfaceAlt,
        borderRadius: radius.md,
        padding: 4,
        gap: 4,
      }}>
      {METHODS.map((m) => {
        const selected = m.id === value;
        return (
          <Pressable
            key={m.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(m.id)}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: space.sm + 2,
              borderRadius: radius.sm + 2,
              backgroundColor: selected ? c.surface : 'transparent',
              elevation: selected ? 1 : 0,
            }}>
            <Text variant="label" color={selected ? c.text : c.textMuted}>
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Round tick for including someone in the split. */
function Tick({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`Include ${label}`}
      onPress={onPress}
      hitSlop={8}
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
      {on ? (
        <Text
          style={{
            color: brand.onDeep,
            fontSize: 14,
            fontWeight: '800',
            lineHeight: 16,
          }}>
          ✓
        </Text>
      ) : null}
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ExpenseFormScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{
    groupId?: string;
    expenseId?: string;
  }>();
  const myId = useMyId();
  const { data } = useTallyData();
  const name = useNameOf();

  const editing = data.expenses.find((e) => e.id === params.expenseId);
  const isEdit = !!params.expenseId;
  const groups = data.groups;

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const mutation = isEdit ? updateExpense : createExpense;

  const [groupId, setGroupId] = useState(editing?.groupId ?? params.groupId ?? groups[0]?.id ?? '');
  const group = groups.find((g) => g.id === groupId);
  // When editing, also list anyone in the original split who has since left the group.
  const members = useMemo(() => {
    const ids = [...(group?.memberIds ?? [])];
    for (const s of editing?.splits ?? []) if (!ids.includes(s.userId)) ids.push(s.userId);
    return ids;
  }, [group, editing]);

  const initial = useMemo(() => initialFromExpense(editing, members), [editing, members]);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [amountText, setAmountText] = useState(editing ? centsToDecimalString(editing.amount) : '');
  const [payerId, setPayerId] = useState(editing?.payerId ?? myId);
  const [method, setMethod] = useState<SplitMethod>(editing?.method ?? 'equal');
  const [included, setIncluded] = useState<Record<string, boolean>>(initial.included);
  const [values, setValues] = useState<Record<string, string>>(initial.values);
  const [sheet, setSheet] = useState<'split' | 'group' | null>(null);

  // Open the keypad once the form has slid up, not during the animation.
  const amountRef = useRef<TextInputInstance>(null);
  useAfterTransition(() => amountRef.current?.focus(), !isEdit);

  const isIncluded = (id: string) => included[id] ?? true;
  const participantIds = members.filter(isIncluded);
  const participantKey = participantIds.join(',');

  const amount = useMemo(() => {
    try {
      return amountText ? parseToCents(amountText) : 0;
    } catch {
      return NaN;
    }
  }, [amountText]);

  const splitInput = useMemo((): SplitInput | string => {
    try {
      switch (method) {
        case 'equal':
          return { method, participants: participantIds };
        case 'exact':
          return {
            method,
            shares: participantIds.map((userId) => ({
              userId,
              amount: parseToCents(values[userId] || '0'),
            })),
          };
        case 'percentage':
          // "33.33" -> 3333 basis points, using the same exact decimal parser as money.
          return {
            method,
            shares: participantIds.map((userId) => ({
              userId,
              basisPoints: parseToCents(values[userId] || '0'),
            })),
          };
        case 'shares':
          return {
            method,
            shares: participantIds.map((userId) => ({
              userId,
              units: Number.parseInt(values[userId] || '1', 10),
            })),
          };
      }
    } catch {
      return 'Check the numbers you entered.';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantKey, method, values]);

  const preview: Preview = useMemo(() => {
    if (!Number.isFinite(amount)) return { ok: false, error: 'Enter a valid amount, like 12.50.' };
    if (amount <= 0) return { ok: false, error: 'Enter an amount.' };
    if (typeof splitInput === 'string') return { ok: false, error: splitInput };
    try {
      return { ok: true, shares: computeSplit(amount, splitInput) };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof SplitError ? e.message : 'This split doesn’t add up.',
      };
    }
  }, [amount, splitInput]);

  /** "€12.50 left to assign" / "20% left" for exact and percentage splits. */
  const remaining = useMemo(() => {
    if (typeof splitInput === 'string' || !group) return null;
    if (splitInput.method === 'exact' && Number.isFinite(amount)) {
      const left = amount - splitInput.shares.reduce((a, s) => a + s.amount, 0);
      if (left === 0) return null;
      return left > 0 ? `${formatMoney(left, group.currency)} left to assign` : `${formatMoney(-left, group.currency)} too much assigned`;
    }
    if (splitInput.method === 'percentage') {
      const left = FULL_PERCENT_BPS - splitInput.shares.reduce((a, s) => a + s.basisPoints, 0);
      if (left === 0) return null;
      const pct = centsToDecimalString(Math.abs(left)).replace(/\.00$/, '');
      return left > 0 ? `${pct}% left to assign` : `${pct}% too much assigned`;
    }
    return null;
  }, [splitInput, amount, group]);

  const title = isEdit ? 'Edit expense' : 'New expense';
  if (isEdit && !editing) {
    return (
      <HeroScreen header={<HeroNav mode="close" title={title} />}>
        <Stack.Screen options={{ headerShown: false }} />
        <Gutter>
          <Notice tone="info">This expense no longer exists.</Notice>
        </Gutter>
      </HeroScreen>
    );
  }

  // Why Save is disabled, in plain language.
  const blocker = !group
    ? 'Choose a group'
    : !amountText
      ? 'Enter an amount'
      : !preview.ok
        ? (remaining ?? preview.error)
        : !description.trim()
          ? 'Add a description'
          : null;
  const canSave = !blocker && !mutation.isPending;

  function save() {
    if (!group || typeof splitInput === 'string' || !preview.ok) return;
    const input = {
      description: description.trim(),
      amount,
      payerId,
      split: splitInput,
      occurredAt: editing?.occurredAt ?? new Date().toISOString(),
    };
    if (editing) updateExpense.mutate({ ...input, expenseId: editing.id }, { onSuccess: () => router.back() });
    else createExpense.mutate({ ...input, groupId: group.id }, { onSuccess: () => router.back() });
  }

  const payerLabel = payerId === myId ? 'you' : name(payerId);
  const n = participantIds.length;
  const methodWords: Record<SplitMethod, string> = {
    equal: 'equally',
    exact: 'by amounts',
    percentage: 'by percentage',
    shares: 'by shares',
  };
  const splitLine =
    method === 'equal' && preview.ok && group && n > 0
      ? `Split equally between ${n} · ${formatMoney(Math.floor(amount / n), group.currency)} each`
      : `Split ${methodWords[method]} between ${n} ${n === 1 ? 'person' : 'people'}`;
  // Only flag split problems here; a missing amount or description is obvious on the form.
  const splitProblem = amountText && Number.isFinite(amount) && amount > 0 && !preview.ok ? (remaining ?? preview.error) : null;
  const canPickGroup = !isEdit && !params.groupId && groups.length > 1;

  const header = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
        <HeroIconButton icon="close" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={canPickGroup ? `Group: ${group?.name ?? 'none'}. Change group` : `Group: ${group?.name ?? 'none'}`}
          disabled={!canPickGroup}
          onPress={() => setSheet('group')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingVertical: 6,
            paddingLeft: 6,
            paddingRight: space.md,
            borderRadius: radius.pill,
            backgroundColor: 'rgba(255,255,255,0.1)',
          }}>
          {group ? <GroupIcon group={group} size={26} /> : null}
          <Text variant="label" color={brand.onDeep} numberOfLines={1} style={{ maxWidth: 180 }}>
            {group ? group.name : 'Choose a group'}
            {canPickGroup ? '  ▾' : ''}
          </Text>
        </Pressable>
        <View style={{ width: 40 }} />
      </View>

      {/* Big amount entry */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: space.xxl }}>
        <Text style={{ fontSize: 40, fontWeight: '700', color: onDeepMuted, marginRight: space.xs }}>
          {group ? currencySymbol(group.currency) : ''}
        </Text>
        <TextInput
          value={amountText}
          onChangeText={setAmountText}
          placeholder="0.00"
          placeholderTextColor="rgba(255,255,255,0.35)"
          ref={amountRef}
          keyboardType="decimal-pad"
          selectionColor={brand.accent}
          cursorColor={brand.accent}
          accessibilityLabel={`Amount${group ? ` in ${group.currency}` : ''}`}
          style={{
            fontSize: 56,
            fontWeight: '800',
            letterSpacing: -1,
            color: brand.onDeep,
            minWidth: 120,
            textAlign: 'center',
            padding: 0,
            fontVariant: ['tabular-nums'],
          }}
        />
      </View>

      {/* Description */}
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="What was it for?"
        placeholderTextColor="rgba(255,255,255,0.5)"
        maxLength={120}
        selectionColor={brand.accent}
        cursorColor={brand.accent}
        accessibilityLabel="What was it for?"
        style={{
          ...type.body,
          fontSize: 18,
          marginTop: space.xl,
          color: brand.onDeep,
          backgroundColor: 'rgba(255,255,255,0.08)',
          borderRadius: radius.lg,
          paddingHorizontal: space.lg,
          paddingVertical: space.md + 2,
          textAlign: 'center',
        }}
      />
    </>
  );

  return (
    <HeroScreen header={header}>
      <Stack.Screen options={{ headerShown: false }} />

      <Gutter>
        {/* Who paid and how it's split, in one line. Tap to change. */}
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Change who paid and how it's split"
          onPress={() => setSheet('split')}
          android_ripple={{ color: c.surfaceAlt }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            padding: space.lg,
            borderRadius: radius.lg,
            backgroundColor: c.surfaceAlt,
            borderWidth: splitProblem ? 1.5 : 0,
            borderColor: c.owe,
            overflow: 'hidden',
          }}>
          <Avatar name={name(payerId)} size={40} color={groupColor(payerId)} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">Paid by {payerLabel}</Text>
            <Text variant="caption" muted numberOfLines={2}>
              {splitLine}
            </Text>
          </View>
          <Text muted style={{ fontSize: 22 }}>
            ›
          </Text>
        </Pressable>
        {splitProblem ? (
          <Text variant="label" color={c.owe}>
            {splitProblem}. Tap above to fix it.
          </Text>
        ) : null}
      </Gutter>

      <Gutter>
        {mutation.isError ? <Notice>{mutation.error.message}</Notice> : null}
        <Button label={isEdit ? 'Save changes' : 'Save'} onPress={save} disabled={!canSave} loading={mutation.isPending} />
        {blocker && !splitProblem ? (
          <Text variant="caption" muted style={{ textAlign: 'center' }}>
            {blocker}
          </Text>
        ) : null}
      </Gutter>

      {/* Who paid and how to split it */}
      <Sheet
        visible={sheet === 'split'}
        onClose={() => setSheet(null)}
        footer={
          <>
            {remaining ? (
              <Text variant="label" color={c.owe} style={{ textAlign: 'center' }}>
                {remaining}
              </Text>
            ) : null}
            <Button label="Done" onPress={() => setSheet(null)} />
          </>
        }>
        <View style={{ gap: space.sm }}>
          <Text variant="heading">Paid by</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {members.map((id) => (
              <PersonPill key={id} label={id === myId ? 'You' : name(id)} selected={payerId === id} onPress={() => setPayerId(id)} />
            ))}
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <Text variant="heading">Split</Text>
          <Segmented
            value={method}
            onChange={(m) => {
              setMethod(m);
              setValues({});
            }}
          />
          <Text variant="caption" muted>
            {METHODS.find((m) => m.id === method)?.hint}
          </Text>
          <Card style={{ paddingVertical: space.xs }}>
            {members.map((id, i) => {
              const on = isIncluded(id);
              const share = preview.ok ? preview.shares.find((s) => s.userId === id) : undefined;
              return (
                <View key={id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, opacity: on ? 1 : 0.55 }}>
                    <Tick on={on} label={name(id)} onPress={() => setIncluded((s) => ({ ...s, [id]: !on }))} />
                    <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
                      {id === myId ? 'You' : name(id)}
                    </Text>
                    {method !== 'equal' && on ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: c.surfaceAlt,
                          borderRadius: radius.sm,
                          paddingHorizontal: space.sm,
                        }}>
                        <TextInput
                          value={values[id] ?? ''}
                          onChangeText={(v) => setValues((s) => ({ ...s, [id]: v }))}
                          placeholder={method === 'shares' ? '1' : '0'}
                          placeholderTextColor={c.textMuted}
                          keyboardType={method === 'shares' ? 'number-pad' : 'decimal-pad'}
                          selectionColor={c.focus}
                          accessibilityLabel={`${name(id)} ${method === 'percentage' ? 'percentage' : method === 'shares' ? 'shares' : 'amount'}`}
                          style={{ ...type.body, color: c.text, width: 64, textAlign: 'right', paddingVertical: space.sm }}
                        />
                        {method === 'percentage' ? <Text muted> %</Text> : null}
                      </View>
                    ) : null}
                    <Text
                      variant="label"
                      color={share ? c.text : c.textMuted}
                      style={{ width: 80, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                      {share && group ? formatMoney(share.amount, group.currency) : on ? '—' : 'not in'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </View>
      </Sheet>

      {/* Which group (only when starting from Home with more than one group) */}
      <Sheet visible={sheet === 'group'} onClose={() => setSheet(null)} title="Which group?">
        <View style={{ gap: space.sm }}>
          {groups.map((g) => (
            <Pressable
              key={g.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: g.id === groupId }}
              onPress={() => {
                setGroupId(g.id);
                setPayerId(myId);
                setIncluded({});
                setValues({});
                setSheet(null);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                padding: space.md,
                borderRadius: radius.lg,
                borderWidth: g.id === groupId ? 2 : 1,
                borderColor: g.id === groupId ? c.focus : c.border,
                backgroundColor: c.surface,
              }}>
              <GroupIcon group={g} size={40} />
              <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
                {g.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </HeroScreen>
  );
}
