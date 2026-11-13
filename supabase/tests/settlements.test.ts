/**
 * Correcting payments, against the LOCAL Supabase stack. Run: npm run test:db
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

describe('Correcting a payment', () => {
  let a: Awaited<ReturnType<typeof signUp>>;
  let b: Awaited<ReturnType<typeof signUp>>;
  let outsider: Awaited<ReturnType<typeof signUp>>;
  let groupId: string;
  let paymentId: string;
  let correctedId: string;

  const balances = async () =>
    Object.fromEntries(
      ((await a.client.rpc('group_balances', { p_group_id: groupId })).data ?? []).map((r: { user_id: string; balance_cents: number }) => [
        r.user_id === a.id ? 'A' : 'B',
        r.balance_cents,
      ]),
    );

  beforeAll(async () => {
    [a, b, outsider] = await Promise.all([signUp('PayA'), signUp('PayB'), signUp('PayX')]);
    const { data: g } = await a.client.rpc('create_group', { p_name: 'Payments', p_currency: 'AUD' });
    groupId = g.id;
    const { data: t } = await a.client.rpc('create_invite', { p_group_id: groupId });
    await b.client.rpc('accept_invite', { p_token: t });
    // A paid 40.00 split equally: B owes A 20.00.
    await a.client.rpc('create_expense', {
      p_group_id: groupId, p_description: 'Groceries', p_amount_cents: 4000, p_payer_id: a.id, p_split_method: 'equal',
      p_splits: [{ user_id: a.id, amount_cents: 2000 }, { user_id: b.id, amount_cents: 2000 }],
    });
    // B records 15.00 by mistake (should have been 20.00), with a note.
    const { data: sid } = await b.client.rpc('record_settlement', {
      p_group_id: groupId, p_from_user_id: b.id, p_to_user_id: a.id, p_amount_cents: 1500, p_note: 'Bank transfer',
    });
    paymentId = sid;
    // B recorded it, so it counts once A confirms it arrived.
    await a.client.rpc('respond_to_payment', { p_settlement_id: sid, p_received: true });
  });

  it('records the note with a new payment', async () => {
    const { data } = await a.client.from('settlements').select('note').eq('id', paymentId).single();
    expect(data?.note).toBe('Bank transfer');
  });

  it('replaces the payment with a corrected one and keeps the original', async () => {
    expect(await balances()).toEqual({ A: 500, B: -500 });
    const { data, error } = await a.client.rpc('correct_settlement', { p_settlement_id: paymentId, p_amount_cents: 2000, p_note: 'Bank transfer, full amount' });
    expect(error).toBeNull();
    correctedId = data;
    expect(await balances()).toEqual({ A: 0, B: 0 });

    const { data: rows } = await a.client.from('settlements').select('id, status, amount_cents, replaces_id, note').in('id', [paymentId, correctedId]);
    const original = rows!.find((r) => r.id === paymentId)!;
    const corrected = rows!.find((r) => r.id === correctedId)!;
    expect(original).toMatchObject({ status: 'voided', amount_cents: 1500 });
    expect(corrected).toMatchObject({ status: 'recorded', amount_cents: 2000, replaces_id: paymentId, note: 'Bank transfer, full amount' });
  });

  it('cannot correct a payment that was already replaced or undone', async () => {
    const { error } = await a.client.rpc('correct_settlement', { p_settlement_id: paymentId, p_amount_cents: 100 });
    expect(error?.message).toMatch(/Payment not found/);
  });

  it('rejects zero amounts and people outside the group', async () => {
    expect((await a.client.rpc('correct_settlement', { p_settlement_id: correctedId, p_amount_cents: 0 })).error?.message).toMatch(/greater than zero/);
    expect((await outsider.client.rpc('correct_settlement', { p_settlement_id: correctedId, p_amount_cents: 100 })).error?.message).toMatch(/Payment not found/);
  });
});
