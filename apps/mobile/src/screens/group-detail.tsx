import { formatMoney } from '@tally/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { ActivityList } from '@/components/activity-list';
import { ContactNameField, type ContactReach } from '@/components/contact-name-field';
import { CardFigure, Gutter, HeaderMenuButton, HeroScreen, QuickAction, SectionTitle, StatRow, TotalPill } from '@/components/dashboard';
import { balanceSentence, GROUP_ICONS, GroupIcon, MenuRow, Sheet } from '@/components/friendly';
import { SplitPartnerPicker, useSelection } from '@/components/split-partners';
import { Avatar, Button, Card, Divider, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import {
  useAddGuest,
  useAddMembers,
  useDeleteGroup,
  useLeaveGroup,
  useNameOf,
  useSetGroupIcon,
  useSplitPartners,
  useTallyData,
} from '@/lib/data';
import { firstName } from '@/lib/format';
import { sendInvite, type InviteChannel } from '@/lib/invite';
import { usePullToRefresh } from '@/lib/pull-to-refresh';
import { soleOther, useGroupSummary } from '@/store/hooks';
import { PRESS_DELAY, balanceColor, groupColor, radius, space, useColors } from '@/theme';

type SheetName = 'people' | 'menu' | 'icon' | null;

/** Round translucent ⋯ button for the header, matching the back button. */
/**
 * Group details: one sentence about where you stand, the people, and the expenses.
 * Adding people and the rarer actions (invite, icon, leave, delete) live in sheets.
 * Full screen as a route, or inside the right pane of a two-pane layout
 * (`embedded`: no back button; `onGone` runs instead of going back when it's deleted or left).
 */
export function GroupDetail({ id, embedded = false, onGone }: { id: string; embedded?: boolean; onGone?: () => void }) {
  const c = useColors();
  const { data, isLoading, refetch } = useTallyData();
  const pull = usePullToRefresh(refetch);
  const summary = useGroupSummary(id);
  const name = useNameOf();
  const myId = useMyId();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [showAllBalances, setShowAllBalances] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  // The picked contact's number and email: used once to address the invite, never saved.
  const [guestReach, setGuestReach] = useState<ContactReach | null>(null);
  const addGuest = useAddGuest();
  const addMembers = useAddMembers();
  const setIcon = useSetGroupIcon();
  const deleteGroup = useDeleteGroup();
  const leaveGroup = useLeaveGroup();
  const { data: partners } = useSplitPartners();
  const picked = useSelection();

  if (!summary) {
    return (
      <HeroScreen variant={embedded ? 'card' : 'full'} nav={embedded ? 'none' : 'back'} title="Group">
        <Gutter>
          <Notice tone="info">{isLoading ? 'Loading…' : 'This group no longer exists, or you’re no longer a member.'}</Notice>
        </Gutter>
      </HeroScreen>
    );
  }
  const { group, balances, myBalance, transfers } = summary;
  const money = (cents: number) => formatMoney(Math.abs(cents), group.currency);
  const isOwner = group.myRole === 'owner';
  const other = soleOther(summary, myId);
  const myTransfer = transfers.find((t) => t.fromUserId === myId) ?? transfers.find((t) => t.toUserId === myId);

  // People you split with elsewhere who aren't in this group yet.
  const addable = partners.filter((p) => !group.memberIds.includes(p.id));
  const pickedHere = [...picked.selected].filter((uid) => addable.some((p) => p.id === uid));

  const settle = (from: string, to: string, amount: number) =>
    router.push({ pathname: '/settle', params: { groupId: group.id, from, to, amount: String(amount) } });
  const openBreakdown = (withId?: string) =>
    router.push({ pathname: '/balance/[groupId]', params: withId ? { groupId: group.id, with: withId } : { groupId: group.id } });
  const gone = () => (onGone ? onGone() : router.replace('/groups'));

  function addPicked() {
    if (!pickedHere.length) return;
    addMembers.mutate(
      { groupId: group.id, userIds: pickedHere },
      {
        onSuccess: () => {
          picked.clear();
          setSheet(null);
        },
      },
    );
  }

  function addGuestNow() {
    const guest = guestName.trim();
    if (!guest) return;
    const reach = guestReach;
    addGuest.mutate(
      { groupId: group.id, name: guest },
      {
        onSuccess: (guestId) => {
          setGuestName('');
          setGuestReach(null);
          setSheet(null);
          offerInvite(guestId, guest, reach);
        },
      },
    );
  }

  /** Straight after adding someone by name, offer to send them the join link by text or email (or the share sheet). */
  function offerInvite(guestId: string, guest: string, reach: ContactReach | null) {
    const send = (channel: InviteChannel) =>
      sendInvite({
        groupId: group.id,
        groupName: group.name,
        guestId,
        guestName: guest,
        channel,
        phone: reach?.phone,
        email: reach?.email,
      }).catch((e) => Alert.alert('Couldn’t create an invite', e instanceof Error ? e.message : 'Please try again.'));
    const buttons: { text: string; style?: 'cancel'; onPress?: () => void }[] = [];
    if (reach?.phone) buttons.push({ text: 'Text', onPress: () => void send('text') });
    if (reach?.email) buttons.push({ text: 'Email', onPress: () => void send('email') });
    if (!reach?.phone && !reach?.email) buttons.push({ text: 'Share invite', onPress: () => void send('share') });
    buttons.push({ text: 'Not now', style: 'cancel' });
    Alert.alert(`Invite ${guest} to join?`, `${guest} is in the group. Send them a link so they can see it too.`, buttons);
  }

  async function invite() {
    setSheet(null);
    setInviteError(null);
    try {
      await sendInvite({ groupId: group.id, groupName: group.name, channel: 'share' });
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Could not create an invite');
    }
  }

  function confirmDelete() {
    setSheet(null);
    Alert.alert(
      `Delete “${group.name}”?`,
      (transfers.length > 0 ? 'Not everyone is square yet. Deleting removes these balances for everyone.\n\n' : '') +
        'The group and its expenses disappear for everyone. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete group', style: 'destructive', onPress: () => deleteGroup.mutate(group.id, { onSuccess: gone }) },
      ],
    );
  }

  function confirmLeave() {
    setSheet(null);
    if (myBalance !== 0) {
      Alert.alert('Settle up first', `${balanceSentence(myBalance, group.currency)} in this group. Once you’re square you can leave.`);
      return;
    }
    Alert.alert(`Leave “${group.name}”?`, 'You won’t see this group any more. Someone can invite you back later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => leaveGroup.mutate(group.id, { onSuccess: gone }) },
    ]);
  }

  const card = (
    <>
      <CardFigure
        label="Your balance"
        value={`${myBalance > 0 ? '+' : myBalance < 0 ? '−' : ''}${money(myBalance)}`}
        note={balanceSentence(myBalance, group.currency, other ? name(other) : undefined)}
      />
      <StatRow>
        <TotalPill label="Group spending" cents={summary.totalSpent ?? 0} currency={group.currency} tone="neutral" />
        <TotalPill label="Your share" cents={summary.myShare} currency={group.currency} tone="neutral" />
      </StatRow>
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <HeroScreen
        variant={embedded ? 'card' : 'full'}
        nav={embedded ? 'none' : 'back'}
        title={group.name}
        subtitle={`${group.memberIds.length} ${group.memberIds.length === 1 ? 'person' : 'people'} · ${group.currency}`}
        leading={<GroupIcon group={group} size={52} />}
        right={<HeaderMenuButton onPress={() => setSheet('menu')} />}
        actions={
          <>
            <QuickAction
              bold
              icon="add-circle-outline"
              label="Add expense"
              onPress={() => router.push({ pathname: '/add-expense', params: { groupId: group.id } })}
            />
            <QuickAction
              bold
              icon="handshake"
              label="Settle up"
              disabled={!myTransfer}
              onPress={() => myTransfer && settle(myTransfer.fromUserId, myTransfer.toUserId, myTransfer.amount)}
            />
          </>
        }
        card={card}
        cardTone="light"
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}>
        {inviteError ? (
          <Gutter>
            <Notice>{inviteError}</Notice>
          </Gutter>
        ) : null}

        {/* People: a row of faces with each person's balance; + opens Add people. */}
        <View style={{ gap: space.md }}>
          <SectionTitle title="People" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.lg }}>
            {group.memberIds.map((uid) => {
              const bal = balances.get(uid) ?? 0;
              const isMe = uid === myId;
              const guest = data.people[uid]?.isGuest;
              return (
                <Pressable
                  key={uid}
                  accessibilityRole="button"
                  accessibilityLabel={`${name(uid)}, ${bal === 0 ? 'square' : bal > 0 ? `owed ${money(bal)}` : `owes ${money(bal)}`}`}
                  onPress={() => openBreakdown(isMe ? undefined : uid)}
                  unstable_pressDelay={PRESS_DELAY}
                  style={({ pressed }) => ({ alignItems: 'center', gap: 4, width: 68, opacity: pressed ? 0.7 : 1 })}>
                  <View
                    style={
                      guest ? { borderRadius: 30, borderWidth: 2, borderStyle: 'dashed', borderColor: c.border, padding: 2 } : undefined
                    }>
                    <Avatar name={name(uid)} size={52} color={groupColor(uid)} />
                  </View>
                  <Text variant="label" numberOfLines={1}>
                    {isMe ? 'You' : firstName(name(uid))}
                  </Text>
                  <Text variant="caption" color={bal === 0 ? c.textMuted : balanceColor(c, bal)} numberOfLines={1}>
                    {bal === 0 ? 'square' : `${bal > 0 ? '+' : '−'}${money(bal)}`}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add people"
              onPress={() => setSheet('people')}
              style={({ pressed }) => ({ alignItems: 'center', gap: 4, width: 68, opacity: pressed ? 0.7 : 1 })}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  borderWidth: 2,
                  borderStyle: 'dashed',
                  borderColor: c.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text style={{ fontSize: 24, color: c.focus }}>+</Text>
              </View>
              <Text variant="label" color={c.focus}>
                Add
              </Text>
            </Pressable>
          </ScrollView>

          {transfers.length > 0 ? (
            <Gutter>
              <Pressable accessibilityRole="button" onPress={() => setShowAllBalances((v) => !v)} hitSlop={8}>
                <Text variant="label" color={c.focus}>
                  {showAllBalances ? 'Hide who owes whom' : 'See who owes whom ›'}
                </Text>
              </Pressable>
              {showAllBalances ? (
                <Card style={{ paddingVertical: 0 }}>
                  {transfers.map((t, i) => (
                    <View key={`${t.fromUserId}-${t.toUserId}`}>
                      {i > 0 ? <Divider /> : null}
                      <Pressable
                        onPress={() => settle(t.fromUserId, t.toUserId, t.amount)}
                        android_ripple={{ color: c.surfaceAlt }}
                        unstable_pressDelay={PRESS_DELAY}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
                        <Text style={{ flex: 1 }} numberOfLines={1}>
                          {name(t.fromUserId)} {t.fromUserId === myId ? 'owe' : 'owes'} {t.toUserId === myId ? 'you' : name(t.toUserId)}
                        </Text>
                        <Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>
                          {formatMoney(t.amount, group.currency)}
                        </Text>
                        <Text muted style={{ fontSize: 20 }}>
                          ›
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </Card>
              ) : null}
            </Gutter>
          ) : null}
        </View>

        {/* Expenses */}
        <View style={{ gap: space.md }}>
          <View style={{ gap: 2 }}>
            <SectionTitle title="Expenses" />
            {summary.isOwner ? null : (
              <Gutter>
                <Text variant="caption" muted>
                  Only items you added are shown. The owner sees everything.
                </Text>
              </Gutter>
            )}
          </View>
          <Gutter>
            <ActivityList groupId={group.id} emptyText="Nothing here yet. Tap Add expense to log the first one." />
          </Gutter>
        </View>
      </HeroScreen>

      {/* Add people: people you split with, an invite link, or someone by name. */}
      <Sheet
        visible={sheet === 'people'}
        onClose={() => setSheet(null)}
        title="Add people"
        footer={
          pickedHere.length > 0 ? (
            <>
              {addMembers.isError ? <Notice>{addMembers.error.message}</Notice> : null}
              <Button
                label={`Add ${pickedHere.length === 1 ? (addable.find((p) => p.id === pickedHere[0])?.name ?? '1 person') : `${pickedHere.length} people`}`}
                onPress={addPicked}
                loading={addMembers.isPending}
              />
            </>
          ) : null
        }>
        {addable.length > 0 ? (
          <View style={{ gap: space.sm }}>
            <Text variant="label" muted>
              People you split with
            </Text>
            <SplitPartnerPicker partners={addable} selected={picked.selected} onToggle={picked.toggle} />
          </View>
        ) : null}
        <View style={{ gap: space.sm }}>
          <Text variant="label" muted>
            Someone new
          </Text>
          <Card style={{ paddingVertical: 0 }}>
            <MenuRow label="Share an invite link" detail="They join with their own account" onPress={() => void invite()} />
          </Card>
          <Card style={{ gap: space.md }}>
            <View style={{ gap: 2 }}>
              <Text variant="heading">Add by name</Text>
              <Text variant="caption" muted>
                For someone without Tally yet. Invite them later and they keep their history.
              </Text>
            </View>
            <ContactNameField value={guestName} onChange={setGuestName} onContact={setGuestReach} onSubmit={addGuestNow} />
            <Button
              kind="secondary"
              label={guestName.trim() ? `Add ${guestName.trim()}` : 'Add'}
              onPress={addGuestNow}
              disabled={!guestName.trim()}
              loading={addGuest.isPending}
            />
            {addGuest.isError ? <Notice>{addGuest.error.message}</Notice> : null}
          </Card>
        </View>
      </Sheet>

      {/* ⋯ menu: the rarer actions. */}
      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)} title={group.name}>
        <Card style={{ paddingVertical: 0 }}>
          <MenuRow label="Share an invite link" onPress={() => void invite()} />
          <Divider />
          <MenuRow label="Change icon" onPress={() => setSheet('icon')} />
          <Divider />
          <MenuRow
            label="Your balance, person by person"
            onPress={() => {
              setSheet(null);
              openBreakdown();
            }}
          />
        </Card>
        <Card style={{ paddingVertical: 0 }}>
          {isOwner ? (
            <MenuRow label="Delete group" danger onPress={confirmDelete} />
          ) : (
            <MenuRow label="Leave group" danger onPress={confirmLeave} />
          )}
        </Card>
        {isOwner ? (
          <Text variant="caption" muted>
            You’re the owner. To leave instead, make someone else the owner: tap them under People.
          </Text>
        ) : null}
        {deleteGroup.isError ? <Notice>{deleteGroup.error.message}</Notice> : null}
        {leaveGroup.isError ? <Notice>{leaveGroup.error.message}</Notice> : null}
      </Sheet>

      {/* Icon picker */}
      <Sheet visible={sheet === 'icon'} onClose={() => setSheet(null)} title="Group icon">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {GROUP_ICONS.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`Use ${emoji}`}
              onPress={() => setIcon.mutate({ groupId: group.id, icon: emoji }, { onSuccess: () => setSheet(null) })}
              style={{
                width: 56,
                height: 56,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: group.icon === emoji ? c.surfaceAlt : c.surface,
                borderWidth: group.icon === emoji ? 2 : 1,
                borderColor: group.icon === emoji ? c.focus : c.border,
              }}>
              <Text style={{ fontSize: 28 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
        {group.icon ? (
          <Button
            kind="secondary"
            label="Use the first letter instead"
            onPress={() => setIcon.mutate({ groupId: group.id, icon: null }, { onSuccess: () => setSheet(null) })}
          />
        ) : null}
        {setIcon.isError ? <Notice>{setIcon.error.message}</Notice> : null}
      </Sheet>
    </View>
  );
}
