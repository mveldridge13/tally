import { formatMoney } from '@tally/shared';
import { router } from 'expo-router';
import { Alert, View } from 'react-native';

import { Gutter, HeroNav, HeroScreen, onDeepMuted, QuickAction, SectionTitle, TotalPill } from '@/components/dashboard';
import { Avatar, Card, Divider, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { useNameOf, useReplacedPayment, useTallyData, useVoidSettlement } from '@/lib/data';
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

/** One person in the "paid → received" strip on the navy header. */
function Party({ who, role }: { who: string; role: string }) {
  return (
    <View style={{ alignItems: 'center', gap: space.sm, flex: 1 }}>
      <Avatar name={who} size={56} color="rgba(124,196,255,0.25)" />
      <Text variant="label" color={brand.onDeep} numberOfLines={1}>
        {who}
      </Text>
      <Text variant="caption" color={onDeepMuted}>
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

  const payment = data.settlements.find((s) => s.id === id);
  const group = payment ? data.groups.find((g) => g.id === payment.groupId) : undefined;
  const replaced = useReplacedPayment(payment?.replacesId);

  if (!payment || !group) {
    return (
      <HeroScreen variant={embedded ? 'card' : 'full'} header={<HeroNav mode={embedded ? 'none' : 'back'} title="Payment" />}>
        <Gutter>
          <Notice tone="info">{isLoading ? 'Loading…' : 'This payment has been undone or corrected.'}</Notice>
        </Gutter>
      </HeroScreen>
    );
  }

  const money = formatMoney(payment.amount, group.currency);
  const from = name(payment.fromUserId);
  const to = name(payment.toUserId);
  // Effect on your balance: paying someone back raises your balance; receiving lowers it.
  const myEffect = payment.fromUserId === myId ? payment.amount : payment.toUserId === myId ? -payment.amount : 0;

  function confirmUndo() {
    Alert.alert(
      'Undo this payment?',
      `${from} → ${to}, ${money}. Use this if it was recorded by mistake. Balances will go back to what they were, and the payment stays in the history as undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo payment',
          style: 'destructive',
          onPress: () =>
            voidSettlement.mutate(payment!.id, {
              onSuccess: () => (onGone ? onGone() : router.back()),
            }),
        },
      ],
    );
  }

  const header = (
    <>
      <HeroNav mode={embedded ? 'none' : 'back'} eyebrow={`${group.name} · Payment`} title={money} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: space.xl,
        }}>
        <Party who={from} role="paid" />
        <Text style={{ fontSize: 28, color: brand.accent }}>→</Text>
        <Party who={to} role="received" />
      </View>
      <Text variant="body" color={onDeepMuted} style={{ textAlign: 'center', marginTop: space.lg }}>
        {formatDateTime(payment.occurredAt)}
      </Text>
      <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
        <TotalPill
          label="Effect on you"
          value={myEffect === 0 ? 'Not involved' : myEffect > 0 ? `Paid back ${money}` : `Received ${money}`}
          tone={myEffect > 0 ? 'owed' : myEffect < 0 ? 'owe' : 'neutral'}
        />
      </View>
      <View style={{ flexDirection: 'row', marginTop: space.xl }}>
        <QuickAction
          icon="✎"
          label="Correct"
          primary
          onPress={() => router.push({ pathname: '/settle', params: { paymentId: payment.id } })}
        />
        <QuickAction icon="◎" label="Group" onPress={() => router.push(`/group/${group.id}`)} />
        <QuickAction icon="↺" label="Undo" onPress={confirmUndo} />
      </View>
    </>
  );

  return (
    <HeroScreen variant={embedded ? 'card' : 'full'} header={header}>
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
