/**
 * Group icons, against the LOCAL Supabase stack. Run: npm run test:db
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

describe('Group icons', () => {
  let owner: Awaited<ReturnType<typeof signUp>>;
  let outsider: Awaited<ReturnType<typeof signUp>>;

  beforeAll(async () => {
    [owner, outsider] = await Promise.all([signUp('IconOwner'), signUp('IconOut')]);
  });

  const iconOf = async (id: string) => (await owner.client.from('groups').select('icon').eq('id', id).single()).data?.icon;

  it('creates a group with an emoji, or with none', async () => {
    const withIcon = await owner.client.rpc('create_group', { p_name: 'Flat', p_currency: 'AUD', p_icon: '🏠' });
    expect(withIcon.error).toBeNull();
    expect(withIcon.data.icon).toBe('🏠');

    const without = await owner.client.rpc('create_group', { p_name: 'Trip', p_currency: 'AUD' });
    expect(without.error).toBeNull();
    expect(without.data.icon).toBeNull();
  });

  it('lets a member change or clear the icon, but not an outsider', async () => {
    const { data: g } = await owner.client.rpc('create_group', { p_name: 'Club', p_currency: 'AUD' });

    expect((await owner.client.rpc('set_group_icon', { p_group_id: g.id, p_icon: '🍽️' })).error).toBeNull();
    expect(await iconOf(g.id)).toBe('🍽️');

    expect((await outsider.client.rpc('set_group_icon', { p_group_id: g.id, p_icon: '💀' })).error?.code).toBe('42501');
    expect(await iconOf(g.id)).toBe('🍽️');

    expect((await owner.client.rpc('set_group_icon', { p_group_id: g.id, p_icon: '' })).error).toBeNull();
    expect(await iconOf(g.id)).toBeNull();
  });
});
