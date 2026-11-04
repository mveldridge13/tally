import { formatMoney } from '@tally/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { ActivityList } from '@/components/activity-list';
import { Gutter, HeroNav, HeroScreen, onDeepMuted, oweOnDeep, QuickAction, SectionTitle, TotalPill } from '@/components/dashboard';
import { ContactNameField, type ContactReach } from '@/components/contact-name-field';
import { Avatar, Button, Card, Divider, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { sendInvite, type InviteChannel } from '@/lib/invite';
import { PAYID_CURRENCY, useAddGuest, useDeleteGroup, useLeaveGroup, useNameOf, useTallyData } from '@/lib/data';
import { useGroupSummary } from '@/store/hooks';
import { PRESS_DELAY, balanceColor, brand, groupColor, radius, space, useColors } from '@/theme';
import { usePullToRefresh } from '@/lib/pull-to-refresh';

/**
 * Group details. Full screen as a route, or inside the right pane of a two-pane layout
 * (`embedded`: no back button; `onGone` runs instead of going back when it's deleted or undone).
 */
export function GroupDetail({ id, embedded = false, onGone }: { id: string; embedded?: boolean; onGone?: () => void }) {
  const c = useColors();
  const { data, isLoading, refetch } = useTallyData();
  const pull = usePullToRefresh(refetch);
  const summary = useGroupSummary(id);
  const name = useNameOf();
  const myId = useMyId();
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  // The picked contact's number and email: used once to address the invite, never saved.
  const [guestReach, setGuestReach] = useState<ContactReach | null>(null);
  const addGuest = useAddGuest();
  const deleteGroup = useDeleteGroup();
  const leaveGroup = useLeaveGroup();

  // Group totals: everything spent in the group, and your own share of it.
  const totals = useMemo(() => {
    const expenses = data.expenses.filter((e) => e.groupId === id);
    return {
      spent: expenses.reduce((sum, e) => sum + e.amount, 0),
      myShare: expenses.reduce((sum, e) => sum + (e.splits.find((s) => s.userId === myId)?.amount ?? 0), 0),
      count: expenses.length,
    };
  }, [data.expenses, id, myId]);

  if (!summary) {
    return (
      <HeroScreen variant={embedded ? 'card' : 'full'} header={<HeroNav mode={embedded ? 'none' : 'back'} title="Group" />}>
        <Gutter>
          <Notice tone="info">{isLoading ? 'Loading…' : 'This group no longer exists, or you’re no longer a member.'}</Notice>
        </Gutter>
      </HeroScreen>
    );
  }
  const { group, balances, myBalance, transfers } = summary;
  const money = (cents: number) => formatMoney(Math.abs(cents), group.currency);
  const isOwner = group.myRole === 'owner';

  function addGuestNow() {
    if (!guestName.trim() || !group) return;
    const name = guestName.trim();
    const reach = guestReach;
    addGuest.mutate(
      { groupId: group.id, name },
      {
        onSuccess: (guestId) => {
          setGuestName('');
          setGuestReach(null);
          offerInvite(guestId, name, reach);
        },
      },
    );
  }

  /** Straight after adding someone, offer to send them the join link by text or email (or the share sheet). */
  function offerInvite(guestId: string, name: string, reach: ContactReach | null) {
    if (!group) return;
    const send = (channel: InviteChannel) =>
      sendInvite({
        groupId: group.id,
        groupName: group.name,
        guestId,
        guestName: name,
        channel,
        phone: reach?.phone,
        email: reach?.email,
      }).catch((e) => Alert.alert('Couldn’t create an invite', e instanceof Error ? e.message : 'Please try again.'));
    const buttons: { text: string; style?: 'cancel'; onPress?: () => void }[] = [];
    if (reach?.phone) buttons.push({ text: 'Text', onPress: () => void send('text') });
    if (reach?.email) buttons.push({ text: 'Email', onPress: () => void send('email') });
    if (!reach?.phone && !reach?.email) buttons.push({ text: 'Share invite', onPress: () => void send('share') });
    buttons.push({ text: 'Not now', style: 'cancel' });
    Alert.alert(
      `Invite ${name} to join?`,
      `${name} is in the group now. Send them a link to join Tally; everything recorded for them comes with them.` +
        (reach?.phone || reach?.email ? '' : '\n\nYou can also invite them later from their name under Members.'),
      buttons,
    );
  }
  const people = `${group.memberIds.length} ${group.memberIds.length === 1 ? 'person' : 'people'}`;

  function confirmDelete() {
    const unsettled = transfers.length > 0;
    Alert.alert(
      `Delete “${group.name}”?`,
      (unsettled ? 'Not everyone is settled up yet. Deleting removes these balances for everyone.\n\n' : '') +
        'The group and all its expenses will disappear for every member. This can’t be undone from the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete group',
          style: 'destructive',
          onPress: () =>
            deleteGroup.mutate(group.id, {
              onSuccess: () => (onGone ? onGone() : router.replace('/groups')),
            }),
        },
      ],
    );
  }

  function confirmLeave() {
    if (myBalance !== 0) {
      Alert.alert(
        'Settle up first',
        `You ${myBalance > 0 ? 'are owed' : 'owe'} ${money(myBalance)} in this group. Once your balance is zero you can leave.`,
      );
      return;
    }
    Alert.alert(`Leave “${group.name}”?`, 'You’ll lose access to this group. Someone can invite you back later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () =>
          leaveGroup.mutate(group.id, {
            onSuccess: () => (onGone ? onGone() : router.replace('/groups')),
          }),
      },
    ]);
  }

  async function invite() {
    setInviteError(null);
    setInviting(true);
    try {
      await sendInvite({ groupId: group.id, groupName: group.name, channel: 'share' });
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Could not create an invite');
    } finally {
      setInviting(false);
    }
  }

  const settle = (from: string, to: string, amount: number) =>
    router.push({
      pathname: '/settle',
      params: { groupId: group.id, from, to, amount: String(amount) },
    });
  const myTransfer = transfers.find((t) => t.fromUserId === myId) ?? transfers.find((t) => t.toUserId === myId);
  const openBreakdown = (withId?: string) =>
    router.push({ pathname: '/balance/[groupId]', params: withId ? { groupId: group.id, with: withId } : { groupId: group.id } });

  const header = (
    <>
      <HeroNav
        mode={embedded ? 'none' : 'back'}
        eyebrow={`${people} · ${group.currency}${isOwner ? ' · You’re the owner' : ''}`}
        title={group.name}
        leading={<Avatar name={group.name} color={groupColor(group.id)} square size={44} />}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityHint="Shows which expenses and payments make up your balance"
        onPress={() => openBreakdown()}
        style={({ pressed }) => ({ marginTop: space.xl, gap: space.xs, opacity: pressed ? 0.8 : 1 })}>
        <Text variant="label" color={onDeepMuted}>
          Your balance · tap for breakdown ›
        </Text>
        <Text
          style={{
            fontSize: 44,
            fontWeight: '800',
            letterSpacing: -1,
            color: brand.onDeep,
            fontVariant: ['tabular-nums'],
          }}>
          {myBalance > 0 ? '+' : myBalance < 0 ? '−' : ''}
          {money(myBalance)}
        </Text>
        <Text variant="body" color={myBalance === 0 ? onDeepMuted : myBalance > 0 ? brand.accent : oweOnDeep}>
          {myBalance === 0 ? 'You’re settled up in this group' : myBalance > 0 ? 'You’re owed in this group' : 'You owe in this group'}
        </Text>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
        <TotalPill label="Total spent" cents={totals.spent} currency={group.currency} tone="neutral" />
        <TotalPill label="Your share" cents={totals.myShare} currency={group.currency} tone="owed" />
      </View>

      <View style={{ flexDirection: 'row', marginTop: space.xl }}>
        <QuickAction
          icon="+"
          label="Add expense"
          primary
          onPress={() =>
            router.push({
              pathname: '/add-expense',
              params: { groupId: group.id },
            })
          }
        />
        <QuickAction
          icon="⇄"
          label="Settle up"
          onPress={() =>
            myTransfer
              ? settle(myTransfer.fromUserId, myTransfer.toUserId, myTransfer.amount)
              : Alert.alert('Nothing to settle', 'You don’t owe anyone in this group, and nobody owes you.')
          }
        />
        <QuickAction icon="✉" label={inviting ? 'Sharing…' : 'Invite'} onPress={invite} />
      </View>
    </>
  );

  return (
    <HeroScreen variant={embedded ? 'card' : 'full'} header={header} refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
      {inviteError ? (
        <Gutter>
          <Notice>{inviteError}</Notice>
        </Gutter>
      ) : null}

      {/* Who owes whom: the simplest set of payments that settles the group */}
      <View style={{ gap: space.md }}>
        <SectionTitle title="Who owes whom" />
        <Gutter>
          <Card style={{ paddingVertical: transfers.length ? 0 : space.lg }}>
            {transfers.length === 0 ? <Text muted>Everyone is settled up.</Text> : null}
            {transfers.map((t, i) => {
              const involvesMe = t.fromUserId === myId || t.toUserId === myId;
              return (
                <View key={`${t.fromUserId}-${t.toUserId}`}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    onPress={() => settle(t.fromUserId, t.toUserId, t.amount)}
                    android_ripple={{ color: c.surfaceAlt }}
                    unstable_pressDelay={PRESS_DELAY}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      paddingVertical: space.md,
                    }}>
                    <Avatar name={name(t.fromUserId)} size={36} />
                    <Text muted>→</Text>
                    <Avatar name={name(t.toUserId)} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text variant="heading" numberOfLines={1}>
                        {name(t.fromUserId)} {t.fromUserId === myId ? 'owe' : 'owes'}{' '}
                        {name(t.toUserId) === 'You' ? 'you' : name(t.toUserId)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: space.xs }}>
                      <Text
                        variant="heading"
                        color={t.fromUserId === myId ? c.owe : t.toUserId === myId ? c.owed : c.text}
                        style={{ fontVariant: ['tabular-nums'] }}>
                        {formatMoney(t.amount, group.currency)}
                      </Text>
                      <View
                        style={{
                          backgroundColor: involvesMe ? c.primary : c.surfaceAlt,
                          borderRadius: radius.pill,
                          paddingHorizontal: space.md,
                          paddingVertical: 4,
                        }}>
                        <Text variant="caption" color={involvesMe ? c.onPrimary : c.text} style={{ fontWeight: '600' }}>
                          Record
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </Card>
          {transfers.length > 0 ? (
            <Text variant="caption" muted>
              Tap a payment to record it once it has been made.
            </Text>
          ) : null}
        </Gutter>
      </View>

      {/* Members */}
      <View style={{ gap: space.md }}>
        <SectionTitle title={`Members · ${group.memberIds.length}`} action="Invite" onAction={invite} />
        <Gutter>
          <Card style={{ paddingVertical: 0 }}>
            {group.memberIds.map((uid, i) => {
              const bal = balances.get(uid) ?? 0;
              const isMe = uid === myId;
              return (
                <View key={uid}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityHint={isMe ? 'Shows your balance breakdown' : `Shows everything between you and ${name(uid)}`}
                    onPress={() => openBreakdown(isMe ? undefined : uid)}
                    android_ripple={{ color: c.surfaceAlt }}
                    unstable_pressDelay={PRESS_DELAY}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      paddingVertical: space.md,
                    }}>
                    <Avatar name={name(uid)} size={40} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text variant="heading" numberOfLines={1}>
                        {name(uid)}
                      </Text>
                      {group.roles[uid] === 'owner' || data.people[uid]?.isGuest ? (
                        <View
                          style={{
                            alignSelf: 'flex-start',
                            backgroundColor: data.people[uid]?.isGuest ? brand.accentSoft : c.surfaceAlt,
                            borderRadius: radius.pill,
                            paddingHorizontal: space.sm,
                            paddingVertical: 2,
                          }}>
                          <Text variant="caption" color={brand.onAccent} style={{ fontSize: 11, fontWeight: '600' }}>
                            {data.people[uid]?.isGuest ? 'Guest · no account yet' : 'Owner'}
                          </Text>
                        </View>
                      ) : null}
                      {group.currency === PAYID_CURRENCY && data.payIds[uid] ? (
                        <Text variant="caption" color={c.focus} style={{ fontWeight: '600' }}>
                          PayID added · tap to copy
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text variant="caption" color={bal === 0 ? c.settled : balanceColor(c, bal)}>
                        {bal === 0 ? 'Settled up' : bal > 0 ? 'Is owed' : 'Owes'}
                      </Text>
                      {bal !== 0 ? (
                        <Text variant="heading" color={balanceColor(c, bal)} style={{ fontVariant: ['tabular-nums'] }}>
                          {money(bal)}
                        </Text>
                      ) : null}
                    </View>
                    <Text muted style={{ fontSize: 20 }}>
                      ›
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </Card>
          {group.memberIds.length > 1 ? (
            <Text variant="caption" muted>
              Tap someone to see every expense and payment between you{isOwner ? ', or to make them owner or remove them' : ''}.
            </Text>
          ) : null}
          <Card style={{ gap: space.md }}>
            <View style={{ gap: 2 }}>
              <Text variant="heading">Add someone by name</Text>
              <Text variant="caption" muted>
                Pick them from your contacts; no Tally account needed. Split expenses with them now and invite them later; they keep their
                history when they join.
              </Text>
            </View>
            <ContactNameField value={guestName} onChange={setGuestName} onContact={setGuestReach} onSubmit={addGuestNow} />
            <Button
              label={guestName.trim() ? `Add ${guestName.trim()} to the group` : 'Add to the group'}
              onPress={addGuestNow}
              disabled={!guestName.trim()}
              loading={addGuest.isPending}
            />
            {addGuest.isError ? <Notice>{addGuest.error.message}</Notice> : null}
          </Card>
        </Gutter>
      </View>

      {/* Expenses */}
      <View style={{ gap: space.md }}>
        <SectionTitle title={`Expenses · ${totals.count}`} />
        <Gutter>
          <ActivityList groupId={group.id} emptyText="No expenses yet. Tap Add expense above to log the first one." />
        </Gutter>
      </View>

      {/* Leave or delete */}
      <Gutter>
        {isOwner ? (
          <>
            {deleteGroup.isError ? <Notice>{deleteGroup.error.message}</Notice> : null}
            <Button kind="secondary" label="Delete group" onPress={confirmDelete} loading={deleteGroup.isPending} />
            <Text variant="caption" muted style={{ textAlign: 'center' }}>
              You’re the owner. To leave instead, make someone else the owner first.
            </Text>
          </>
        ) : (
          <>
            {leaveGroup.isError ? <Notice>{leaveGroup.error.message}</Notice> : null}
            <Button kind="secondary" label="Leave group" onPress={confirmLeave} loading={leaveGroup.isPending} />
          </>
        )}
      </Gutter>
    </HeroScreen>
  );
}
