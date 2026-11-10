/**
 * "Done with this group": each person can put a group away from their own Groups list.
 * Private to them, only for groups they're in, and undone when someone adds an expense.
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

describe('Putting a group away', () => {
  let alice: Awaited<ReturnType<typeof signUp>>; // owner
  let bob: Awaited<ReturnType<typeof signUp>>; // member
  let eve: Awaited<ReturnType<typeof signUp>>; // not in the group
  let groupId: string;

  const hidden = async (who: typeof alice) =>
    ((await who.client.from('hidden_groups').select('group_id, user_id')).data ?? []).filter((r) => r.group_id === groupId);

  beforeAll(async () => {
    [alice, bob, eve] = await Promise.all([signUp('HideAlice'), signUp('HideBob'), signUp('HideEve')]);
    const { data: g } = await alice.client.rpc('create_group', { p_name: 'Trip', p_currency: 'AUD' });
    groupId = g.id;
    const { data: t } = await alice.client.rpc('create_invite', { p_group_id: groupId });
    await bob.client.rpc('accept_invite', { p_token: t });
  });

  it('a member can put a group away, and only they can see it', async () => {
    expect((await bob.client.from('hidden_groups').insert({ group_id: groupId })).error).toBeNull();
    expect(await hidden(bob)).toEqual([{ group_id: groupId, user_id: bob.id }]);
    expect(await hidden(alice)).toEqual([]); // the owner can't see who put it away
  });

  it('nobody can put a group away for someone else, or hide a group they are not in', async () => {
    expect((await alice.client.from('hidden_groups').insert({ group_id: groupId, user_id: bob.id })).error).not.toBeNull();
    expect((await eve.client.from('hidden_groups').insert({ group_id: groupId })).error).not.toBeNull();
  });

  it('they can bring it back', async () => {
    await bob.client.from('hidden_groups').delete().eq('group_id', groupId);
    expect(await hidden(bob)).toEqual([]);
  });

  it('a new expense brings it back for everyone who put it away', async () => {
    await bob.client.from('hidden_groups').insert({ group_id: groupId });
    await alice.client.from('hidden_groups').insert({ group_id: groupId });
    const { error } = await alice.client.rpc('create_expense', {
      p_group_id: groupId,
      p_description: 'Dinner',
      p_amount_cents: 2000,
      p_payer_id: alice.id,
      p_split_method: 'equal',
      p_splits: [
        { user_id: alice.id, amount_cents: 1000 },
        { user_id: bob.id, amount_cents: 1000 },
      ],
    });
    expect(error).toBeNull();
    expect(await hidden(bob)).toEqual([]);
    expect(await hidden(alice)).toEqual([]);
  });
});
