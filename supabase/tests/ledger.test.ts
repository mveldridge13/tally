/**
 * Integration tests against the LOCAL Supabase stack (`npx supabase start`).
 * They sign up real users and verify Row Level Security and the money rules
 * enforced by the database functions.
 *
 * Run: npm run test:db
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeSplit } from '@tally/shared';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// Standard public anon key for local Supabase (not a secret).
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

describe('Tally ledger (Supabase)', () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;
  let eve: Awaited<ReturnType<typeof signUp>>;
  let groupId: string;

  beforeAll(async () => {
    [alice, bob, eve] = await Promise.all([signUp('Alice'), signUp('Bob'), signUp('Eve')]);
  });

  it('creates a profile on sign-up', async () => {
    const { data, error } = await alice.client.from('profiles').select('name').eq('id', alice.id).single();
    expect(error).toBeNull();
    expect(data?.name).toBe('Alice');
  });

  it('creates a group with the creator as owner', async () => {
    const { data, error } = await alice.client.rpc('create_group', { p_name: 'Lisbon', p_currency: 'EUR' });
    expect(error).toBeNull();
    groupId = data.id;
    const { data: members } = await alice.client.from('group_members').select('user_id, role');
    expect(members).toEqual([{ user_id: alice.id, role: 'owner' }]);
  });

  it('joins via invite link', async () => {
    const { data: token, error } = await alice.client.rpc('create_invite', { p_group_id: groupId });
    expect(error).toBeNull();
    const { data: joined, error: joinError } = await bob.client.rpc('accept_invite', { p_token: token });
    expect(joinError).toBeNull();
    expect(joined).toBe(groupId);
  });

  it('records an expense whose splits sum to the total', async () => {
    const splits = computeSplit(10000, { method: 'equal', participants: [alice.id, bob.id] });
    const { error } = await alice.client.rpc('create_expense', {
      p_group_id: groupId,
      p_description: 'Dinner',
      p_amount_cents: 10000,
      p_payer_id: alice.id,
      p_split_method: 'equal',
      p_splits: splits.map((s) => ({ user_id: s.userId, amount_cents: s.amount })),
    });
    expect(error).toBeNull();
  });

  it('rejects splits that do not add up', async () => {
    const { error } = await alice.client.rpc('create_expense', {
      p_group_id: groupId,
      p_description: 'Bad',
      p_amount_cents: 10000,
      p_payer_id: alice.id,
      p_split_method: 'exact',
      p_splits: [
        { user_id: alice.id, amount_cents: 5000 },
        { user_id: bob.id, amount_cents: 4999 },
      ],
    });
    expect(error?.message).toMatch(/add up to 9999/);
  });

  it('rejects fractional cents and non-member participants', async () => {
    const frac = await alice.client.rpc('create_expense', {
      p_group_id: groupId, p_description: 'Frac', p_amount_cents: 100, p_payer_id: alice.id, p_split_method: 'exact',
      p_splits: [{ user_id: alice.id, amount_cents: 50.5 }, { user_id: bob.id, amount_cents: 49.5 }],
    });
    expect(frac.error?.message).toMatch(/whole cents/);

    const outsider = await alice.client.rpc('create_expense', {
      p_group_id: groupId, p_description: 'Outsider', p_amount_cents: 100, p_payer_id: alice.id, p_split_method: 'exact',
      p_splits: [{ user_id: eve.id, amount_cents: 100 }],
    });
    expect(outsider.error?.message).toMatch(/member of the group/);
  });

  it('computes balances that net to zero, and applies settlements', async () => {
    // Only the owner gets everyone's balances; a member gets none from group_balances.
    expect((await bob.client.rpc('group_balances', { p_group_id: groupId })).data).toEqual([]);
    let { data } = await alice.client.rpc('group_balances', { p_group_id: groupId });
    const before = Object.fromEntries(data.map((r: { user_id: string; balance_cents: number }) => [r.user_id, r.balance_cents]));
    expect(before).toEqual({ [alice.id]: 5000, [bob.id]: -5000 });

    const { error } = await bob.client.rpc('record_settlement', {
      p_group_id: groupId, p_from_user_id: bob.id, p_to_user_id: alice.id, p_amount_cents: 5000,
    });
    expect(error).toBeNull();

    ({ data } = await alice.client.rpc('group_balances', { p_group_id: groupId }));
    for (const row of data) expect(row.balance_cents).toBe(0);
  });

  it('hides groups and expenses from non-members', async () => {
    const groups = await eve.client.from('groups').select('*');
    const expenses = await eve.client.from('expenses').select('*');
    const balances = await eve.client.rpc('group_balances', { p_group_id: groupId });
    expect(groups.data).toEqual([]);
    expect(expenses.data).toEqual([]);
    expect(balances.data).toEqual([]);

    const sneaky = await eve.client.rpc('create_expense', {
      p_group_id: groupId, p_description: 'x', p_amount_cents: 100, p_payer_id: eve.id, p_split_method: 'equal',
      p_splits: [{ user_id: eve.id, amount_cents: 100 }],
    });
    expect(sneaky.error?.message).toMatch(/not a member/);
  });

  it('blocks direct writes that bypass the functions', async () => {
    const { error } = await alice.client.from('expenses').insert({
      group_id: groupId, description: 'Direct', amount_cents: 1, payer_id: alice.id, created_by: alice.id, split_method: 'equal',
    });
    expect(error).not.toBeNull();

    const { error: updateError } = await alice.client.from('expenses').update({ amount_cents: 1 }).eq('group_id', groupId);
    const { data } = await alice.client.from('expenses').select('amount_cents').eq('group_id', groupId);
    expect(updateError !== null || data?.every((e) => e.amount_cents !== 1)).toBe(true);
  });

  it('keeps a revision when an expense is edited or deleted', async () => {
    const { data: rows } = await alice.client.from('expenses').select('id').eq('group_id', groupId).single();
    const expenseId = rows!.id;
    const edit = await alice.client.rpc('update_expense', {
      p_expense_id: expenseId, p_description: 'Dinner (edited)', p_amount_cents: 9000, p_payer_id: alice.id,
      p_split_method: 'exact', p_occurred_at: new Date().toISOString(),
      p_splits: [{ user_id: alice.id, amount_cents: 3000 }, { user_id: bob.id, amount_cents: 6000 }],
    });
    expect(edit.error).toBeNull();
    const del = await alice.client.rpc('delete_expense', { p_expense_id: expenseId });
    expect(del.error).toBeNull();

    const { data: revisions } = await alice.client.from('expense_revisions').select('before').eq('expense_id', expenseId);
    expect(revisions).toHaveLength(2);
    expect(revisions![0]!.before.description).toBe('Dinner');
  });

  it('rejects calls from signed-out users', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { error } = await anon.rpc('create_group', { p_name: 'x', p_currency: 'USD' });
    expect(error).not.toBeNull();
  });
});
