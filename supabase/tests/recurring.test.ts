/**
 * Recurring expenses against the LOCAL Supabase stack: schedules, the hourly job (run here directly
 * with the service key), heads-ups, variable bills, and who can change what.
 *
 * Run: npm run test:db
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// Standard keys for local Supabase (not secrets).
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const run = Math.random().toString(36).slice(2, 8);
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const runJob = async () => {
  const { data, error } = await admin.rpc('run_recurring');
  expect(error).toBeNull();
  return data as number;
};

async function signUp(name: string): Promise<{ client: SupabaseClient; id: string }> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({
    email: `${name}-recurring-${run}@example.com`,
    password: 'correct-horse-battery',
    options: { data: { name } },
  });
  if (error || !data.user) throw error ?? new Error('no user');
  return { client, id: data.user.id };
}
type Who = Awaited<ReturnType<typeof signUp>>;

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('Recurring expenses (Supabase)', () => {
  let alice: Who; // owner
  let bob: Who; // member who sets things up
  let cara: Who; // another member
  let groupId: string;

  const splits3 = (amount: number) => {
    const each = Math.floor(amount / 3);
    return [
      { user_id: alice.id, amount_cents: amount - 2 * each, weight: null },
      { user_id: bob.id, amount_cents: each, weight: null },
      { user_id: cara.id, amount_cents: each, weight: null },
    ];
  };
  const create = (who: Who, over: Record<string, unknown>) =>
    who.client.rpc('create_recurring', {
      p_group_id: groupId,
      p_description: 'Rent',
      p_payer_id: who.id,
      p_split_method: 'equal',
      p_split_input: { method: 'equal', participants: [alice.id, bob.id, cara.id] },
      p_variable: false,
      p_amount_cents: 90000,
      p_splits: splits3(90000),
      p_items: null,
      p_frequency: 'monthly',
      p_start_date: today(),
      p_end_date: null,
      p_remaining: null,
      p_heads_up_days: 1,
      ...over,
    });
  const kinds = async (who: Who, kind: string) =>
    ((await who.client.rpc('my_notifications')).data as { kind: string; recurring_id: string | null }[]).filter((n) => n.kind === kind);

  beforeAll(async () => {
    [alice, bob, cara] = await Promise.all([signUp('Alice'), signUp('Bob'), signUp('Cara')]);
    const { data: g } = await alice.client.rpc('create_group', { p_name: 'Flat', p_currency: 'AUD' });
    groupId = g.id;
    for (const who of [bob, cara]) {
      const { data: t } = await alice.client.rpc('create_invite', { p_group_id: groupId });
      await who.client.rpc('accept_invite', { p_token: t });
    }
  });

  it('a schedule starting today with today’s expense counts it as the first, and moves on', async () => {
    const { data: expenseId } = await bob.client.rpc('create_expense', {
      p_group_id: groupId, p_description: 'Internet', p_amount_cents: 9000, p_payer_id: bob.id,
      p_split_method: 'equal', p_splits: splits3(9000),
    });
    const { data: id, error } = await create(bob, { p_description: 'Internet', p_amount_cents: 9000, p_splits: splits3(9000), p_first_expense_id: expenseId });
    expect(error).toBeNull();
    const { data: row } = await bob.client.from('recurring_expenses').select('occurrences, next_date').eq('id', id).single();
    expect(row?.occurrences).toBe(1);
    expect(row?.next_date > today()).toBe(true);
    const { data: linked } = await bob.client.from('expenses').select('recurring_id').eq('id', expenseId).single();
    expect(linked?.recurring_id).toBe(id);
  });

  it('the job adds a fixed expense when it’s due, tells the people in it, and only once', async () => {
    const { data: id } = await create(bob, {});
    await runJob();
    const { data: added } = await alice.client.from('expenses').select('amount_cents, created_by').eq('recurring_id', id);
    expect(added).toEqual([{ amount_cents: 90000, created_by: bob.id }]);
    expect((await kinds(cara, 'recurring_added')).some((n) => n.recurring_id === id)).toBe(true);
    await runJob();
    expect((await alice.client.from('expenses').select('id').eq('recurring_id', id)).data).toHaveLength(1);
  });

  it('sends a heads-up before the next one, once', async () => {
    const { data: id } = await create(bob, { p_description: 'Gym', p_start_date: plusDays(1), p_heads_up_days: 1 });
    await runJob();
    await runJob();
    expect((await kinds(cara, 'recurring_heads_up')).filter((n) => n.recurring_id === id)).toHaveLength(1);
    expect((await alice.client.from('expenses').select('id').eq('recurring_id', id)).data).toEqual([]);
  });

  it('a variable bill is marked due for the payer to fill in', async () => {
    const { data: id } = await create(bob, {
      p_description: 'Electricity', p_variable: true, p_amount_cents: null, p_splits: null, p_frequency: 'quarterly',
    });
    await runJob();
    const { data: due } = await bob.client.rpc('recurring_due');
    expect((due as { id: string }[]).some((d) => d.id === id)).toBe(true);
    expect((await kinds(bob, 'recurring_due')).some((n) => n.recurring_id === id)).toBe(true);

    const { data: expenseId } = await bob.client.rpc('create_expense', {
      p_group_id: groupId, p_description: 'Electricity', p_amount_cents: 21240, p_payer_id: bob.id,
      p_split_method: 'equal', p_splits: splits3(21240),
    });
    expect((await bob.client.rpc('complete_recurring_due', { p_id: id, p_expense_id: expenseId })).error).toBeNull();
    const { data: after } = await bob.client.rpc('recurring_due');
    expect((after as { id: string }[]).some((d) => d.id === id)).toBe(false);
  });

  it('members only see schedules they set up; the owner sees all', async () => {
    const { data: mine } = await cara.client.from('recurring_expenses').select('id').eq('group_id', groupId);
    expect(mine).toEqual([]);
    const { data: all } = await alice.client.from('recurring_expenses').select('id').eq('group_id', groupId);
    expect(all!.length).toBeGreaterThanOrEqual(4);
  });

  it('only whoever set it up, or the owner, can pause or stop it; paused ones are skipped', async () => {
    const { data: id } = await create(bob, { p_description: 'Netflix', p_start_date: plusDays(2) });
    expect((await cara.client.rpc('stop_recurring', { p_id: id })).error?.message).toMatch(/not found/);
    expect((await bob.client.rpc('set_recurring_paused', { p_id: id, p_paused: true })).error).toBeNull();
    expect((await alice.client.rpc('stop_recurring', { p_id: id })).error).toBeNull();
    const { data: row } = await alice.client.from('recurring_expenses').select('stopped_at').eq('id', id).single();
    expect(row?.stopped_at).not.toBeNull();
  });

  it('editing can move the next date; it counts on from there', async () => {
    const { data: id } = await create(bob, { p_description: 'Water', p_start_date: plusDays(3) });
    const edit = (next: string | null) =>
      bob.client.rpc('update_recurring', {
        p_id: id, p_description: 'Water', p_payer_id: bob.id, p_split_method: 'equal',
        p_split_input: { method: 'equal', participants: [alice.id, bob.id, cara.id] }, p_variable: false,
        p_amount_cents: 90000, p_splits: splits3(90000), p_items: null, p_frequency: 'monthly',
        p_end_date: null, p_remaining: null, p_heads_up_days: 1, p_next_date: next,
      });
    expect((await edit(plusDays(10))).error).toBeNull();
    const { data: row } = await bob.client.from('recurring_expenses').select('next_date, start_date, occurrences').eq('id', id).single();
    expect(row).toMatchObject({ next_date: plusDays(10), start_date: plusDays(10), occurrences: 0 });
    expect((await edit(plusDays(-5))).error?.message).toMatch(/today or later/);
    // Leaving the date out keeps it.
    expect((await edit(null)).error).toBeNull();
    const { data: same } = await bob.client.from('recurring_expenses').select('next_date').eq('id', id).single();
    expect(same?.next_date).toBe(plusDays(10));
  });

  it('a payment can be for one period of a recurring expense', async () => {
    const { data: id } = await create(bob, { p_description: 'Power' });
    await runJob();
    const { data: added } = await alice.client.from('expenses').select('id').eq('recurring_id', id).single();
    // Cara settles her share of this period with Bob.
    const { data: pay, error } = await cara.client.rpc('record_settlement', {
      p_group_id: groupId, p_from_user_id: cara.id, p_to_user_id: bob.id, p_amount_cents: 30000, p_expense_id: added!.id,
    });
    expect(error).toBeNull();
    const { data: row } = await cara.client.from('settlements').select('expense_id, status').eq('id', pay).single();
    expect(row).toMatchObject({ expense_id: added!.id, status: 'pending' });
    // A correction keeps the link.
    await bob.client.rpc('respond_to_payment', { p_settlement_id: pay, p_received: true });
    const { data: fixed } = await cara.client.rpc('correct_settlement', { p_settlement_id: pay, p_amount_cents: 30000, p_note: 'Power, Nov' });
    const { data: kept } = await alice.client.from('settlements').select('expense_id').eq('id', fixed).single();
    expect(kept?.expense_id).toBe(added!.id);
    // It has to be an expense in this group.
    const other = await cara.client.rpc('record_settlement', {
      p_group_id: groupId, p_from_user_id: cara.id, p_to_user_id: bob.id, p_amount_cents: 100, p_expense_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(other.error?.message).toMatch(/isn.t in this group/);
  });

  it('moving the next date to today adds it straight away, without waiting for the job', async () => {
    const { data: id } = await create(bob, { p_description: 'Phone', p_start_date: plusDays(5) });
    const { error } = await bob.client.rpc('update_recurring', {
      p_id: id, p_description: 'Phone', p_payer_id: bob.id, p_split_method: 'equal',
      p_split_input: { method: 'equal', participants: [alice.id, bob.id, cara.id] }, p_variable: false,
      p_amount_cents: 90000, p_splits: splits3(90000), p_items: null, p_frequency: 'monthly',
      p_end_date: null, p_remaining: null, p_heads_up_days: 1, p_next_date: today(),
    });
    expect(error).toBeNull();
    expect((await alice.client.from('expenses').select('id').eq('recurring_id', id)).data).toHaveLength(1);
    const { data: row } = await bob.client.from('recurring_expenses').select('next_date').eq('id', id).single();
    expect(row!.next_date > today()).toBe(true);
  });

  it('works out "today" in the time zone of whoever set it up', async () => {
    // Kiritimati is UTC+14, so its today is often UTC's tomorrow.
    expect((await bob.client.rpc('set_my_time_zone', { p_time_zone: 'Pacific/Kiritimati' })).error).toBeNull();
    expect((await bob.client.rpc('set_my_time_zone', { p_time_zone: 'Not/AZone' })).error?.message).toMatch(/Unknown time zone/);
    const kiritimatiToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati' }).format(new Date());
    const { data: id } = await create(bob, { p_description: 'Island rent', p_start_date: kiritimatiToday });
    // Due today where Bob is, so it's added at once.
    expect((await alice.client.from('expenses').select('id').eq('recurring_id', id)).data).toHaveLength(1);
    await bob.client.rpc('set_my_time_zone', { p_time_zone: 'UTC' });
  });

  it('ends after the number of times chosen', async () => {
    const { data: id } = await create(bob, { p_description: 'Course', p_remaining: 1 });
    await runJob();
    const { data: row } = await alice.client.from('recurring_expenses').select('stopped_at, remaining').eq('id', id).single();
    expect(row).toMatchObject({ remaining: 0 });
    expect(row?.stopped_at).not.toBeNull();
    expect((await alice.client.from('expenses').select('id').eq('recurring_id', id)).data).toHaveLength(1);
  });
});
