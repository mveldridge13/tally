/**
 * Split by item against the LOCAL Supabase stack: items are saved with the expense, checked
 * by the database, cleared when the method changes, and follow a guest who joins for real.
 *
 * Run: npm run test:db
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeSplit, type SplitItem } from '@tally/shared';
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
    email: `${name}-items-${run}@example.com`,
    password: 'correct-horse-battery',
    options: { data: { name } },
  });
  if (error || !data.user) throw error ?? new Error('no user');
  return { client, id: data.user.id };
}

const rpcSplits = (amount: number, items: SplitItem[]) =>
  computeSplit(amount, { method: 'items', items }).map((s) => ({ user_id: s.userId, amount_cents: s.amount }));
const rpcItems = (items: SplitItem[]) => items.map((i) => ({ name: i.name, amount_cents: i.amount, user_ids: i.userIds }));

describe('Split by item (Supabase)', () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;
  let groupId: string;
  let guestId: string;
  let expenseId: string;

  beforeAll(async () => {
    [alice, bob] = await Promise.all([signUp('Alice'), signUp('Bob')]);
    const { data } = await alice.client.rpc('create_group', { p_name: 'Dinner club', p_currency: 'AUD' });
    groupId = data.id;
    guestId = (await alice.client.rpc('add_guest', { p_group_id: groupId, p_name: 'Sam' })).data;
  });

  it('saves the items with the expense', async () => {
    const items: SplitItem[] = [
      { name: 'Steak', amount: 4000, userIds: [alice.id] },
      { name: 'Garlic bread', amount: 1000, userIds: [alice.id, guestId] },
    ];
    const { data, error } = await alice.client.rpc('create_expense', {
      p_group_id: groupId,
      p_description: 'Dinner',
      p_amount_cents: 5500,
      p_payer_id: alice.id,
      p_split_method: 'items',
      p_splits: rpcSplits(5500, items),
      p_items: rpcItems(items),
    });
    expect(error).toBeNull();
    expenseId = data;

    const { data: row } = await alice.client.from('expenses').select('split_method, items').eq('id', expenseId).single();
    expect(row?.split_method).toBe('items');
    expect(row?.items).toEqual(rpcItems(items));
  });

  it('rejects items that are missing, name someone outside the split, or exceed the total', async () => {
    const base = {
      p_group_id: groupId,
      p_description: 'Bad',
      p_amount_cents: 1000,
      p_payer_id: alice.id,
      p_split_method: 'items',
      p_splits: [{ user_id: alice.id, amount_cents: 1000 }],
    };
    expect((await alice.client.rpc('create_expense', base)).error?.message).toMatch(/at least one item/);
    expect(
      (await alice.client.rpc('create_expense', { ...base, p_items: [{ name: 'Chips', amount_cents: 1000, user_ids: [guestId] }] }))
        .error?.message,
    ).toMatch(/must be in the split/);
    expect(
      (await alice.client.rpc('create_expense', { ...base, p_items: [{ name: 'Chips', amount_cents: 1200, user_ids: [alice.id] }] }))
        .error?.message,
    ).toMatch(/Items add up to 1200/);
    expect(
      (await alice.client.rpc('create_expense', { ...base, p_items: [{ name: ' ', amount_cents: 1000, user_ids: [alice.id] }] }))
        .error?.message,
    ).toMatch(/needs a name/);
  });

  it('moves a guest’s items to the person who claims them', async () => {
    const { data: token } = await alice.client.rpc('create_invite', { p_group_id: groupId, p_guest_id: guestId });
    expect((await bob.client.rpc('accept_invite', { p_token: token })).error).toBeNull();

    const { data: row } = await alice.client.from('expenses').select('items').eq('id', expenseId).single();
    expect(row?.items[1].user_ids).toEqual([alice.id, bob.id]);
  });

  it('clears the items when the expense switches to another method', async () => {
    const { error } = await alice.client.rpc('update_expense', {
      p_expense_id: expenseId,
      p_description: 'Dinner',
      p_amount_cents: 5500,
      p_payer_id: alice.id,
      p_split_method: 'equal',
      p_occurred_at: new Date().toISOString(),
      p_splits: computeSplit(5500, { method: 'equal', participants: [alice.id, bob.id] }).map((s) => ({
        user_id: s.userId,
        amount_cents: s.amount,
      })),
      p_items: rpcItems([{ name: 'Ignored', amount: 100, userIds: [alice.id] }]),
    });
    expect(error).toBeNull();
    const { data: row } = await alice.client.from('expenses').select('items').eq('id', expenseId).single();
    expect(row?.items).toBeNull();
  });

  it('still accepts expenses from app builds that don’t send items', async () => {
    const { error } = await alice.client.rpc('create_expense', {
      p_group_id: groupId,
      p_description: 'Taxi',
      p_amount_cents: 2000,
      p_payer_id: alice.id,
      p_split_method: 'exact',
      p_splits: [{ user_id: alice.id, amount_cents: 2000 }],
    });
    expect(error).toBeNull();
  });
});
