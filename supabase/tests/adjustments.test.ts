/**
 * Split with adjustments against the LOCAL Supabase stack: an adjustment, including a negative
 * one (a discount), is saved with the share so the edit screen can show it again.
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
    email: `${name}-adjust-${run}@example.com`,
    password: 'correct-horse-battery',
    options: { data: { name } },
  });
  if (error || !data.user) throw error ?? new Error('no user');
  return { client, id: data.user.id };
}

describe('Split with adjustments (Supabase)', () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let groupId: string;
  let guestId: string;

  beforeAll(async () => {
    alice = await signUp('Alice');
    const { data } = await alice.client.rpc('create_group', { p_name: 'Dinner club', p_currency: 'AUD' });
    groupId = data.id;
    guestId = (await alice.client.rpc('add_guest', { p_group_id: groupId, p_name: 'Sam' })).data;
  });

  it('saves adjustments, including a discount, with each share', async () => {
    const shares = [
      { userId: alice.id, adjustment: 1500 },
      { userId: guestId, adjustment: -500 },
    ];
    const splits = computeSplit(9000, { method: 'adjustment', shares }).map((s) => ({
      user_id: s.userId,
      amount_cents: s.amount,
      weight: shares.find((x) => x.userId === s.userId)!.adjustment,
    }));
    const { data: id, error } = await alice.client.rpc('create_expense', {
      p_group_id: groupId,
      p_description: 'Dinner',
      p_amount_cents: 9000,
      p_payer_id: alice.id,
      p_split_method: 'adjustment',
      p_splits: splits,
      p_occurred_at: new Date().toISOString(),
    });
    expect(error).toBeNull();

    const { data: saved } = await alice.client
      .from('expense_splits')
      .select('user_id, amount_cents, weight')
      .eq('expense_id', id);
    const byUser = new Map(saved!.map((s) => [s.user_id, s]));
    // $90 + $5 discount - $15 extra = $80, $40 each; Alice +$15, Sam -$5.
    expect(byUser.get(alice.id)).toMatchObject({ amount_cents: 5500, weight: 1500 });
    expect(byUser.get(guestId)).toMatchObject({ amount_cents: 3500, weight: -500 });
  });
});
