/**
 * "People you split with", against the LOCAL Supabase stack. Run: npm run test:db
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
  const { data, error } = await client.auth.signUp({ email: `${name}-${run}@example.com`, password: 'correct-horse-battery', options: { data: { name } } });
  if (error || !data.user) throw error ?? new Error('no user');
  return { client, id: data.user.id };
}

async function newGroup(owner: { client: SupabaseClient }, name: string): Promise<string> {
  const { data, error } = await owner.client.rpc('create_group', { p_name: name, p_currency: 'AUD' });
  if (error) throw error;
  return data.id;
}

async function join(who: { client: SupabaseClient }, by: { client: SupabaseClient }, groupId: string) {
  const { data: token } = await by.client.rpc('create_invite', { p_group_id: groupId });
  const { error } = await who.client.rpc('accept_invite', { p_token: token });
  if (error) throw error;
}

const memberIds = async (who: { client: SupabaseClient }, groupId: string) =>
  ((await who.client.from('group_members').select('user_id').eq('group_id', groupId).is('left_at', null)).data ?? []).map((r) => r.user_id);

describe('People you split with', () => {
  let me: Awaited<ReturnType<typeof signUp>>;
  let flatmate: Awaited<ReturnType<typeof signUp>>;
  let friend: Awaited<ReturnType<typeof signUp>>;
  let stranger: Awaited<ReturnType<typeof signUp>>;
  let flatId: string;

  beforeAll(async () => {
    [me, flatmate, friend, stranger] = await Promise.all([signUp('PMe'), signUp('PFlat'), signUp('PFriend'), signUp('PStranger')]);
    flatId = await newGroup(me, 'Flat');
    await join(flatmate, me, flatId);
    await join(friend, me, flatId);
    await me.client.rpc('add_guest', { p_group_id: flatId, p_name: 'Guest Gary' });
  });

  it('lists people you share a group with, but not yourself, guests or strangers', async () => {
    const { data, error } = await me.client.rpc('split_partners');
    expect(error).toBeNull();
    const ids = data.map((p: { user_id: string }) => p.user_id);
    expect(ids.sort()).toEqual([flatmate.id, friend.id].sort());
    expect(data.find((p: { user_id: string }) => p.user_id === flatmate.id)).toMatchObject({ name: 'PFlat', shared_groups: 1 });
  });

  it('adds split partners to a new group without an invite', async () => {
    const dinnerId = await newGroup(me, 'Dinner');
    const { error } = await me.client.rpc('add_members', { p_group_id: dinnerId, p_user_ids: [flatmate.id, friend.id, flatmate.id] });
    expect(error).toBeNull();
    expect((await memberIds(me, dinnerId)).sort()).toEqual([me.id, flatmate.id, friend.id].sort());

    const { data } = await me.client.rpc('split_partners');
    expect(data.find((p: { user_id: string }) => p.user_id === flatmate.id).shared_groups).toBe(2);
  });

  it('refuses strangers, and adds nobody when one person can’t be added', async () => {
    const tripId = await newGroup(me, 'Trip');
    const { error } = await me.client.rpc('add_members', { p_group_id: tripId, p_user_ids: [flatmate.id, stranger.id] });
    expect(error?.code).toBe('42501');
    expect(await memberIds(me, tripId)).toEqual([me.id]);
  });

  it('refuses people already in the group', async () => {
    const { error } = await me.client.rpc('add_members', { p_group_id: flatId, p_user_ids: [friend.id] });
    expect(error?.code).toBe('23505');
  });

  it('only lets members of the group add people', async () => {
    const strangersGroup = await newGroup(stranger, 'Not yours');
    const { error } = await me.client.rpc('add_members', { p_group_id: strangersGroup, p_user_ids: [flatmate.id] });
    expect(error?.code).toBe('42501');
  });

  it('brings back someone who left, with their history', async () => {
    const clubId = await newGroup(me, 'Club');
    await me.client.rpc('add_members', { p_group_id: clubId, p_user_ids: [friend.id] });
    expect((await friend.client.rpc('leave_group', { p_group_id: clubId })).error).toBeNull();
    expect(await memberIds(me, clubId)).toEqual([me.id]);

    expect((await me.client.rpc('add_members', { p_group_id: clubId, p_user_ids: [friend.id] })).error).toBeNull();
    expect((await memberIds(me, clubId)).sort()).toEqual([me.id, friend.id].sort());
  });

  it('is not available when signed out', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    expect((await anon.rpc('split_partners')).error).not.toBeNull();
  });
});
