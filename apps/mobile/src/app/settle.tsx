import { centsToDecimalString, formatMoney, parseToCents } from '@tally/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Gutter, HeroScreen } from '@/components/dashboard';
import { Bouncy, buzz, Confetti, MoneyFlow, SlideToConfirm } from '@/components/fun';
import { Button, Field, Notice, Text } from '@/components/ui';
import { PayIdCard } from '@/components/payid-card';
import { useMyId } from '@/lib/auth';
import { PAYID_CURRENCY, useCorrectSettlement, useNameOf, useRecordSettlement, useTallyData } from '@/lib/data';
import { radius, space, useColors } from '@/theme';

function AmountChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Bouncy
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        paddingVertical: space.sm + 2,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        backgroundColor: selected ? c.primary : c.surfaceAlt,
      }}>
      <Text variant="label" color={selected ? c.onPrimary : c.text} style={{ fontVariant: ['tabular-nums'] }}>
        {label}
      </Text>
    </Bouncy>
  );
}

/**
 * Pay someone back: "Pay Leo back $18.25", slide when it's done, confetti.
 * Records a repayment that happened outside the app; Tally never moves money and never edits the
 * original expenses. With `paymentId` it corrects an existing payment instead (plain form, Save button).
 */
export default function SettleScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
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
  // The full amount is filled in; other amounts and a note are one tap away.
  const [changing, setChanging] = useState(isEdit || !suggested);
  const [noting, setNoting] = useState(!!editing?.note);
  const [paid, setPaid] = useState<number | null>(null);
  const [confetti, setConfetti] = useState(0);

  let cents = 0;
  try {
    cents = text ? parseToCents(text) : 0;
  } catch {
    cents = NaN;
  }

  if (!group || !from || !to) {
    return (
      <HeroScreen nav="close" title={isEdit ? 'Correct payment' : 'Pay back'}>
        <Stack.Screen options={{ headerShown: false }} />
        <Gutter>
          <Notice tone="info">{isEdit ? 'This payment was already changed or undone.' : 'There’s nothing to settle here.'}</Notice>
        </Gutter>
      </HeroScreen>
    );
  }

  const money = (v: number) => formatMoney(v, group.currency);
  const valid = Number.isFinite(cents) && cents > 0;
  const fromName = from === myId ? 'You' : name(from);
  const toName = to === myId ? 'You' : name(to);
  // When you're paying the group owner in an AUD group, show their PayID to copy into your bank.
  // Only the owner's PayID is shared; members' stay private.
  const recipientPayId =
    group.currency === PAYID_CURRENCY && from === myId && to && group.roles[to] === 'owner' ? data.payIds[to] : undefined;
  const over = valid && suggested > 0 && cents > suggested;
  const partial = valid && suggested > 0 && cents < suggested;
  const unchanged = isEdit && editing && cents === editing.amount && note.trim() === (editing.note ?? '');
  // A payment counts straight away only when the receiver records it, or the receiver is a guest
  // (no account to confirm with). Otherwise it waits for the receiver to confirm (the database decides;
  // this mirrors it for the wording).
  const needsConfirm = to !== myId && !data.people[to]?.isGuest;
  const receiver = name(to);

  const title = isEdit
    ? 'Correct payment'
    : from === myId
      ? `Pay ${toName} back`
      : to === myId
        ? `${fromName} paid you back`
        : `${fromName} paid ${toName}`;

  function save() {
    if (!valid || !group || !from || !to) return;
    if (editing) {
      // The corrected payment gets a new id, so go back past the old payment's details screen.
      correctSettlement.mutate(
        { settlementId: editing.id, amount: cents, note },
        {
          // A correction that needs confirming is pending, so it has no details screen yet: go back.
          onSuccess: (newId) => (needsConfirm ? router.back() : router.replace({ pathname: '/payment/[id]', params: { id: newId } })),
        },
      );
    } else {
      recordSettlement.mutate(
        { groupId: group.id, fromUserId: from, toUserId: to, amount: cents, note },
        {
          onSuccess: () => {
            buzz.success();
            setPaid(cents);
            // Confetti once it actually counts; a payment waiting for confirmation gets a calmer screen.
            if (!needsConfirm) setConfetti((n) => n + 1);
          },
        },
      );
    }
  }

  // Done: the celebration.
  if (paid != null && needsConfirm) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, paddingTop: insets.top + space.xl, gap: space.md }}>
          <Animated.View
            entering={ZoomIn.springify().damping(12)}
            style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 52 }}>⏳</Text>
          </Animated.View>
          <Animated.View entering={ZoomIn.delay(120).springify().damping(14)}>
            <Text variant="title" style={{ textAlign: 'center', fontSize: 28, lineHeight: 34 }}>
              Sent to {receiver} to confirm
            </Text>
          </Animated.View>
          <Text muted style={{ textAlign: 'center' }}>
            {money(paid)} · {group.icon ? `${group.icon} ` : ''}
            {group.name}
          </Text>
          <Text variant="caption" muted style={{ textAlign: 'center' }}>
            It counts once {receiver} confirms it arrived. We’ve let them know.
          </Text>
        </View>
        <View style={{ padding: space.lg, paddingBottom: insets.bottom + space.lg }}>
          <Button label="Done" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  if (paid != null) {
    const square = suggested > 0 && paid >= suggested;
    const other = from === myId ? toName : to === myId ? fromName : null;
    const headline = square
      ? other
        ? `You and ${other} are square 🎉`
        : `${fromName} and ${toName} are square 🎉`
      : `${money(paid)} paid to ${to === myId ? 'you' : toName} 👏`;
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, paddingTop: insets.top + space.xl, gap: space.md }}>
          <Animated.View
            entering={ZoomIn.springify().damping(12)}
            style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: c.warm, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 56, fontWeight: '800' }} color={c.primary}>
              ✓
            </Text>
          </Animated.View>
          <Animated.View entering={ZoomIn.delay(120).springify().damping(14)}>
            <Text variant="title" style={{ textAlign: 'center', fontSize: 28, lineHeight: 34 }}>
              {headline}
            </Text>
          </Animated.View>
          <Text muted style={{ textAlign: 'center' }}>
            {square || !suggested
              ? `${money(paid)} · ${group.icon ? `${group.icon} ` : ''}${group.name}`
              : `${money(suggested - paid)} still to go in ${group.name}.`}
          </Text>
          <Text variant="caption" muted style={{ textAlign: 'center' }}>
            Recorded wrong? You can undo it from Activity.
          </Text>
        </View>
        {/* Clear the phone's navigation bar (and the status bar up top, on the view above). */}
        <View style={{ padding: space.lg, paddingBottom: insets.bottom + space.lg }}>
          <Button label="Done" onPress={() => router.back()} />
        </View>
        <Confetti fire={confetti} />
      </View>
    );
  }

  return (
    <HeroScreen nav="close" eyebrow={`${group.icon ? `${group.icon} ` : ''}${group.name}`} title={title}>
      <Stack.Screen options={{ headerShown: false }} />

      <Gutter>
        <MoneyFlow fromId={from} fromName={fromName} toId={to} toName={toName} />
      </Gutter>

      <Gutter>
        <View style={{ alignItems: 'center', gap: space.sm }}>
          {changing ? (
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="0.00"
              placeholderTextColor={c.textMuted}
              keyboardType="decimal-pad"
              selectionColor={c.focus}
              cursorColor={c.focus}
              accessibilityLabel={`Amount in ${group.currency}`}
              style={{
                fontSize: 56,
                fontWeight: '800',
                letterSpacing: -2,
                color: c.text,
                minWidth: 180,
                textAlign: 'center',
                padding: 0,
                fontVariant: ['tabular-nums'],
              }}
            />
          ) : (
            <Text style={{ fontSize: 60, lineHeight: 68, fontWeight: '800', letterSpacing: -2, fontVariant: ['tabular-nums'] }}>
              {money(cents)}
            </Text>
          )}
          <Text muted style={{ textAlign: 'center' }}>
            {isEdit
              ? `Amount in ${group.currency}`
              : partial
                ? `${money(suggested - cents)} will still be left.`
                : over
                  ? `That’s more than the ${money(suggested)} owed.`
                  : suggested
                    ? 'That clears it. You’ll be square.'
                    : `Amount in ${group.currency}`}
          </Text>
          {suggested && !isEdit ? (
            changing ? (
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
                <AmountChip
                  label={`All ${money(suggested)}`}
                  selected={cents === suggested}
                  onPress={() => setText(centsToDecimalString(suggested))}
                />
                <AmountChip
                  label={`Half ${money(Math.ceil(suggested / 2))}`}
                  selected={cents === Math.ceil(suggested / 2)}
                  onPress={() => setText(centsToDecimalString(Math.ceil(suggested / 2)))}
                />
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setChanging(true)} hitSlop={8}>
                <Text variant="label" color={c.focus}>
                  Pay a different amount
                </Text>
              </Pressable>
            )
          ) : null}
        </View>
      </Gutter>

      {recipientPayId && to ? (
        <Gutter>
          <PayIdCard name={name(to)} payId={recipientPayId} amount={valid ? { cents, currency: group.currency } : undefined} />
          <Text variant="caption" muted>
            Pay in your banking app, then slide below.
          </Text>
        </Gutter>
      ) : null}

      <Gutter>
        {over ? (
          <Notice tone="info">
            {toName} would then owe {fromName === 'You' ? 'you' : fromName} the difference.
          </Notice>
        ) : null}
        {noting ? (
          <Field
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Bank transfer, cash at dinner"
            maxLength={280}
            returnKeyType="done"
          />
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setNoting(true)} hitSlop={8} style={{ alignSelf: 'center' }}>
            <Text variant="label" color={c.focus}>
              ＋ Add a note
            </Text>
          </Pressable>
        )}
        {isEdit ? (
          <Notice tone="info">The original payment stays in the history, marked as corrected, so everyone can see what changed.</Notice>
        ) : null}
        {mutation.isError ? <Notice>{mutation.error.message}</Notice> : null}
        {isEdit ? (
          <Button label="Save correction" onPress={save} disabled={!valid || !!unchanged} loading={mutation.isPending} />
        ) : (
          <SlideToConfirm
            key={mutation.isError ? 'retry' : 'first'}
            label={mutation.isPending ? 'Saving…' : from === myId ? 'Slide when you’ve paid' : 'Slide to record it'}
            onConfirm={save}
            disabled={!valid || mutation.isPending}
          />
        )}
        <Text variant="caption" muted style={{ textAlign: 'center' }}>
          {needsConfirm
            ? `Tally never moves money. ${receiver} will be asked to confirm it arrived.`
            : 'Tally never moves money. This just records it.'}
        </Text>
      </Gutter>
    </HeroScreen>
  );
}
