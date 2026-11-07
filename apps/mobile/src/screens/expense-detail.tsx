import { centsToDecimalString, formatMoney } from '@tally/shared';
import { router } from 'expo-router';
import { Alert, View } from 'react-native';

import { CardFigure, Gutter, HeroScreen, QuickAction, SectionTitle, StatRow, TotalPill } from '@/components/dashboard';
import { Avatar, Card, Divider, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { useDeleteExpense, useExpenseHistory, useNameOf, useTallyData } from '@/lib/data';
import { relativeTime } from '@/lib/format';
import { space, useColors } from '@/theme';

const METHOD_LABEL = {
  equal: 'Split equally',
  exact: 'Split by amounts',
  percentage: 'Split by percentage',
  shares: 'Split by shares',
} as const;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Expense details. Full screen as a route, or inside the right pane of a two-pane layout
 * (`embedded`: no back button; `onGone` runs instead of going back when it's deleted or undone).
 */
export function ExpenseDetail({ id, embedded = false, onGone }: { id: string; embedded?: boolean; onGone?: () => void }) {
  const c = useColors();
  const myId = useMyId();
  const { data, isLoading } = useTallyData();
  const name = useNameOf();
  const history = useExpenseHistory(id);
  const deleteExpense = useDeleteExpense();

  const expense = data.expenses.find((e) => e.id === id);
  const group = expense ? data.groups.find((g) => g.id === expense.groupId) : undefined;

  if (!expense || !group) {
    return (
      <HeroScreen variant={embedded ? 'card' : 'full'} nav={embedded ? 'none' : 'back'} title="Expense">
        <Gutter>
          <Notice tone="info">{isLoading ? 'Loading…' : 'This expense has been deleted.'}</Notice>
        </Gutter>
      </HeroScreen>
    );
  }

  const money = (cents: number) => formatMoney(cents, group.currency);
  const myShare = expense.splits.find((s) => s.userId === myId)?.amount ?? 0;
  // Effect on your balance: what you paid minus your share.
  const myEffect = (expense.payerId === myId ? expense.amount : 0) - myShare;

  function confirmDelete() {
    Alert.alert(
      'Delete this expense?',
      `“${expense!.description}” (${money(expense!.amount)}) will be removed and everyone’s balances will update. A copy is kept in the history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteExpense.mutate(expense!.id, {
              onSuccess: () => (onGone ? onGone() : router.back()),
            }),
        },
      ],
    );
  }

  const shareDetail = (weight: number | null) => {
    if (weight == null) return null;
    if (expense.method === 'percentage') return `${centsToDecimalString(weight).replace(/\.00$/, '')}%`;
    if (expense.method === 'shares') return `${weight} ${weight === 1 ? 'share' : 'shares'}`;
    return null;
  };

  const card = (
    <>
      <CardFigure
        label="Amount"
        value={money(expense.amount)}
        note={`Paid by ${name(expense.payerId)} · ${formatDateTime(expense.occurredAt)}`}
      />
      <StatRow>
        <TotalPill label="Your share" cents={myShare} currency={group.currency} tone="neutral" />
        <TotalPill
          label={myEffect > 0 ? 'You lent' : myEffect < 0 ? 'You borrowed' : 'Your balance'}
          value={myEffect === 0 ? 'No change' : money(Math.abs(myEffect))}
          tone={myEffect > 0 ? 'owed' : myEffect < 0 ? 'owe' : 'neutral'}
        />
      </StatRow>
    </>
  );

  return (
    <HeroScreen
      variant={embedded ? 'card' : 'full'}
      nav={embedded ? 'none' : 'back'}
      eyebrow={`${group.name} · Expense`}
      title={expense.description}
      actions={
        <>
          <QuickAction
            icon="edit"
            label="Edit"
            onPress={() => router.push({ pathname: '/add-expense', params: { expenseId: expense.id } })}
          />
          <QuickAction bold icon="groups" label="Group" onPress={() => router.push(`/group/${group.id}`)} />
          <QuickAction bold icon="delete-outline" label="Delete" danger onPress={confirmDelete} />
        </>
      }
      cardTone="light"
      card={card}>
      {deleteExpense.isError ? (
        <Gutter>
          <Notice>{deleteExpense.error.message}</Notice>
        </Gutter>
      ) : null}

      <View style={{ gap: space.md }}>
        <SectionTitle title={METHOD_LABEL[expense.method]} />
        <Gutter>
          <Card style={{ paddingVertical: 0 }}>
            {expense.splits.map((s, i) => {
              const detail = shareDetail(s.weight);
              const isPayer = s.userId === expense.payerId;
              return (
                <View key={s.userId}>
                  {i > 0 ? <Divider /> : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      paddingVertical: space.md,
                    }}>
                    <Avatar name={name(s.userId)} size={40} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="heading" numberOfLines={1}>
                        {name(s.userId)}
                      </Text>
                      {detail || isPayer ? (
                        <Text variant="caption" muted>
                          {[detail, isPayer ? 'paid the bill' : null].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                    <Text variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
                      {money(s.amount)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
          {myShare === 0 ? (
            <Text variant="caption" muted>
              You weren’t part of this split.
            </Text>
          ) : null}
        </Gutter>
      </View>

      <View style={{ gap: space.md }}>
        <SectionTitle title="History" />
        <Gutter>
          <Card style={{ gap: space.md }}>
            {(history.data ?? []).map((r) => (
              <View key={r.id} style={{ gap: 2 }}>
                <Text variant="label">
                  {name(r.editedById)} edited this · {relativeTime(r.at)}
                </Text>
                <Text variant="caption" muted>
                  Before: “{r.before.description}”, {money(r.before.amount_cents)}, paid by {name(r.before.payer_id)}
                </Text>
              </View>
            ))}
            <Text variant="label">
              {name(expense.createdById)} added this · {relativeTime(expense.createdAt)}
            </Text>
          </Card>
        </Gutter>
      </View>

      {myEffect !== 0 ? (
        <Gutter>
          <Text variant="caption" muted color={myEffect > 0 ? c.owed : c.owe} style={{ textAlign: 'center' }}>
            {myEffect > 0
              ? `This expense adds ${money(myEffect)} to what you’re owed in ${group.name}.`
              : `This expense adds ${money(-myEffect)} to what you owe in ${group.name}.`}
          </Text>
        </Gutter>
      ) : null}
    </HeroScreen>
  );
}
