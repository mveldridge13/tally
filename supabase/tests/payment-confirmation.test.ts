/**
 * Payment confirmation against the LOCAL Supabase stack: a payment recorded by anyone but the
 * receiver waits for the receiver to confirm it before it counts.
 *
 * Run: npm run test:db
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
    email: `${name}-confirm-${run}@example.com`,
    password: 'correct-horse-battery',
    options: { data: { name } },
  });
  if (error || !data.user) throw error ?? new Error('no user');
  return { client, id: data.user.id };
}

type Who = Awaited<ReturnType<typeof signUp>>;

describe('Payment confirmation (Supabase)', () => {
  let leo: Who; // owner, paid the bill
  let sam: Who; // owes Leo
  let groupId: string;
  let guestId: string;

  const myBalance = async (who: Who) =>
    ((await who.client.rpc('my_group_summaries')).data as { group_id: string; my_balance: number }[]).find((g) => g.group_id === groupId)!
      .my_balance;
  const notes = async (who: Who, kind: string) =>
    ((await who.client.rpc('my_notifications')).data as { kind: string; group_id: string; settlement_status: string | null }[]).filter(
      (n) => n.group_id === groupId && n.kind === kind,
    );
  const pay = async (who: Who, from: string, to: string, cents: number) => {
    const { data, error } = await who.client.rpc('record_settlement', {
      p_group_id: groupId,
      p_from_user_id: from,
      p_to_user_id: to,
      p_amount_cents: cents,
    });
    expect(error).toBeNull();
    return data as string;
  };

  beforeAll(async () => {
    [leo, sam] = await Promise.all([signUp('Leo'), signUp('Sam')]);
    const { data: g } = await leo.client.rpc('create_group', { p_name: 'Bali', p_currency: 'AUD' });
    groupId = g.id;
    const { data: t } = await leo.client.rpc('create_invite', { p_group_id: groupId });
    await sam.client.rpc('accept_invite', { p_token: t });
    guestId = (await leo.client.rpc('add_guest', { p_group_id: groupId, p_name: 'Nan' })).data;
    // Leo paid $90 for three: Sam and Nan owe Leo $30 each.
    await leo.client.rpc('create_expense', {
      p_group_id: groupId, p_description: 'Dinner', p_amount_cents: 9000, p_payer_id: leo.id, p_split_method: 'equal',
      p_splits: [
        { user_id: leo.id, amount_cents: 3000 },
        { user_id: sam.id, amount_cents: 3000 },
        { user_id: guestId, amount_cents: 3000 },
      ],
    });
  });

  it('a payment the payer records waits for the receiver and does not count yet', async () => {
    const id = await pay(sam, sam.id, leo.id, 1000);
    const { data: row } = await sam.client.from('settlements').select('status').eq('id', id).single();
    expect(row?.status).toBe('pending');
    expect(await myBalance(sam)).toBe(-3000);

    // Leo is asked, and sees it waiting.
    expect(await notes(leo, 'payment_to_confirm')).toMatchObject([{ settlement_status: 'pending' }]);
    const { data: waiting } = await leo.client.rpc('payments_to_confirm');
    expect((waiting as { id: string; amount_cents: number }[]).find((p) => p.id === id)).toMatchObject({ amount_cents: 1000 });
  });

  it('only the receiver can answer, and confirming makes it count', async () => {
    const { data: waiting } = await leo.client.rpc('payments_to_confirm');
    const id = (waiting as { id: string }[])[0]!.id;
    expect((await sam.client.rpc('respond_to_payment', { p_settlement_id: id, p_received: true })).error?.message).toMatch(/not found/);

    expect((await leo.client.rpc('respond_to_payment', { p_settlement_id: id, p_received: true })).error).toBeNull();
    expect(await myBalance(sam)).toBe(-2000);
    expect(await notes(sam, 'payment_confirmed')).toHaveLength(1);
    // Can't answer twice.
    expect((await leo.client.rpc('respond_to_payment', { p_settlement_id: id, p_received: false })).error?.message).toMatch(/already/);
  });

  it('"Not received" drops the payment and tells the payer', async () => {
    const id = await pay(sam, sam.id, leo.id, 500);
    expect((await leo.client.rpc('respond_to_payment', { p_settlement_id: id, p_received: false })).error).toBeNull();
    const { data: row } = await sam.client.from('settlements').select('status').eq('id', id).single();
    expect(row?.status).toBe('declined');
    expect(await myBalance(sam)).toBe(-2000);
    expect(await notes(sam, 'payment_declined')).toHaveLength(1);
  });

  it('the payer can remind once a day, and cancel while it waits', async () => {
    const id = await pay(sam, sam.id, leo.id, 700);
    // Leo was asked just now, so a reminder has to wait a day.
    expect((await sam.client.rpc('remind_to_confirm', { p_settlement_id: id })).error?.message).toMatch(/last day/);
    expect((await leo.client.rpc('remind_to_confirm', { p_settlement_id: id })).error?.message).toMatch(/not found/);

    expect((await sam.client.rpc('void_settlement', { p_settlement_id: id })).error).toBeNull();
    const { data: waiting } = await leo.client.rpc('payments_to_confirm');
    expect((waiting as { id: string }[]).some((p) => p.id === id)).toBe(false);
    expect(await myBalance(sam)).toBe(-2000);
  });

  it('counts straight away when the receiver records it, or the receiver is a guest', async () => {
    const fromSam = await pay(leo, sam.id, leo.id, 500);
    const { data: a } = await leo.client.from('settlements').select('status').eq('id', fromSam).single();
    expect(a?.status).toBe('recorded');
    expect(await myBalance(sam)).toBe(-1500);

    const toGuest = await pay(sam, sam.id, guestId, 100);
    const { data: b } = await sam.client.from('settlements').select('status').eq('id', toGuest).single();
    expect(b?.status).toBe('recorded');
  });
});
