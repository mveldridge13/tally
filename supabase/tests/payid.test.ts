/**
 * PayID details (phase 1), against the LOCAL Supabase stack. Run: npm run test:db
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

describe('PayID details', () => {
  let sam: Awaited<ReturnType<typeof signUp>>;
  let friend: Awaited<ReturnType<typeof signUp>>;
  let stranger: Awaited<ReturnType<typeof signUp>>;
  let kiwi: Awaited<ReturnType<typeof signUp>>;

  beforeAll(async () => {
    [sam, friend, stranger, kiwi] = await Promise.all([signUp('PSam'), signUp('PFriend'), signUp('PStranger'), signUp('PKiwi')]);
    // PayID is Australian: Sam's profile currency is AUD, Kiwi's is NZD.
    await sam.client.from('profiles').update({ currency: 'AUD' }).eq('id', sam.id);
    await kiwi.client.from('profiles').update({ currency: 'NZD' }).eq('id', kiwi.id);
    const { data: g } = await sam.client.rpc('create_group', { p_name: 'Flat', p_currency: 'AUD' });
    const { data: t } = await sam.client.rpc('create_invite', { p_group_id: g.id });
    await friend.client.rpc('accept_invite', { p_token: t });
  });

  it('saves and replaces your own PayID', async () => {
    expect((await sam.client.rpc('set_payid', { p_type: 'phone', p_value: '+61412345678', p_account_name: 'Sam Smith' })).error).toBeNull();
    expect((await sam.client.rpc('set_payid', { p_type: 'email', p_value: 'sam@example.com', p_account_name: 'S SMITH' })).error).toBeNull();
    const { data } = await sam.client.from('payment_methods').select('payid_type, value, account_name').eq('user_id', sam.id);
    expect(data).toEqual([{ payid_type: 'email', value: 'sam@example.com', account_name: 'S SMITH' }]);
  });

  it('is only available to people whose profile currency is AUD', async () => {
    const { error } = await kiwi.client.rpc('set_payid', { p_type: 'phone', p_value: '+61412345678' });
    expect(error?.message).toMatch(/only available in Australia/);
  });

  it('rejects malformed values even if the app is bypassed', async () => {
    expect((await sam.client.rpc('set_payid', { p_type: 'phone', p_value: '0412345678' })).error).not.toBeNull(); // not normalised
    expect((await sam.client.rpc('set_payid', { p_type: 'email', p_value: 'Sam@Example.com' })).error).not.toBeNull(); // not lower-case
    expect((await sam.client.rpc('set_payid', { p_type: 'abn', p_value: '51824753557' })).error?.message).toMatch(/ABN doesn’t look right/);
    expect((await sam.client.rpc('set_payid', { p_type: 'abn', p_value: '51824753556' })).error).toBeNull(); // ATO example
  });

  it('is visible to people in your groups, and to nobody else', async () => {
    const seenByFriend = await friend.client.from('payment_methods').select('value').eq('user_id', sam.id);
    const seenByStranger = await stranger.client.from('payment_methods').select('value').eq('user_id', sam.id);
    expect(seenByFriend.data).toEqual([{ value: '51824753556' }]);
    expect(seenByStranger.data).toEqual([]);
  });

  it('cannot be written directly or changed by someone else', async () => {
    const direct = await friend.client.from('payment_methods').insert({ user_id: sam.id, kind: 'payid', payid_type: 'email', value: 'evil@example.com' });
    expect(direct.error).not.toBeNull();
    await friend.client.from('payment_methods').update({ value: 'evil@example.com' }).eq('user_id', sam.id);
    const { data } = await sam.client.from('payment_methods').select('value').eq('user_id', sam.id).single();
    expect(data?.value).toBe('51824753556');
  });

  it('can be removed', async () => {
    expect((await sam.client.rpc('remove_payid')).error).toBeNull();
    expect((await sam.client.from('payment_methods').select('id').eq('user_id', sam.id)).data).toEqual([]);
  });
});
