import { formatMoney, pairBreakdown, type Cents } from '@tally/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { CardFigure, Gutter, HeroScreen, onDeepMuted, oweOnDeep, SectionTitle } from '@/components/dashboard';
import { Avatar, Button, Card, Divider, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { PayIdCard } from '@/components/payid-card';
import { PAYID_CURRENCY, useNameOf, useRemoveMember, useTallyData, useTransferOwnership } from '@/lib/data';
import { sendInvite } from '@/lib/invite';
import { relativeTime } from '@/lib/format';
import { useGroupSummary } from '@/store/hooks';
import { balanceColor, brand, groupColor, PRESS_DELAY, radius, space, useColors } from '@/theme';

/**
 * Balance breakdown for one group.
 * - No `with` param: your balance split person by person; the rows add up to your group balance.
 * - `with=<userId>`: every expense and payment between you and that person, and what each contributed.
 */
export default function BalanceBreakdownScreen() {
  const c = useColors();
  const { groupId, with: otherId } = useLocalSearchParams<{ groupId: string; with?: string }>();
  const myId = useMyId();
  const name = useNameOf();
  const { data, isLoading } = useTallyData();
  const summary = useGroupSummary(groupId);
  const removeMember = useRemoveMember();
  const transferOwnership = useTransferOwnership();

  const expenses = useMemo(() => data.expenses.filter((e) => e.groupId === groupId), [data.expenses, groupId]);
  const settlements = useMemo(() => data.settlements.filter((s) => s.groupId === groupId), [data.settlements, groupId]);

  // Everyone you could have a balance with: current members plus anyone who appears in the history.
  const others = useMemo(() => {
    const ids = new Set<string>(summary?.group.memberIds ?? []);
    for (const e of expenses) {
      ids.add(e.payerId);
      e.splits.forEach((s) => ids.add(s.userId));
    }
    for (const s of settlements) {
      ids.add(s.fromUserId);
      ids.add(s.toUserId);
    }
    ids.delete(myId);
    return [...ids];
  }, [summary, expenses, settlements, myId]);

  // Members only see their own items, so what's between you and each person comes from the
  // server's balances (positive there = you owe them); the owner sees every item and adds them up.
  const isOwner = !!summary?.isOwner;
  const serverPair = (id: string): Cents => -(summary?.balances.get(id) ?? 0);

  const perPerson = useMemo(
    () =>
      others
        .map((id) => ({ id, total: isOwner ? pairBreakdown(myId, id, expenses, settlements).total : serverPair(id) }))
        .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
    // serverPair reads summary, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [others, myId, expenses, settlements, isOwner, summary],
  );

  const pair = useMemo(() => {
    if (!otherId) return null;
    const { entries, total } = pairBreakdown(myId, otherId, expenses, settlements);
    const rows = entries
      .map((e) => {
        if (e.kind === 'expense') {
          const x = expenses[e.index]!;
          return {
            key: x.id,
            kind: e.kind,
            id: x.id,
            at: x.occurredAt,
            amount: e.amount,
            title: x.description,
            payerId: x.payerId,
            total: x.amount,
          };
        }
        const x = settlements[e.index]!;
        return { key: x.id, kind: e.kind, id: x.id, at: x.occurredAt, amount: e.amount, title: '', payerId: x.fromUserId, total: x.amount };
      })
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    return { rows, total: isOwner ? total : serverPair(otherId) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherId, myId, expenses, settlements, isOwner, summary]);

  if (!summary) {
    return (
      <HeroScreen nav="back" title="Balance">
        <Stack.Screen options={{ headerShown: false }} />
        <Gutter>
          <Notice tone="info">{isLoading ? 'Loading…' : 'This group no longer exists, or you’re no longer a member.'}</Notice>
        </Gutter>
      </HeroScreen>
    );
  }

  const { group, myBalance, balances } = summary;
  const money = (cents: Cents) => formatMoney(Math.abs(cents), group.currency);
  const they = otherId ? name(otherId) : '';

  /** "Sam owes you A$5.00" / "You owe Sam A$5.00" / "You and Sam are settled up". */
  const pairSentence = (id: string, total: Cents) =>
    total > 0 ? `${name(id)} owes you` : total < 0 ? `You owe ${name(id)}` : `You and ${name(id)} are settled up`;

  const headerAmount = otherId ? (pair?.total ?? 0) : myBalance;
  const card = (
    <CardFigure
      label={otherId ? 'Between you two' : 'In this group'}
      value={`${headerAmount > 0 ? '+' : headerAmount < 0 ? '−' : ''}${money(headerAmount)}`}
      note={
        otherId
          ? pairSentence(otherId, headerAmount)
          : headerAmount === 0
            ? 'You’re settled up in this group'
            : headerAmount > 0
              ? 'You’re owed in this group'
              : 'You owe in this group'
      }
      noteColor={headerAmount === 0 ? onDeepMuted : headerAmount > 0 ? brand.accent : oweOnDeep}
    />
  );
  const heroProps = {
    nav: 'back' as const,
    eyebrow: group.name,
    title: otherId ? `You and ${they}` : 'Your balance',
    card,
  };

  // ─── You and one person ──────────────────────────────────────────────────
  if (otherId && pair) {
    const isMember = group.memberIds.includes(otherId);
    const canManage = group.myRole === 'owner' && isMember && otherId !== myId;
    const theirGroupBalance = balances.get(otherId) ?? 0;
    const memberError = removeMember.error ?? transferOwnership.error;
    const isGuest = !!data.people[otherId]?.isGuest;
    // PayID is Australian: only offered in AUD groups.
    const theirPayId = group.currency === PAYID_CURRENCY ? data.payIds[otherId] : undefined;

    /** Share an invite tied to this guest: when they accept, their history in the group becomes theirs. */
    const inviteGuest = () =>
      sendInvite({ groupId: group.id, groupName: group.name, guestId: otherId, guestName: they, channel: 'share' }).catch((e) =>
        Alert.alert('Couldn’t create an invite', e instanceof Error ? e.message : 'Please try again.'),
      );

    const makeOwner = () =>
      Alert.alert(
        `Make ${they} the owner?`,
        `${they} will be able to remove members and delete the group. You’ll become a regular member.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Make owner', onPress: () => transferOwnership.mutate({ groupId: group.id, userId: otherId }) },
        ],
      );
    const remove = () => {
      if (theirGroupBalance !== 0) {
        Alert.alert(
          `${they} isn’t settled up`,
          `${they} ${theirGroupBalance > 0 ? 'is owed' : 'owes'} ${money(theirGroupBalance)} in this group. Record a payment to settle up before removing them.`,
        );
        return;
      }
      Alert.alert(
        `Remove ${they}?`,
        `${they} will lose access to this group. Their past expenses stay in the history, and you can invite them back later.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => removeMember.mutate({ groupId: group.id, userId: otherId }, { onSuccess: () => router.back() }),
          },
        ],
      );
    };

    return (
      <HeroScreen {...heroProps}>
        <Stack.Screen options={{ headerShown: false }} />

        {theirPayId ? (
          <Gutter>
            <PayIdCard
              name={they}
              payId={theirPayId}
              amount={pair.total < 0 ? { cents: Math.abs(pair.total), currency: group.currency } : undefined}
            />
          </Gutter>
        ) : null}

        <View style={{ gap: space.md }}>
          <SectionTitle title={`What makes up this balance · ${pair.rows.length}`} />
          <Gutter>
            {isOwner ? null : (
              <Text variant="caption" muted>
                Only items you added are shown. The owner sees everything.
              </Text>
            )}
            <Card style={{ paddingVertical: pair.rows.length ? 0 : space.lg }}>
              {pair.rows.length === 0 ? <Text muted>Nothing between you two in this group yet.</Text> : null}
              {pair.rows.map((r, i) => {
                const isExpense = r.kind === 'expense';
                const subtitle = isExpense
                  ? r.payerId === myId
                    ? `You paid ${money(r.total)} · ${they}’s share · ${relativeTime(r.at)}`
                    : `${they} paid ${money(r.total)} · your share · ${relativeTime(r.at)}`
                  : `Payment · ${relativeTime(r.at)}`;
                const title = isExpense ? r.title : r.payerId === myId ? `You paid ${they}` : `${they} paid you`;
                return (
                  <View key={r.key}>
                    {i > 0 ? <Divider /> : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        isExpense
                          ? router.push({ pathname: '/expense/[id]', params: { id: r.id } })
                          : router.push({ pathname: '/payment/[id]', params: { id: r.id } })
                      }
                      android_ripple={{ color: c.surfaceAlt }}
                      unstable_pressDelay={PRESS_DELAY}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
                      <View
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: radius.md,
                          backgroundColor: (isExpense ? groupColor(group.id) : c.owed) + '22',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: isExpense ? groupColor(group.id) : c.owed }}>
                          {isExpense ? r.title.slice(0, 1).toUpperCase() : '⇄'}
                        </Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="heading" numberOfLines={1}>
                          {title}
                        </Text>
                        <Text variant="caption" muted numberOfLines={1}>
                          {subtitle}
                        </Text>
                      </View>
                      <Text variant="heading" color={balanceColor(c, r.amount)} style={{ fontVariant: ['tabular-nums'] }}>
                        {r.amount > 0 ? '+' : '−'}
                        {money(r.amount)}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </Card>
            {pair.rows.length > 0 ? (
              <Text variant="caption" muted>
                + adds to what {they} owes you; − adds to what you owe {they}. Tap any item for its details.
              </Text>
            ) : null}
          </Gutter>
        </View>

        <Gutter>
          {pair.total !== 0 ? (
            <Button
              label={pair.total < 0 ? `Record a payment to ${they}` : `Record a payment from ${they}`}
              onPress={() =>
                router.push({
                  pathname: '/settle',
                  params: {
                    groupId: group.id,
                    from: pair.total < 0 ? myId : otherId,
                    to: pair.total < 0 ? otherId : myId,
                    amount: String(Math.abs(pair.total)),
                  },
                })
              }
            />
          ) : null}
          {isGuest && isMember ? (
            <>
              <Button label={`Invite ${they} to join`} onPress={inviteGuest} />
              <Text variant="caption" muted>
                {they} was added by name and doesn’t have a Tally account yet. When they accept this invite, everything recorded for them
                here becomes theirs.
              </Text>
            </>
          ) : null}
          {canManage ? (
            <>
              {isGuest ? null : (
                <Button kind="secondary" label={`Make ${they} the owner`} onPress={makeOwner} loading={transferOwnership.isPending} />
              )}
              <Button kind="secondary" label={`Remove ${they} from the group`} onPress={remove} loading={removeMember.isPending} />
            </>
          ) : null}
          {memberError ? <Notice>{memberError.message}</Notice> : null}
          {!isMember ? (
            <Text variant="caption" muted>
              {they} is no longer in this group; their history still counts.
            </Text>
          ) : null}
        </Gutter>
      </HeroScreen>
    );
  }

  // ─── Your balance, person by person ──────────────────────────────────────
  const shown = perPerson.filter((p) => p.total !== 0 || group.memberIds.includes(p.id));
  return (
    <HeroScreen {...heroProps}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ gap: space.md }}>
        <SectionTitle title="Person by person" />
        <Gutter>
          <Card style={{ paddingVertical: shown.length ? 0 : space.lg }}>
            {shown.length === 0 ? <Text muted>You’re the only member so far. Invite people to start splitting.</Text> : null}
            {shown.map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint={`Shows everything between you and ${name(p.id)}`}
                  onPress={() => router.push({ pathname: '/balance/[groupId]', params: { groupId: group.id, with: p.id } })}
                  android_ripple={{ color: c.surfaceAlt }}
                  unstable_pressDelay={PRESS_DELAY}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
                  <Avatar name={name(p.id)} size={40} />
                  <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
                    {pairSentence(p.id, p.total)}
                  </Text>
                  {p.total !== 0 ? (
                    <Text variant="heading" color={balanceColor(c, p.total)} style={{ fontVariant: ['tabular-nums'] }}>
                      {money(p.total)}
                    </Text>
                  ) : null}
                  <Text muted style={{ fontSize: 20 }}>
                    ›
                  </Text>
                </Pressable>
              </View>
            ))}
          </Card>
          {shown.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.xs }}>
                <Text variant="label" muted>
                  Adds up to your balance
                </Text>
                <Text variant="label" color={balanceColor(c, myBalance)} style={{ fontVariant: ['tabular-nums'] }}>
                  {myBalance > 0 ? '+' : myBalance < 0 ? '−' : ''}
                  {money(myBalance)}
                </Text>
              </View>
              <Text variant="caption" muted>
                These are one-to-one amounts. “Who owes whom” on the group screen may route payments differently to need fewer of them, but
                everyone ends up settled either way.
              </Text>
            </>
          ) : null}
        </Gutter>
      </View>
    </HeroScreen>
  );
}
