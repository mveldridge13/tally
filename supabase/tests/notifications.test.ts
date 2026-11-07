/**
 * Notifications: you hear about it when someone else adds you to a group, not when you join
 * one yourself.
 *
 * Run against the LOCAL Supabase stack: npm run test:db
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const run = Math.random().toString(36).slice(2, 8);

async function signUp(name: string): Promise<{ client: SupabaseClient; id: string }> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({
    email: `${name}-${run}@example.com`,
    password: 'correct-horse-battery',
    options: { data: { name } },
  });
  if (error || !data.user) throw error ?? new Error('no user');
  return { client, id: data.user.id };
}

interface Note {
  id: string;
  kind: string;
  group_id: string;
  group_name: string;
  actor_name: string;
  read_at: string | null;
}
const notes = async (who: { client: SupabaseClient }) => (await who.client.rpc('my_notifications')).data as Note[];

describe('Notifications', () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;
  let tripId: string;

  beforeAll(async () => {
    [alice, bob] = await Promise.all([signUp('NoteAlice'), signUp('NoteBob')]);
    // Bob joins Alice's flat with an invite, so they become split partners.
    const { data: flat } = await alice.client.rpc('create_group', {
      p_name: 'Flat',
      p_currency: 'AUD',
    });
    const { data: t } = await alice.client.rpc('create_invite', {
      p_group_id: flat.id,
    });
    await bob.client.rpc('accept_invite', { p_token: t });
    const { data: trip } = await alice.client.rpc('create_group', {
      p_name: 'Trip',
      p_currency: 'AUD',
    });
    tripId = trip.id;
  });

  it("joining a group yourself (invite or creating it) doesn't notify you", async () => {
    expect(await notes(bob)).toEqual([]);
    expect(await notes(alice)).toEqual([]);
  });

  it('being added by someone else notifies you, with their name and the group', async () => {
    expect(
      (
        await alice.client.rpc('add_members', {
          p_group_id: tripId,
          p_user_ids: [bob.id],
        })
      ).error,
    ).toBeNull();
    const list = await notes(bob);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      kind: 'added_to_group',
      group_id: tripId,
      group_name: 'Trip',
      actor_name: 'NoteAlice',
      read_at: null,
    });
    expect(await notes(alice)).toEqual([]);
  });

  it("you can't read anyone else's notifications", async () => {
    expect((await alice.client.from('notifications').select('id')).data).toEqual([]);
    expect((await bob.client.from('notifications').select('id')).data).toHaveLength(1);
  });

  it('opening the list marks them read', async () => {
    expect((await bob.client.rpc('mark_notifications_read')).error).toBeNull();
    expect((await notes(bob))[0].read_at).not.toBeNull();
  });

  it('being added back after leaving notifies you again; groups you left are hidden', async () => {
    await bob.client.rpc('leave_group', { p_group_id: tripId });
    expect(await notes(bob)).toEqual([]);
    await alice.client.rpc('add_members', {
      p_group_id: tripId,
      p_user_ids: [bob.id],
    });
    const list = await notes(bob);
    expect(list.filter((n) => n.read_at === null)).toHaveLength(1);
  });

  it('people can only change notifications through the read function', async () => {
    const id = (await notes(bob))[0].id;
    await bob.client.from('notifications').delete().eq('id', id);
    await bob.client.from('notifications').insert({ user_id: bob.id, kind: 'added_to_group', group_id: tripId });
    expect((await notes(bob)).length).toBe(2);
  });
});

describe('Settle-up reminders', () => {
  let owner: Awaited<ReturnType<typeof signUp>>;
  let member: Awaited<ReturnType<typeof signUp>>;
  let other: Awaited<ReturnType<typeof signUp>>;
  let groupId: string;

  beforeAll(async () => {
    [owner, member, other] = await Promise.all([signUp('RemOwner'), signUp('RemMember'), signUp('RemOther')]);
    const { data: g } = await owner.client.rpc('create_group', { p_name: 'Flat', p_currency: 'AUD' });
    groupId = g.id;
    for (const who of [member, other]) {
      const { data: t } = await owner.client.rpc('create_invite', { p_group_id: groupId });
      await who.client.rpc('accept_invite', { p_token: t });
    }
    // Owner paid 60.00 for the owner and the member: the member owes 30.00. Other is square.
    await owner.client.rpc('create_expense', {
      p_group_id: groupId,
      p_description: 'Power',
      p_amount_cents: 6000,
      p_payer_id: owner.id,
      p_split_method: 'equal',
      p_splits: [
        { user_id: owner.id, amount_cents: 3000 },
        { user_id: member.id, amount_cents: 3000 },
      ],
    });
  });

  it('only the owner can remind, and only someone who owes', async () => {
    expect((await member.client.rpc('remind_to_settle', { p_group_id: groupId, p_user_id: other.id })).error?.message).toMatch(/Only the group owner/);
    expect((await owner.client.rpc('remind_to_settle', { p_group_id: groupId, p_user_id: other.id })).error?.message).toMatch(/don't owe anything/);
    expect((await owner.client.rpc('remind_to_settle', { p_group_id: groupId, p_user_id: owner.id })).error).not.toBeNull();
  });

  it('the member gets a reminder with what they owe', async () => {
    expect((await owner.client.rpc('remind_to_settle', { p_group_id: groupId, p_user_id: member.id })).error).toBeNull();
    const list = (await member.client.rpc('my_notifications')).data as (Note & { amount_cents: number; group_currency: string })[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: 'settle_reminder', group_id: groupId, actor_name: 'RemOwner', amount_cents: 3000, group_currency: 'AUD' });
  });

  it('once a day per person', async () => {
    expect((await owner.client.rpc('remind_to_settle', { p_group_id: groupId, p_user_id: member.id })).error?.message).toMatch(/Already reminded/);
  });

  it('the owner sees when each person was last reminded; members see nothing', async () => {
    const { data } = await owner.client.rpc('group_reminders', { p_group_id: groupId });
    expect(data.map((r: { user_id: string }) => r.user_id)).toEqual([member.id]);
    expect((await member.client.rpc('group_reminders', { p_group_id: groupId })).data).toEqual([]);
  });
});
