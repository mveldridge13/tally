/**
 * my_spending_between: your own share of each group's expenses in a date range, including
 * expenses other people added (which members can't download). Run: npm run test:db
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

const FROM = '2026-11-01T00:00:00Z';
const TO = '2026-12-01T00:00:00Z';

describe('My spending this month', () => {
  let alice: Awaited<ReturnType<typeof signUp>>; // owner
  let bob: Awaited<ReturnType<typeof signUp>>; // member
  let groupId: string;

  const spending = async (who: typeof alice) => {
    const { data, error } = await who.client.rpc('my_spending_between', {
      p_from: FROM,
      p_to: TO,
    });
    if (error) throw error;
    return (data as { group_id: string; my_share: number }[]).find((r) => r.group_id === groupId)?.my_share ?? 0;
  };

  beforeAll(async () => {
    [alice, bob] = await Promise.all([signUp('MonAlice'), signUp('MonBob')]);
    const { data: g } = await alice.client.rpc('create_group', {
      p_name: 'Trip',
      p_currency: 'AUD',
    });
    groupId = g.id;
    const { data: t } = await alice.client.rpc('create_invite', {
      p_group_id: groupId,
    });
    await bob.client.rpc('accept_invite', { p_token: t });
    const half = (total: number) => [alice, bob].map((p) => ({ user_id: p.id, amount_cents: total / 2 }));
    const add = (who: typeof alice, cents: number, at: string) =>
      who.client.rpc('create_expense', {
        p_group_id: groupId,
        p_description: 'Thing',
        p_amount_cents: cents,
        p_payer_id: who.id,
        p_split_method: 'equal',
        p_splits: half(cents),
        p_occurred_at: at,
      });
    // In November: Alice adds 100.00 and Bob adds 40.00, split in half. October's 500.00 doesn't count.
    await add(alice, 10000, '2026-11-05T10:00:00Z');
    await add(bob, 4000, '2026-11-20T10:00:00Z');
    await add(alice, 50000, '2026-10-28T10:00:00Z');
  });

  it('includes your share of expenses other people added', async () => {
    expect(await spending(bob)).toBe(7000);
    expect(await spending(alice)).toBe(7000);
  });

  it('leaves out other months', async () => {
    const { data } = await bob.client.rpc('my_spending_between', {
      p_from: '2026-10-01T00:00:00Z',
      p_to: FROM,
    });
    expect((data as { group_id: string; my_share: number }[]).find((r) => r.group_id === groupId)?.my_share).toBe(25000);
  });

  it('is not available when signed out', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { error } = await anon.rpc('my_spending_between', {
      p_from: FROM,
      p_to: TO,
    });
    expect(error).not.toBeNull();
  });
});
