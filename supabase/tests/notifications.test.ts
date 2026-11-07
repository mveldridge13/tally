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
