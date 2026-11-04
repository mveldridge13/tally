import { centsToDecimalString, formatMoney, parseToCents } from '@tally/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Gutter, HeroNav, HeroScreen, onDeepMuted, SectionTitle } from '@/components/dashboard';
import { Avatar, Button, Card, Field, Notice, Text } from '@/components/ui';
import { PayIdCard } from '@/components/payid-card';
import { useMyId } from '@/lib/auth';
import { PAYID_CURRENCY, useCorrectSettlement, useNameOf, useRecordSettlement, useTallyData } from '@/lib/data';
import { brand, radius, space, useColors } from '@/theme';

function Party({ who, role }: { who: string; role: string }) {
  return (
    <View style={{ alignItems: 'center', gap: space.sm, flex: 1 }}>
      <Avatar name={who} size={52} color={brand.tintOnDeep} />
      <Text variant="label" color={brand.onDeep} numberOfLines={1}>
        {who}
      </Text>
      <Text variant="caption" color={onDeepMuted}>
        {role}
      </Text>
    </View>
  );
}

/** Records a repayment that happened outside the app. Never edits the original expenses. */
export default function SettleScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{
    groupId?: string;
    from?: string;
    to?: string;
    amount?: string;
    /** Set to correct an existing payment instead of recording a new one. */
    paymentId?: string;
  }>();
  const { data } = useTallyData();
  const recordSettlement = useRecordSettlement();
  const correctSettlement = useCorrectSettlement();
  const name = useNameOf();
  const myId = useMyId();

  // Correcting: everything comes from the existing payment.
  const editing = params.paymentId ? data.settlements.find((p) => p.id === params.paymentId) : undefined;
  const isEdit = !!params.paymentId;
  const groupId = editing?.groupId ?? params.groupId;
  const from = editing?.fromUserId ?? params.from;
  const to = editing?.toUserId ?? params.to;
  const group = data.groups.find((g) => g.id === groupId);
  const mutation = isEdit ? correctSettlement : recordSettlement;

  const suggested = isEdit ? 0 : Number(params.amount) || 0;
  const [text, setText] = useState(editing ? centsToDecimalString(editing.amount) : suggested ? centsToDecimalString(suggested) : '');
  const [note, setNote] = useState(editing?.note ?? '');

  let cents = 0;
  try {
    cents = text ? parseToCents(text) : 0;
  } catch {
    cents = NaN;
  }

  if (!group || !from || !to) {
    return (
      <HeroScreen header={<HeroNav mode="close" title={isEdit ? 'Correct payment' : 'Record a payment'} />}>
        <Stack.Screen options={{ headerShown: false }} />
        <Gutter>
          <Notice tone="info">{isEdit ? 'This payment was already changed or undone.' : 'There’s nothing to settle here.'}</Notice>
        </Gutter>
      </HeroScreen>
    );
  }

  const money = (v: number) => formatMoney(v, group.currency);
  const valid = Number.isFinite(cents) && cents > 0;
  // When you're the one paying in an AUD group, show the recipient's PayID to copy into your bank.
  const recipientPayId = group.currency === PAYID_CURRENCY && from === myId && to ? data.payIds[to] : undefined;
  const over = valid && suggested > 0 && cents > suggested;
  const partial = valid && suggested > 0 && cents < suggested;

  const unchanged = isEdit && editing && cents === editing.amount && note.trim() === (editing.note ?? '');

  function save() {
    if (!valid || !group || !from || !to) return;
    if (editing) {
      // The corrected payment gets a new id, so go back past the old payment's details screen.
      correctSettlement.mutate(
        { settlementId: editing.id, amount: cents, note },
        { onSuccess: (newId) => router.replace({ pathname: '/payment/[id]', params: { id: newId } }) },
      );
    } else {
      recordSettlement.mutate(
        { groupId: group.id, fromUserId: from, toUserId: to, amount: cents, note },
        { onSuccess: () => router.back() },
      );
    }
  }

  const quick = suggested
    ? [
        { label: `Full ${money(suggested)}`, value: suggested },
        {
          label: `Half ${money(Math.floor(suggested / 2))}`,
          value: Math.floor(suggested / 2),
        },
      ]
    : [];

  const header = (
    <>
      <HeroNav mode="close" eyebrow={group.name} title={isEdit ? 'Correct payment' : 'Record a payment'} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: space.xl,
        }}>
        <Party who={name(from)} role="pays" />
        <Text style={{ fontSize: 28, color: brand.accent }}>→</Text>
        <Party who={name(to)} role="receives" />
      </View>
      <View style={{ alignItems: 'center', marginTop: space.xl, gap: space.xs }}>
        <Text variant="label" color={onDeepMuted}>
          Amount in {group.currency}
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="0.00"
          placeholderTextColor="rgba(255,255,255,0.35)"
          keyboardType="decimal-pad"
          selectionColor={brand.accent}
          cursorColor={brand.accent}
          accessibilityLabel="Payment amount"
          style={{
            fontSize: 52,
            fontWeight: '800',
            letterSpacing: -1,
            color: brand.onDeep,
            minWidth: 160,
            textAlign: 'center',
            padding: 0,
            fontVariant: ['tabular-nums'],
          }}
        />
        {suggested ? (
          <Text variant="caption" color={onDeepMuted}>
            Outstanding: {money(suggested)}
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <HeroScreen header={header}>
      <Stack.Screen options={{ headerShown: false }} />

      {quick.length ? (
        <View style={{ gap: space.md }}>
          <SectionTitle title="Quick amounts" />
          <Gutter>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {quick.map((q) => {
                const selected = cents === q.value;
                return (
                  <Pressable
                    key={q.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setText(centsToDecimalString(q.value))}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: space.md,
                      borderRadius: radius.md,
                      borderWidth: selected ? 2 : 1,
                      borderColor: selected ? c.focus : c.border,
                      backgroundColor: selected ? c.surfaceAlt : c.surface,
                    }}>
                    <Text variant="label">{q.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Gutter>
        </View>
      ) : null}

      {recipientPayId && to ? (
        <Gutter>
          <PayIdCard name={name(to)} payId={recipientPayId} amount={valid ? { cents, currency: group.currency } : undefined} />
          <Text variant="caption" muted>
            Pay in your banking app, then record the payment here.
          </Text>
        </Gutter>
      ) : null}

      <Gutter>
        {over ? (
          <Notice>
            That’s more than the {money(suggested)} owed. {name(to)} would then owe {name(from) === 'You' ? 'you' : name(from)} the
            difference.
          </Notice>
        ) : null}
        {partial ? <Notice tone="info">A partial payment. {money(suggested - cents)} will still be outstanding.</Notice> : null}
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Bank transfer, cash at dinner"
          maxLength={280}
          returnKeyType="done"
        />
        {isEdit ? (
          <Notice tone="info">The original payment stays in the history, marked as corrected, so everyone can see what changed.</Notice>
        ) : null}
        <Card
          style={{
            flexDirection: 'row',
            gap: space.md,
            alignItems: 'flex-start',
          }}>
          <Text style={{ fontSize: 18 }}>ℹ</Text>
          <Text variant="caption" muted style={{ flex: 1 }}>
            Tally doesn’t move money. Record a payment once it’s been made in cash, by bank transfer or in another app. You can undo it
            later from Activity.
          </Text>
        </Card>
        {mutation.isError ? <Notice>{mutation.error.message}</Notice> : null}
        <Button
          label={isEdit ? 'Save correction' : 'Record payment'}
          onPress={save}
          disabled={!valid || !!unchanged}
          loading={mutation.isPending}
        />
      </Gutter>
    </HeroScreen>
  );
}
