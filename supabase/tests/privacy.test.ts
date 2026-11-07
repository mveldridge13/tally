/**
 * Member privacy: the owner sees everything in a group; members see only the expenses and
 * payments they added themselves. Balances come from my_group_summaries(), worked out
 * on the server from the whole ledger.
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
  my_balance: number;
  my_share: number;
  total_spent: number | null;
  balances: { user_id: string; balance_cents: number }[];
  transfers: { from_user_id: string; to_user_id: string; amount_cents: number }[];
}

describe('Member privacy', () => {
  let alice: Awaited<ReturnType<typeof signUp>>; // owner
  let bob: Awaited<ReturnType<typeof signUp>>; // member
  let cara: Awaited<ReturnType<typeof signUp>>; // member
  let groupId: string;
  let caraExpense: string;
  let carasPaymentToAlice: string;

  const summary = async (who: typeof alice) =>
    ((await who.client.rpc('my_group_summaries')).data as Summary[]).find((g) => g.group_id === groupId)!;

  beforeAll(async () => {
    [alice, bob, cara] = await Promise.all([signUp('PrivAlice'), signUp('PrivBob'), signUp('PrivCara')]);
    const { data: g } = await alice.client.rpc('create_group', { p_name: 'Flat', p_currency: 'AUD' });
    groupId = g.id;
    for (const who of [bob, cara]) {
      const { data: t } = await alice.client.rpc('create_invite', { p_group_id: groupId });
      await who.client.rpc('accept_invite', { p_token: t });
    }
    const split3 = (total: number) => [alice, bob, cara].map((p) => ({ user_id: p.id, amount_cents: total / 3 }));
    // Alice paid 90.00, Bob paid 30.00, Cara paid 60.00 — all split three ways (30/10/20 each).
    await alice.client.rpc('create_expense', { p_group_id: groupId, p_description: 'Rent', p_amount_cents: 9000, p_payer_id: alice.id, p_split_method: 'equal', p_splits: split3(9000) });
    await bob.client.rpc('create_expense', { p_group_id: groupId, p_description: 'Internet', p_amount_cents: 3000, p_payer_id: bob.id, p_split_method: 'equal', p_splits: split3(3000) });
    const { data: e } = await cara.client.rpc('create_expense', { p_group_id: groupId, p_description: 'Power', p_amount_cents: 6000, p_payer_id: cara.id, p_split_method: 'equal', p_splits: split3(6000) });
    caraExpense = e;
    // Cara paid Alice back 5.00.
    const { data: p } = await cara.client.rpc('record_settlement', { p_group_id: groupId, p_from_user_id: cara.id, p_to_user_id: alice.id, p_amount_cents: 500 });
    carasPaymentToAlice = p;
  });

  it('the owner reads every expense and payment', async () => {
    const { data: expenses } = await alice.client.from('expenses').select('description').eq('group_id', groupId).order('description');
    expect(expenses!.map((e) => e.description)).toEqual(['Internet', 'Power', 'Rent']);
    const { data: payments } = await alice.client.from('settlements').select('id').eq('group_id', groupId);
    expect(payments).toHaveLength(1);
  });

  it('a member reads only the expenses and payments they added', async () => {
    const { data: bobs } = await bob.client.from('expenses').select('description').eq('group_id', groupId);
    expect(bobs!.map((e) => e.description)).toEqual(['Internet']);
    expect((await bob.client.from('settlements').select('id').eq('group_id', groupId)).data).toEqual([]);
    // Splits of hidden expenses are hidden too.
    expect((await bob.client.from('expense_splits').select('expense_id').eq('expense_id', caraExpense)).data).toEqual([]);

    const { data: caras } = await cara.client.from('settlements').select('id').eq('group_id', groupId);
    expect(caras!.map((s) => s.id)).toEqual([carasPaymentToAlice]);
  });

  it("a member's balance still comes from the whole ledger", async () => {
    // Net: Alice +90 −30 −10 −20 −5 received = +25; Bob +30 −30 −10 −20 = −30; Cara +60 −30 −10 −20 +5 = +5.
    const owner = await summary(alice);
    const byId = Object.fromEntries(owner.balances.map((b) => [b.user_id, b.balance_cents]));
    expect(byId).toEqual({ [alice.id]: 2500, [bob.id]: -3000, [cara.id]: 500 });
    expect(owner.total_spent).toBe(18000);

    const b = await summary(bob);
    expect(b.my_balance).toBe(-3000);
    expect(b.my_share).toBe(6000);
  });

  it('a member gets only their own balance and lines, plus the group total', async () => {
    const b = await summary(bob);
    expect(b.balances).toEqual([{ user_id: bob.id, balance_cents: -3000 }]);
    expect(b.total_spent).toBe(18000);
    for (const t of b.transfers) expect([t.from_user_id, t.to_user_id]).toContain(bob.id);
    // Bob owes 30.00 in total: 25.00 to Alice and 5.00 to Cara (largest creditor first).
    expect(b.transfers).toEqual([
      { from_user_id: bob.id, to_user_id: alice.id, amount_cents: 2500 },
      { from_user_id: bob.id, to_user_id: cara.id, amount_cents: 500 },
    ]);
    // The owner sees the same lines.
    expect((await summary(alice)).transfers).toEqual(b.transfers);
  });

  it("a member can't edit or delete someone else's expense, or undo a payment they're not in", async () => {
    const edit = await bob.client.rpc('update_expense', {
      p_expense_id: caraExpense, p_description: 'x', p_amount_cents: 300, p_payer_id: bob.id, p_split_method: 'equal',
      p_splits: [{ user_id: bob.id, amount_cents: 300 }], p_occurred_at: new Date().toISOString(),
    });
    expect(edit.error?.message).toMatch(/Expense not found/);
    expect((await bob.client.rpc('delete_expense', { p_expense_id: caraExpense })).error?.message).toMatch(/Expense not found/);
    expect((await bob.client.rpc('void_settlement', { p_settlement_id: carasPaymentToAlice })).error?.message).toMatch(/not found/);
    // A payment to Bob that Cara recorded is hers, not his: he can't see it or undo it.
    const { data: toBob } = await cara.client.rpc('record_settlement', { p_group_id: groupId, p_from_user_id: cara.id, p_to_user_id: bob.id, p_amount_cents: 100 });
    expect((await bob.client.from('settlements').select('id').eq('id', toBob)).data).toEqual([]);
    expect((await bob.client.rpc('void_settlement', { p_settlement_id: toBob })).error?.message).toMatch(/not found/);
    expect((await alice.client.from('settlements').select('id').eq('id', toBob)).data).toHaveLength(1);
    // The owner still can.
    expect((await alice.client.rpc('delete_expense', { p_expense_id: caraExpense })).error).toBeNull();
  });

  it('members no longer get everyone\'s balances from group_balances', async () => {
    expect((await bob.client.rpc('group_balances', { p_group_id: groupId })).data).toEqual([]);
    expect((await alice.client.rpc('group_balances', { p_group_id: groupId })).data).toHaveLength(3);
  });
});
