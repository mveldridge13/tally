/**
 * Confirming a payment someone says they made to you. Until you confirm it, it doesn't count
 * towards any balance; "Not received" drops it and tells them.
 */
import { formatMoney, type Cents } from '@tally/shared';
import { Alert, View } from 'react-native';

import { buzz } from '@/components/fun';
import { Avatar, Button, Text } from '@/components/ui';
import { useRespondToPayment, type PaymentToConfirm } from '@/lib/data';
import { groupColor, radius, space, useColors } from '@/theme';

/** The two answers, side by side. Shared by the Home card and the notification. */
export function ConfirmButtons({
  settlementId,
  fromName,
  amount,
  currency,
}: {
  settlementId: string;
  fromName: string;
  amount: Cents;
  currency: string;
}) {
  const respond = useRespondToPayment();
  const money = formatMoney(amount, currency);
  const answer = (received: boolean) =>
    respond.mutate(
      { settlementId, received },
      {
        onSuccess: () => (received ? buzz.success() : buzz.nudge()),
        onError: (e) => Alert.alert('Couldn’t save that', e instanceof Error ? e.message : 'Please try again.'),
      },
    );
  const notReceived = () =>
    Alert.alert(`Haven’t received ${money}?`, `The payment will be removed and ${fromName} will be told it hasn’t arrived.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Not received', style: 'destructive', onPress: () => answer(false) },
    ]);
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <View style={{ flex: 1 }}>
        <Button size="small" label="Confirm" onPress={() => answer(true)} loading={respond.isPending && respond.variables?.received} />
      </View>
      <View style={{ flex: 1 }}>
        <Button
          size="small"
          kind="secondary"
          label="Not received"
          onPress={notReceived}
          disabled={respond.isPending}
          loading={respond.isPending && respond.variables?.received === false}
        />
      </View>
    </View>
  );
}

/** "Sam says they paid you $18.25 · ✈️ Bali" with Confirm / Not received. */
export function ConfirmPaymentCard({ payment }: { payment: PaymentToConfirm }) {
  const c = useColors();
  return (
    <View style={{ gap: space.md, padding: space.lg, borderRadius: radius.xl - 6, backgroundColor: c.surfaceAlt }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar name={payment.fromName} size={46} color={groupColor(payment.fromUserId)} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" muted style={{ fontWeight: '600' }}>
            {payment.fromName} says they paid you
          </Text>
          <Text variant="title" style={{ fontSize: 24, letterSpacing: -0.4, fontVariant: ['tabular-nums'] }}>
            {formatMoney(payment.amount, payment.group.currency)}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>
            {payment.group.icon ? `${payment.group.icon} ` : ''}
            {payment.group.name} · did it arrive?
          </Text>
        </View>
      </View>
      <ConfirmButtons
        settlementId={payment.id}
        fromName={payment.fromName}
        amount={payment.amount}
        currency={payment.group.currency}
      />
    </View>
  );
}
