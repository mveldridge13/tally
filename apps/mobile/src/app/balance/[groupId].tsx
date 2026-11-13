import { formatMoney, pairBreakdown, type Cents } from '@tally/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { CardText, Gutter, HeroScreen, SectionTitle, SummaryCard } from '@/components/dashboard';
import { CountUp } from '@/components/fun';
import { Bubble, BubbleDays } from '@/components/group-visuals';
import { Avatar, Button, Card, Divider, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { PayIdCard } from '@/components/payid-card';
import { PAYID_CURRENCY, useNameOf, useRemoveMember, useSetCoOwner, useTallyData, useTransferOwnership } from '@/lib/data';
import { sendInvite } from '@/lib/invite';
import { useGroupSummary, type ActivityItem } from '@/store/hooks';
import { balanceColor, brand, groupColor, groupTint, PRESS_DELAY, radius, space, useColors } from '@/theme';

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
  const setCoOwner = useSetCoOwner();

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
  // server's balances (positive there = you owe them); owners and co-owners see every item and add them up.
  const seesAll = !!summary?.seesAll;
  const serverPair = (id: string): Cents => -(summary?.balances.get(id) ?? 0);

  const perPerson = useMemo(
    () =>
      others
        .map((id) => ({ id, total: seesAll ? pairBreakdown(myId, id, expenses, settlements).total : serverPair(id) }))
        .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
    // serverPair reads summary, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [others, myId, expenses, settlements, seesAll, summary],
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
    return { rows, total: seesAll ? total : serverPair(otherId) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherId, myId, expenses, settlements, seesAll, summary]);

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
  const title = otherId ? `You and ${they}` : 'Your balance';
  const sentence = otherId
    ? headerAmount === 0
      ? 'All square 🎉'
      : pairSentence(otherId, headerAmount)
    : headerAmount === 0
      ? 'All square in this group 🎉'
      : headerAmount > 0
        ? 'You’re owed in this group'
        : 'You owe in this group';
  // The same light card in the group's colour as the group's own page.
  const card = (
    <SummaryCard tone="light" background={groupTint(group.id)}>
      <View style={{ gap: space.md }}>
        <View style={{ gap: 2 }}>
          <CardText variant="label" muted style={{ fontWeight: '700' }}>
            {group.icon ? `${group.icon} ` : ''}
            {group.name}
          </CardText>
          <CardText variant="title" style={{ fontSize: 26, lineHeight: 31, fontWeight: '800', letterSpacing: -0.5 }}>
            {title}
          </CardText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {[myId, ...(otherId ? [otherId] : [])].map((id, i) => (
            <View key={id} style={{ marginLeft: i === 0 ? 0 : -10, borderRadius: 24, borderWidth: 3, borderColor: groupTint(group.id) }}>
              <Avatar name={name(id)} size={42} color={groupColor(id)} />
            </View>
          ))}
        </View>
        <View>
          <CardText variant="label" muted style={{ fontWeight: '700' }}>
            {otherId ? 'Between you two' : 'In this group'}
          </CardText>
          <CountUp
            cents={Math.abs(headerAmount)}
            currency={group.currency}
            style={{ color: brand.onCoral, fontSize: 36, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] }}
          />
        </View>
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: 'rgba(255,255,255,0.6)',
            borderRadius: radius.pill,
            paddingHorizontal: space.md,
            paddingVertical: 6,
          }}>
          <CardText variant="label" style={{ fontWeight: '700' }}>
            {sentence}
          </CardText>
        </View>
      </View>
    </SummaryCard>
  );
  const heroProps = {
    nav: 'back' as const,
    title,
    hideTitle: true,
  };

  // ─── You and one person ──────────────────────────────────────────────────
  if (otherId && pair) {
    const isMember = group.memberIds.includes(otherId);
    const canManage = group.myRole === 'owner' && isMember && otherId !== myId;
    const theirGroupBalance = balances.get(otherId) ?? 0;
    const memberError = removeMember.error ?? transferOwnership.error ?? setCoOwner.error;
    const isCoOwner = group.roles[otherId] === 'admin';
    const isGuest = !!data.people[otherId]?.isGuest;
    // PayID is Australian: only offered in AUD groups, and only the group owner's is shared.
    const theirPayId = group.currency === PAYID_CURRENCY && group.roles[otherId] === 'owner' ? data.payIds[otherId] : undefined;

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
    const toggleCoOwner = () =>
      isCoOwner
        ? Alert.alert(`Remove ${they} as co-owner?`, `${they} will only see the items they added, like other members.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', onPress: () => setCoOwner.mutate({ groupId: group.id, userId: otherId, coOwner: false }) },
          ])
        : Alert.alert(
            `Make ${they} a co-owner?`,
            `${they} will see every expense, payment and balance in this group, and can send settle-up reminders. Only you can remove people or delete the group.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Make co-owner', onPress: () => setCoOwner.mutate({ groupId: group.id, userId: otherId, coOwner: true }) },
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
        {card}

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
            {seesAll ? null : (
              <Text variant="caption" muted>
                Only items you added are shown. The owner and co-owners see everything.
              </Text>
            )}
            {pair.rows.length === 0 ? (
              <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
                <Text style={{ fontSize: 36 }}>🧾</Text>
                <Text muted style={{ textAlign: 'center' }}>
                  Nothing between you two in this group yet.
                </Text>
              </Card>
            ) : (
              // The same chat bubbles as the group's feed; the right side shows what each adds between you two.
              <BubbleDays
                items={pair.rows.map(
                  (r): ActivityItem =>
                    r.kind === 'expense'
                      ? { kind: 'expense', id: r.id, groupId: group.id, at: r.at, title: r.title, amount: r.total, actorId: r.payerId, myEffect: 0, involved: true }
                      : {
                          kind: 'settlement',
                          id: r.id,
                          groupId: group.id,
                          at: r.at,
                          fromUserId: r.payerId,
                          toUserId: r.payerId === myId ? otherId : myId,
                          amount: r.total,
                          myEffect: 0,
                          involved: true,
                        },
                )}
                render={(item) => {
                  const r = pair.rows.find((x) => x.id === item.id)!;
                  return (
                    <Bubble
                      key={item.id}
                      item={item}
                      currency={group.currency}
                      figure={{
                        big: `${r.amount > 0 ? '+' : '−'}${money(r.amount)}`,
                        small: r.kind === 'expense' ? (r.payerId === myId ? `${they}’s share` : 'your share') : undefined,
                        color: balanceColor(c, r.amount),
                      }}
                    />
                  );
                }}
              />
            )}
            {pair.rows.length > 0 ? (
              <Text variant="caption" muted>
                + adds to what {they} owes you; − adds to what you owe {they}. Tap any bubble for its details.
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
          {/* Owner only: managing this person. The two role changes share a row; removing sits under them, in red. */}
          {canManage ? (
            <View style={{ gap: space.sm }}>
              {isGuest ? null : (
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      kind="secondary"
                      size="small"
                      label={isCoOwner ? 'Remove co-owner' : 'Make co-owner'}
                      onPress={toggleCoOwner}
                      loading={setCoOwner.isPending}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button kind="secondary" size="small" label="Make owner" onPress={makeOwner} loading={transferOwnership.isPending} />
                  </View>
                </View>
              )}
              <Button kind="danger" size="small" label="Remove from group" onPress={remove} loading={removeMember.isPending} />
            </View>
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
      {card}
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
                  <Avatar name={name(p.id)} size={40} color={groupColor(p.id)} />
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
