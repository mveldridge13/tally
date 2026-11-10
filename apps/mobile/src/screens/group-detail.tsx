import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { formatMoney } from '@tally/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { ContactNameField, type ContactReach } from '@/components/contact-name-field';
import { Gutter, HeaderMenuButton, HeroScreen, SectionTitle } from '@/components/dashboard';
import { balanceSentence, FloatingButton, GROUP_ICONS, GroupIcon, MenuRow, Sheet } from '@/components/friendly';
import { CountUp } from '@/components/fun';
import { GroupFeed, OweWeb, Segmented } from '@/components/group-visuals';
import { AllSquareCard, myTransfers, YouCard } from '@/components/you-cards';
import { SplitPartnerPicker, useSelection } from '@/components/split-partners';
import { Avatar, Button, Card, Divider, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import {
  seesEverything,
  useAddGuest,
  useAddMembers,
  useDeleteGroup,
  useLeaveGroup,
  useSetGroupHidden,
  useNameOf,
  useRecentlyReminded,
  useRemindToSettle,
  useSetGroupIcon,
  useSplitPartners,
  useTallyData,
} from '@/lib/data';
import { firstName } from '@/lib/format';
import { sendInvite, type InviteChannel } from '@/lib/invite';
import { usePullToRefresh } from '@/lib/pull-to-refresh';
import { useGroupSummary } from '@/store/hooks';
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
  const [webView, setWebView] = useState<'me' | 'all'>('me');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  // The picked contact's number and email: used once to address the invite, never saved.
  const [guestReach, setGuestReach] = useState<ContactReach | null>(null);
  const addGuest = useAddGuest();
  const addMembers = useAddMembers();
  const setIcon = useSetGroupIcon();
  const deleteGroup = useDeleteGroup();
  const leaveGroup = useLeaveGroup();
  const setHidden = useSetGroupHidden();
  const { data: partners } = useSplitPartners();
  const picked = useSelection();
  // Owner and co-owners: settle-up reminders, one per person per day.
  const canRemind = seesEverything(data.groups.find((g) => g.id === id)?.myRole);
  const recentlyReminded = useRecentlyReminded(id, canRemind);
  const remind = useRemindToSettle();
  const [justReminded, setJustReminded] = useState<ReadonlySet<string>>(new Set());

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
  const mine = myTransfers([summary], myId);
  const owesMe = new Set(mine.filter((t) => !t.iOwe).map((t) => t.other));
  const shownTransfers = webView === 'me' ? transfers.filter((t) => t.fromUserId === myId || t.toUserId === myId) : transfers;
  const othersOnly = transfers.some((t) => t.fromUserId !== myId && t.toUserId !== myId);
  const remindedToday = (uid: string) => justReminded.has(uid) || recentlyReminded.has(uid);
  function sendReminder(uid: string) {
    remind.mutate(
      { groupId: group.id, userId: uid },
      {
        onSuccess: () => setJustReminded((prev) => new Set(prev).add(uid)),
        onError: (e) => Alert.alert('Couldn’t send the reminder', e instanceof Error ? e.message : 'Please try again.'),
      },
    );
  }

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

  return (
    <View style={{ flex: 1 }}>
      <HeroScreen
        variant={embedded ? 'card' : 'full'}
        nav={embedded ? 'none' : 'back'}
        title={group.name}
        subtitleNode={
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <CountUp
              cents={summary.totalSpent ?? 0}
              currency={group.currency}
              style={{ color: c.textMuted, fontWeight: '600', fontVariant: ['tabular-nums'] }}
            />
            <Text muted> spent · your share {formatMoney(summary.myShare, group.currency)}</Text>
          </View>
        }
        leading={<GroupIcon group={group} size={52} />}
        right={<HeaderMenuButton onPress={() => setSheet('menu')} />}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}>
        {inviteError ? (
          <Gutter>
            <Notice>{inviteError}</Notice>
          </Gutter>
        ) : null}

        {/* You: who you owe and who owes you, each with its action. */}
        <Gutter>
          {mine.length === 0 ? (
            <AllSquareCard
              line={myBalance === 0 ? 'Nobody owes you and you don’t owe anyone here.' : balanceSentence(myBalance, group.currency)}
            />
          ) : (
            mine.map((t) => <YouCard key={`${t.other}-${t.iOwe}`} {...t} />)
          )}
        </Gutter>

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
                  {group.roles[uid] === 'admin' ? (
                    <Text variant="caption" muted numberOfLines={1} style={{ fontSize: 11 }}>
                      Co-owner
                    </Text>
                  ) : null}
                  {/* Owner and co-owners: nudge someone who owes. Guests have no app to receive it. */}
                  {canRemind && !isMe && !guest && bal < 0 && !owesMe.has(uid) ? (
                    remindedToday(uid) ? (
                      <Text variant="caption" muted style={{ marginTop: 2 }}>
                        Reminded
                      </Text>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remind ${name(uid)} to settle up`}
                        onPress={() => sendReminder(uid)}
                        disabled={remind.isPending}
                        hitSlop={6}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 3,
                          marginTop: 2,
                          paddingVertical: 3,
                          paddingHorizontal: space.sm,
                          borderRadius: radius.pill,
                          backgroundColor: c.surfaceAlt,
                          opacity: pressed || remind.isPending ? 0.6 : 1,
                        })}>
                        <MaterialIcons name="notifications-none" size={13} color={c.primary} />
                        <Text variant="caption" color={c.primary} style={{ fontWeight: '700' }}>
                          Remind
                        </Text>
                      </Pressable>
                    )
                  ) : null}
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
        </View>

        {/* Who owes whom, drawn as arrows between faces. Owners and co-owners can switch to everyone. */}
        {transfers.length > 0 ? (
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg }}>
              <Text variant="heading" style={{ fontSize: 19, fontWeight: '700' }}>
                Who owes whom
              </Text>
              {othersOnly ? (
                <Segmented
                  options={[
                    { id: 'me', label: 'Just me' },
                    { id: 'all', label: 'Everyone' },
                  ]}
                  value={webView}
                  onChange={setWebView}
                />
              ) : null}
            </View>
            <Gutter>
              {shownTransfers.length > 0 ? (
                <OweWeb memberIds={group.memberIds} transfers={shownTransfers} currency={group.currency} />
              ) : (
                <Text muted>You’re not in any of these. Switch to Everyone to see them.</Text>
              )}
              {webView === 'all' ? (
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
          </View>
        ) : null}

        {/* What's been happening: expenses and payments as a chat. */}
        <View style={{ gap: space.md }}>
          <View style={{ gap: 2 }}>
            <SectionTitle title="What’s been happening" />
            {summary.seesAll ? null : (
              <Gutter>
                <Text variant="caption" muted>
                  Only items you added are shown. The owner and co-owners see everything.
                </Text>
              </Gutter>
            )}
          </View>
          <Gutter>
            <GroupFeed groupId={group.id} currency={group.currency} emptyText="Nothing here yet. Tap Add expense to log the first one." />
          </Gutter>
        </View>
        {/* Room for the floating button. */}
        <View style={{ height: 96 }} />
      </HeroScreen>

      <FloatingButton label="Add expense" onPress={() => router.push({ pathname: '/add-expense', params: { groupId: group.id } })} />

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
          <Divider />
          {group.hiddenByMe ? (
            <MenuRow
              label="Bring back to your list"
              detail="Put back with your other groups"
              onPress={() => {
                setSheet(null);
                setHidden.mutate({ groupId: group.id, hidden: false });
              }}
            />
          ) : (
            <MenuRow
              label="Done with this group"
              detail="Moves it to Put away on your Groups page. Only for you."
              onPress={() => {
                setSheet(null);
                setHidden.mutate(
                  { groupId: group.id, hidden: true },
                  {
                    onSuccess: gone,
                    onError: (e) => Alert.alert('Couldn’t put it away', e instanceof Error ? e.message : 'Please try again.'),
                  },
                );
              }}
            />
          )}
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
