/**
 * Group deletion rules, against the LOCAL Supabase stack. Run: npm run test:db
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

describe('Deleting a group', () => {
  let owner: Awaited<ReturnType<typeof signUp>>;
  let member: Awaited<ReturnType<typeof signUp>>;
  let groupId: string;
  let token: string;

  beforeAll(async () => {
    [owner, member] = await Promise.all([signUp('Owner'), signUp('Member')]);
    const { data: g } = await owner.client.rpc('create_group', { p_name: 'Doomed', p_currency: 'AUD' });
    groupId = g.id;
    const { data: t } = await owner.client.rpc('create_invite', { p_group_id: groupId });
    await member.client.rpc('accept_invite', { p_token: t });
    const { data: t2 } = await owner.client.rpc('create_invite', { p_group_id: groupId });
    token = t2;
    await owner.client.rpc('create_expense', {
      p_group_id: groupId, p_description: 'Taxi', p_amount_cents: 2000, p_payer_id: owner.id, p_split_method: 'equal',
      p_splits: [{ user_id: owner.id, amount_cents: 1000 }, { user_id: member.id, amount_cents: 1000 }],
    });
  });

  it('is refused for a member who is not the owner', async () => {
    const { error } = await member.client.rpc('delete_group', { p_group_id: groupId });
    expect(error?.message).toMatch(/Only the group owner/);
  });

  it('hides the group and its expenses from every member', async () => {
    const { error } = await owner.client.rpc('delete_group', { p_group_id: groupId });
    expect(error).toBeNull();
    for (const who of [owner, member]) {
      expect((await who.client.from('groups').select('id').eq('id', groupId)).data).toEqual([]);
      expect((await who.client.from('expenses').select('id').eq('group_id', groupId)).data).toEqual([]);
    }
  });

  it('rejects new expenses, payments and invites', async () => {
    const exp = await owner.client.rpc('create_expense', {
      p_group_id: groupId, p_description: 'x', p_amount_cents: 100, p_payer_id: owner.id, p_split_method: 'equal',
      p_splits: [{ user_id: owner.id, amount_cents: 100 }],
    });
    expect(exp.error).not.toBeNull();
    const pay = await member.client.rpc('record_settlement', {
      p_group_id: groupId, p_from_user_id: member.id, p_to_user_id: owner.id, p_amount_cents: 1000,
    });
    expect(pay.error).not.toBeNull();
    const join = await member.client.rpc('accept_invite', { p_token: token });
    expect(join.error?.message).toMatch(/invalid or has expired/);
  });

  it('cannot be deleted twice', async () => {
    const { error } = await owner.client.rpc('delete_group', { p_group_id: groupId });
    expect(error).not.toBeNull();
  });
});

describe('Membership: leave, remove, transfer ownership', () => {
  let owner: Awaited<ReturnType<typeof signUp>>;
  let sam: Awaited<ReturnType<typeof signUp>>;
  let ana: Awaited<ReturnType<typeof signUp>>;
  let groupId: string;

  const join = async (who: typeof sam) => {
    const { data: t } = await owner.client.rpc('create_invite', { p_group_id: groupId });
    const { error } = await who.client.rpc('accept_invite', { p_token: t });
    if (error) throw error;
  };

  beforeAll(async () => {
    [owner, sam, ana] = await Promise.all([signUp('Own2'), signUp('Sam'), signUp('Ana')]);
    const { data: g } = await owner.client.rpc('create_group', { p_name: 'Flat', p_currency: 'AUD' });
    groupId = g.id;
    await join(sam);
    await join(ana);
    // Owner paid 30.00 for Owner + Sam: Sam owes 15.00. Ana has no balance.
    await owner.client.rpc('create_expense', {
      p_group_id: groupId, p_description: 'Groceries', p_amount_cents: 3000, p_payer_id: owner.id, p_split_method: 'equal',
      p_splits: [{ user_id: owner.id, amount_cents: 1500 }, { user_id: sam.id, amount_cents: 1500 }],
    });
  });

  it('blocks leaving with an unsettled balance', async () => {
    const { error } = await sam.client.rpc('leave_group', { p_group_id: groupId });
    expect(error?.message).toMatch(/Settle up before leaving/);
  });

  it('blocks the owner from leaving', async () => {
    const { error } = await owner.client.rpc('leave_group', { p_group_id: groupId });
    expect(error?.message).toMatch(/Make someone else the owner/);
  });

  it('lets a settled member leave, and they lose access', async () => {
    const { error } = await ana.client.rpc('leave_group', { p_group_id: groupId });
    expect(error).toBeNull();
    expect((await ana.client.from('groups').select('id').eq('id', groupId)).data).toEqual([]);
  });

  it('only lets the owner remove members, and only once settled', async () => {
    expect((await sam.client.rpc('remove_member', { p_group_id: groupId, p_user_id: owner.id })).error?.message).toMatch(/Only the group owner/);
    expect((await owner.client.rpc('remove_member', { p_group_id: groupId, p_user_id: sam.id })).error?.message).toMatch(/settle up/);

    const { data: paid } = await sam.client.rpc('record_settlement', { p_group_id: groupId, p_from_user_id: sam.id, p_to_user_id: owner.id, p_amount_cents: 1500 });
    // Sam recorded it, so it counts once the owner confirms it arrived.
    await owner.client.rpc('respond_to_payment', { p_settlement_id: paid, p_received: true });
    expect((await owner.client.rpc('remove_member', { p_group_id: groupId, p_user_id: sam.id })).error).toBeNull();
    expect((await sam.client.from('groups').select('id').eq('id', groupId)).data).toEqual([]);
  });

  it('keeps history when someone rejoins', async () => {
    await join(sam);
    // The owner still sees the old expense; Sam (a member) sees their share of it via the server.
    const { data } = await owner.client.from('expenses').select('description').eq('group_id', groupId);
    expect(data).toEqual([{ description: 'Groceries' }]);
    const { data: mine } = await sam.client.rpc('my_group_summaries');
    expect((mine as { group_id: string; my_share: number }[]).find((g) => g.group_id === groupId)?.my_share).toBe(1500);
  });

  it('transfers ownership so the old owner can leave', async () => {
    expect((await sam.client.rpc('transfer_ownership', { p_group_id: groupId, p_new_owner_id: sam.id })).error).not.toBeNull();
    expect((await owner.client.rpc('transfer_ownership', { p_group_id: groupId, p_new_owner_id: sam.id })).error).toBeNull();

    const { data: roles } = await sam.client.from('group_members').select('user_id, role').eq('group_id', groupId).is('left_at', null);
    expect(roles).toEqual(expect.arrayContaining([{ user_id: sam.id, role: 'owner' }, { user_id: owner.id, role: 'member' }]));

    expect((await owner.client.rpc('leave_group', { p_group_id: groupId })).error).toBeNull();
    expect((await sam.client.rpc('delete_group', { p_group_id: groupId })).error).toBeNull();
  });
});
