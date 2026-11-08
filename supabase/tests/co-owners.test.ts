/**
 * Co-owners: the owner can make a member a co-owner (role 'admin'). A co-owner sees everything
 * the owner sees and can send reminders, but can't manage the group.
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
  const { data, error } = await client.auth.signUp({ email: `${name}-${run}@example.com`, password: 'correct-horse-battery', options: { data: { name } } });
  if (error || !data.user) throw error ?? new Error('no user');
  return { client, id: data.user.id };
}

interface Summary {
  group_id: string;
  role: string;
  balances: { user_id: string; balance_cents: number }[];
  transfers: { from_user_id: string; to_user_id: string; amount_cents: number }[];
}

describe('Co-owners', () => {
  let alice: Awaited<ReturnType<typeof signUp>>; // owner
  let bob: Awaited<ReturnType<typeof signUp>>; // becomes co-owner
  let cara: Awaited<ReturnType<typeof signUp>>; // member
  let groupId: string;

  const summary = async (who: typeof alice) =>
    ((await who.client.rpc('my_group_summaries')).data as Summary[]).find((g) => g.group_id === groupId)!;
  const descriptions = async (who: typeof alice) =>
    ((await who.client.from('expenses').select('description').eq('group_id', groupId).order('description')).data ?? []).map(
      (e) => e.description,
    );
  const setCoOwner = (who: typeof alice, userId: string, coOwner: boolean) =>
    who.client.rpc('set_co_owner', { p_group_id: groupId, p_user_id: userId, p_co_owner: coOwner });

  beforeAll(async () => {
    [alice, bob, cara] = await Promise.all([signUp('CoAlice'), signUp('CoBob'), signUp('CoCara')]);
    const { data: g } = await alice.client.rpc('create_group', { p_name: 'Trip', p_currency: 'AUD' });
    groupId = g.id;
    for (const who of [bob, cara]) {
      const { data: t } = await alice.client.rpc('create_invite', { p_group_id: groupId });
      await who.client.rpc('accept_invite', { p_token: t });
    }
    const split3 = (total: number) => [alice, bob, cara].map((p) => ({ user_id: p.id, amount_cents: total / 3 }));
    await alice.client.rpc('create_expense', { p_group_id: groupId, p_description: 'Hotel', p_amount_cents: 9000, p_payer_id: alice.id, p_split_method: 'equal', p_splits: split3(9000) });
    await cara.client.rpc('create_expense', { p_group_id: groupId, p_description: 'Fuel', p_amount_cents: 3000, p_payer_id: cara.id, p_split_method: 'equal', p_splits: split3(3000) });
  });

  it('a member sees only their own items before becoming a co-owner', async () => {
    expect(await descriptions(bob)).toEqual([]);
    expect((await summary(bob)).balances).toHaveLength(1);
  });

  it('only the owner can choose co-owners', async () => {
    const { error } = await cara.client.rpc('set_co_owner', { p_group_id: groupId, p_user_id: bob.id, p_co_owner: true });
    expect(error?.message).toMatch(/Only the group owner/);
  });

  it('a co-owner sees every expense, balance and transfer', async () => {
    expect((await setCoOwner(alice, bob.id, true)).error).toBeNull();
    const s = await summary(bob);
    expect(s.role).toBe('admin');
    expect(await descriptions(bob)).toEqual(['Fuel', 'Hotel']);
    expect(s.balances).toHaveLength(3);
    expect(s.transfers).toEqual((await summary(alice)).transfers);
    // Cara, a plain member, still sees only her own.
    expect(await descriptions(cara)).toEqual(['Fuel']);
  });

  it('a co-owner can send reminders but cannot manage the group', async () => {
    // Cara owes: paid 30, her share is 40.
    expect((await bob.client.rpc('remind_to_settle', { p_group_id: groupId, p_user_id: cara.id })).error).toBeNull();
    expect((await bob.client.rpc('remove_member', { p_group_id: groupId, p_user_id: cara.id })).error?.message).toMatch(/Only the group owner/);
    expect((await bob.client.rpc('transfer_ownership', { p_group_id: groupId, p_new_owner_id: bob.id })).error?.message).toMatch(
      /Only the group owner/,
    );
    expect((await bob.client.rpc('set_co_owner', { p_group_id: groupId, p_user_id: cara.id, p_co_owner: true })).error?.message).toMatch(
      /Only the group owner/,
    );
  });

  it('removing co-owner turns them back into a member', async () => {
    expect((await setCoOwner(alice, bob.id, false)).error).toBeNull();
    expect((await summary(bob)).role).toBe('member');
    expect(await descriptions(bob)).toEqual([]);
  });

  it('a guest cannot be a co-owner, and the owner cannot co-own their own group', async () => {
    const { data: guestId } = await alice.client.rpc('add_guest', { p_group_id: groupId, p_name: 'Dee' });
    expect((await setCoOwner(alice, guestId, true)).error?.message).toMatch(/guest/);
    expect((await setCoOwner(alice, alice.id, true)).error?.message).toMatch(/already the owner/);
  });
});
