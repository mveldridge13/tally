import { formatMoney } from '@tally/shared';
import { router } from 'expo-router';
import { Alert, View } from 'react-native';

import { CardText, Gutter, HeroScreen, QuickAction, SectionTitle, StatRow, TotalPill, useCardInk } from '@/components/dashboard';
import { Avatar, Card, Divider, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { useNameOf, useRemindToConfirm, useReplacedPayment, useTallyData, useVoidSettlement } from '@/lib/data';
import { relativeTime } from '@/lib/format';
import { brand, space } from '@/theme';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** One person in the "paid → received" strip on the summary card. */
function Party({ who, role }: { who: string; role: string }) {
  const ink = useCardInk();
  return (
    <View style={{ alignItems: 'center', gap: space.sm, flex: 1 }}>
      <Avatar name={who} size={56} color={brand.deep} />
      <Text variant="label" color={ink.text} numberOfLines={1}>
        {who}
      </Text>
      <Text variant="caption" color={ink.muted}>
        {role}
      </Text>
    </View>
  );
}

/** Details of a recorded repayment, opened from the activity feed. */
/**
 * Payment details. Full screen as a route, or inside the right pane of a two-pane layout
 * (`embedded`: no back button; `onGone` runs instead of going back when it's deleted or undone).
 */
export function PaymentDetail({ id, embedded = false, onGone }: { id: string; embedded?: boolean; onGone?: () => void }) {
  const myId = useMyId();
  const { data, isLoading } = useTallyData();
  const name = useNameOf();
  const voidSettlement = useVoidSettlement();
  const remind = useRemindToConfirm();

  // A payment still waiting for the receiver to confirm is kept apart; it opens here too.
  const payment = data.settlements.find((s) => s.id === id) ?? data.pendingPayments.find((s) => s.id === id);
  const pending = payment?.status === 'pending';
  const group = payment ? data.groups.find((g) => g.id === payment.groupId) : undefined;
  const replaced = useReplacedPayment(payment?.replacesId);

  if (!payment || !group) {
    return (
      <HeroScreen variant={embedded ? 'card' : 'full'} nav={embedded ? 'none' : 'back'} title="Payment">
        <Gutter>
          <Notice tone="info">
            {isLoading ? 'Loading…' : 'This payment has been undone, corrected, or marked as not received.'}
          </Notice>
        </Gutter>
      </HeroScreen>
    );
  }

  const money = formatMoney(payment.amount, group.currency);
  const from = name(payment.fromUserId);
  const to = name(payment.toUserId);
  // Effect on your balance: paying someone back raises your balance; receiving lowers it.
  const myEffect = payment.fromUserId === myId ? payment.amount : payment.toUserId === myId ? -payment.amount : 0;

  // You recorded it: you can cancel it and remind the receiver while it waits.
  const mineToChase = pending && payment.createdById === myId;

  function sendReminder() {
    remind.mutate(payment!.id, {
      onSuccess: () => Alert.alert('Reminder sent', `${to} has been asked to confirm the ${money}.`),
      onError: (e) => Alert.alert('Couldn’t send the reminder', e instanceof Error ? e.message : 'Please try again.'),
    });
  }

  function confirmUndo() {
    Alert.alert(
      pending ? 'Cancel this payment?' : 'Undo this payment?',
      pending
        ? `${from} → ${to}, ${money}. ${to} won’t be asked to confirm it any more. It stays in the history as cancelled.`
        : `${from} → ${to}, ${money}. Use this if it was recorded by mistake. Balances will go back to what they were, and the payment stays in the history as undone.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: pending ? 'Cancel payment' : 'Undo payment',
          style: 'destructive',
          onPress: () =>
            voidSettlement.mutate(payment!.id, {
              onSuccess: () => (onGone ? onGone() : router.back()),
            }),
        },
      ],
    );
  }

  const card = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Party who={from} role="paid" />
        <CardText style={{ fontSize: 28 }}>→</CardText>
        <Party who={to} role="received" />
      </View>
      <CardText muted style={{ textAlign: 'center', marginTop: space.lg }}>
        {formatDateTime(payment.occurredAt)}
      </CardText>
      <StatRow>
        {pending ? (
          <TotalPill label="Status" value={`Waiting for ${to} to confirm`} tone="neutral" />
        ) : (
          <TotalPill
            label="Effect on you"
            value={myEffect === 0 ? 'Not involved' : myEffect > 0 ? `Paid back ${money}` : `Received ${money}`}
            tone={myEffect > 0 ? 'owed' : myEffect < 0 ? 'owe' : 'neutral'}
          />
        )}
      </StatRow>
    </>
  );

  return (
    <HeroScreen
      variant={embedded ? 'card' : 'full'}
      nav={embedded ? 'none' : 'back'}
      eyebrow={`${group.name} · Payment`}
      title={money}
      actions={
        pending ? (
          <>
            {mineToChase ? <QuickAction bold icon="notifications" label={`Remind ${to}`} onPress={sendReminder} /> : null}
            <QuickAction bold icon="groups" label="Group" onPress={() => router.push(`/group/${group.id}`)} />
            {mineToChase ? <QuickAction bold icon="close" label="Cancel" danger onPress={confirmUndo} /> : null}
          </>
        ) : (
          <>
            <QuickAction
              bold
              icon="edit"
              label="Correct"
              onPress={() => router.push({ pathname: '/settle', params: { paymentId: payment.id } })}
            />
            <QuickAction bold icon="groups" label="Group" onPress={() => router.push(`/group/${group.id}`)} />
            <QuickAction bold icon="undo" label="Undo" danger onPress={confirmUndo} />
          </>
        )
      }
      cardTone="light"
      card={card}>
      {pending ? (
        <Gutter>
          <Notice tone="info">
            Waiting for {to} to confirm it arrived. It doesn’t count towards anyone’s balance until then.
          </Notice>
        </Gutter>
      ) : null}
      {voidSettlement.isError ? (
        <Gutter>
          <Notice>{voidSettlement.error.message}</Notice>
        </Gutter>
      ) : null}

      {payment.note ? (
        <View style={{ gap: space.md }}>
          <SectionTitle title="Note" />
          <Gutter>
            <Card>
              <Text>{payment.note}</Text>
            </Card>
          </Gutter>
        </View>
      ) : null}

      <View style={{ gap: space.md }}>
        <SectionTitle title="History" />
        <Gutter>
          <Card style={{ paddingVertical: 0 }}>
            <View style={{ paddingVertical: space.md, gap: 2 }}>
              <Text variant="heading">
                {payment.replacesId ? 'Corrected' : 'Recorded'} by {name(payment.createdById)}
              </Text>
              <Text variant="caption" muted>
                {relativeTime(payment.createdAt)}
              </Text>
            </View>
            {replaced.data ? (
              <>
                <Divider />
                <View style={{ paddingVertical: space.md, gap: 2 }}>
                  <Text variant="heading">Replaces a payment of {formatMoney(replaced.data.amount, group.currency)}</Text>
                  <Text variant="caption" muted>
                    Recorded by {name(replaced.data.createdById)} · {relativeTime(replaced.data.createdAt)}
                    {replaced.data.note ? ` · “${replaced.data.note}”` : ''}
                  </Text>
                </View>
              </>
            ) : null}
            <Divider />
            <View style={{ paddingVertical: space.md, gap: 2 }}>
              <Text variant="heading">{group.name}</Text>
              <Text variant="caption" muted>
                Group · {group.currency}
              </Text>
            </View>
          </Card>
          <Text variant="caption" muted>
            Tally records payments made in cash or another app; it doesn’t move money itself. Correct it if the amount or note is wrong;
            undo it only if it was recorded by mistake.
          </Text>
        </Gutter>
      </View>
    </HeroScreen>
  );
}
