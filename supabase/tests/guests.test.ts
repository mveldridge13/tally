/**
 * Guest members, against the LOCAL Supabase stack. Run: npm run test:db
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

describe('Guest members', () => {
  let owner: Awaited<ReturnType<typeof signUp>>;
  let member: Awaited<ReturnType<typeof signUp>>;
  let sam: Awaited<ReturnType<typeof signUp>>; // signs up later and claims the guest
  let outsider: Awaited<ReturnType<typeof signUp>>;
  let groupId: string;
  let guestId: string;

  const balances = async (who = owner) =>
    Object.fromEntries(
      ((await who.client.rpc('group_balances', { p_group_id: groupId })).data ?? []).map((r: { user_id: string; balance_cents: number }) => [r.user_id, r.balance_cents]),
    );

  beforeAll(async () => {
    [owner, member, sam, outsider] = await Promise.all([signUp('GOwner'), signUp('GMember'), signUp('GSam'), signUp('GOut')]);
    const { data: g } = await owner.client.rpc('create_group', { p_name: 'Dinner club', p_currency: 'AUD' });
    groupId = g.id;
    const { data: t } = await owner.client.rpc('create_invite', { p_group_id: groupId });
    await member.client.rpc('accept_invite', { p_token: t });
  });

  it('any member can add a guest by name; outsiders cannot', async () => {
    const { data, error } = await member.client.rpc('add_guest', { p_group_id: groupId, p_name: '  Sam  ' });
    expect(error).toBeNull();
    guestId = data;
    expect((await outsider.client.rpc('add_guest', { p_group_id: groupId, p_name: 'X' })).error?.message).toMatch(/not a member/);
    expect((await owner.client.rpc('add_guest', { p_group_id: groupId, p_name: '   ' })).error?.message).toMatch(/Enter a name/);

    const { data: profile } = await owner.client.from('profiles').select('name, is_guest, guest_group_id').eq('id', guestId).single();
    expect(profile).toEqual({ name: 'Sam', is_guest: true, guest_group_id: groupId });
    const { data: members } = await owner.client.from('group_members').select('user_id').eq('group_id', groupId).is('left_at', null);
    expect(members!.map((m) => m.user_id)).toContain(guestId);
  });

  it('guests take part in expenses and payments like anyone else', async () => {
    // Owner paid 90.00 for owner, member and guest Sam: Sam owes 30.00.
    const e1 = await owner.client.rpc('create_expense', {
      p_group_id: groupId, p_description: 'Dinner', p_amount_cents: 9000, p_payer_id: owner.id, p_split_method: 'equal',
      p_splits: [{ user_id: owner.id, amount_cents: 3000 }, { user_id: member.id, amount_cents: 3000 }, { user_id: guestId, amount_cents: 3000 }],
    });
    expect(e1.error).toBeNull();
    // Guest Sam paid 12.00 for drinks for Sam and owner.
    const e2 = await member.client.rpc('create_expense', {
      p_group_id: groupId, p_description: 'Drinks', p_amount_cents: 1200, p_payer_id: guestId, p_split_method: 'equal',
      p_splits: [{ user_id: guestId, amount_cents: 600 }, { user_id: owner.id, amount_cents: 600 }],
    });
    expect(e2.error).toBeNull();
    // Sam paid owner back 10.00 (recorded by the owner).
    expect((await owner.client.rpc('record_settlement', { p_group_id: groupId, p_from_user_id: guestId, p_to_user_id: owner.id, p_amount_cents: 1000 })).error).toBeNull();

    // Owner: +90 paid −30 share −6 drinks −10 received = +44. Sam: −30 +12 paid −6 share +10 paid back = −14.
    expect(await balances()).toEqual({ [owner.id]: 4400, [member.id]: -3000, [guestId]: -1400 });
  });

  it('only the invite for that guest can claim them, and only once', async () => {
    const { data: token, error } = await member.client.rpc('create_invite', { p_group_id: groupId, p_guest_id: guestId });
    expect(error).toBeNull();

    // Someone already in the group can't claim the guest.
    expect((await member.client.rpc('accept_invite', { p_token: token })).error?.message).toMatch(/already in this group/);

    // Sam signs up and claims: the history moves to Sam's account.
    const { data: joined, error: claimError } = await sam.client.rpc('accept_invite', { p_token: token });
    expect(claimError).toBeNull();
    expect(joined).toBe(groupId);
    expect(await balances()).toEqual({ [owner.id]: 4400, [member.id]: -3000, [sam.id]: -1400 });
    // Sam is a member, so their own balance comes from the server summary.
    const { data: mine } = await sam.client.rpc('my_group_summaries');
    expect((mine as { group_id: string; my_balance: number }[]).find((g) => g.group_id === groupId)?.my_balance).toBe(-1400);

    // The owner sees the expense now credited to Sam (members only see items they added).
    const { data: drinks } = await owner.client.from('expenses').select('payer_id, expense_splits(user_id)').eq('description', 'Drinks').single();
    expect(drinks!.payer_id).toBe(sam.id);
    expect(drinks!.expense_splits.map((s) => s.user_id)).toContain(sam.id);
    const { data: guestRow } = await owner.client.from('group_members').select('user_id').eq('group_id', groupId).eq('user_id', guestId);
    expect(guestRow).toEqual([]);

    // The invite can't be used again.
    expect((await outsider.client.rpc('accept_invite', { p_token: token })).error).not.toBeNull();
  });

  it('cannot invite a guest from another group or one already claimed', async () => {
    expect((await owner.client.rpc('create_invite', { p_group_id: groupId, p_guest_id: guestId })).error?.message).toMatch(/already joined/);
    const { data: other } = await owner.client.rpc('create_group', { p_name: 'Other', p_currency: 'AUD' });
    const { data: otherGuest } = await owner.client.rpc('add_guest', { p_group_id: other.id, p_name: 'Leo' });
    expect((await owner.client.rpc('create_invite', { p_group_id: groupId, p_guest_id: otherGuest })).error?.message).toMatch(/not in this group/);
  });

  it('a guest cannot be made the owner', async () => {
    const { data: mia } = await owner.client.rpc('add_guest', { p_group_id: groupId, p_name: 'Mia' });
    expect((await owner.client.rpc('transfer_ownership', { p_group_id: groupId, p_new_owner_id: mia })).error?.message).toMatch(/can’t be the owner/);
  });

  it('the owner can remove a settled guest, as with any member', async () => {
    const { data: leo } = await member.client.rpc('add_guest', { p_group_id: groupId, p_name: 'Leo' });
    expect((await member.client.rpc('remove_member', { p_group_id: groupId, p_user_id: leo })).error?.message).toMatch(/Only the group owner/);
    expect((await owner.client.rpc('remove_member', { p_group_id: groupId, p_user_id: leo })).error).toBeNull();
  });

  it('guests are hidden from people outside the group', async () => {
    const { data } = await outsider.client.from('profiles').select('id').eq('is_guest', true).eq('guest_group_id', groupId);
    expect(data).toEqual([]);
  });
});
