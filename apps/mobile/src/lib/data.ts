import {
  type PayIdType,
  computeBalances,
  computeSplit,
  simplifyDebts,
  type Balances,
  type Cents,
  type SplitInput,
  type SplitShare,
  type Transfer,
} from '@tally/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useMyId } from './auth';
import { deviceCurrency } from './currencies';
import { supabase } from './supabase';

/**
 * Data layer. Reads all of the user's groups (RLS limits rows to groups they belong to)
 * in one nested query, then derives balances on-device with the shared engine.
 * Writes go through the database functions, which re-validate everything.
 */

export interface Person {
  id: string;
  name: string;
  /** Added by name, without a Tally account yet. */
  isGuest?: boolean;
}

export interface Group {
  id: string;
  name: string;
  currency: string;
  /** Current members only. People who left keep their history and still appear in expenses. */
  memberIds: string[];
  roles: Record<string, GroupRole>;
  /** The signed-in user's role in this group. */
  myRole: GroupRole;
}

export type GroupRole = 'owner' | 'admin' | 'member';

export interface ExpenseSplit extends SplitShare {
  /** Input that produced the share: basis points (percentage) or units (shares); null otherwise. */
  weight: number | null;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amount: Cents;
  payerId: string;
  createdById: string;
  method: SplitInput['method'];
  splits: ExpenseSplit[];
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settlement {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amount: Cents;
  occurredAt: string;
  createdById: string;
  createdAt: string;
  note: string | null;
  /** Set when this payment corrects an earlier one (which is now voided). */
  replacesId: string | null;
}

export interface Profile {
  id: string;
  name: string;
  /** ISO 4217 code used as the default for new groups. */
  currency: string;
  /** True once the user picked a currency themselves; until then it follows the device region. */
  currencyChosen: boolean;
  createdAt: string;
}

/** A saved PayID (Australia only). Visible to its owner and to people who share a group with them. */
export interface PayId {
  type: PayIdType;
  /** Stored normalised: +614XXXXXXXX, a lower-case email, or 11 ABN digits. */
  value: string;
  accountName: string | null;
}

export interface TallyData {
  me: Profile | null;
  /** PayIDs by user id, for you and the people in your groups who have added one. */
  payIds: Record<string, PayId>;
  people: Record<string, Person>;
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
}

const EMPTY: TallyData = { me: null, payIds: {}, people: {}, groups: [], expenses: [], settlements: [] };
export const TALLY_KEY = ['tally'] as const;

async function fetchTally(myId: string): Promise<TallyData> {
  const [groupsRes, meRes, payIdsRes] = await Promise.all([
    supabase
      .from('groups')
      .select(
        `id, name, currency, created_at,
         group_members ( user_id, role, left_at, profiles ( id, name, is_guest ) ),
         expenses ( id, description, amount_cents, payer_id, created_by, split_method, occurred_at,
                    created_at, updated_at, deleted_at,
                    expense_splits ( user_id, amount_cents, weight ) ),
         settlements ( id, from_user_id, to_user_id, amount_cents, occurred_at, status, created_by, created_at, note, replaces_id )`,
      )
      .is('archived_at', null)
      .is('expenses.deleted_at', null)
      .eq('settlements.status', 'recorded')
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, name, currency, currency_chosen, created_at').eq('id', myId).maybeSingle(),
    // RLS returns only your own PayID and those of people you share a group with.
    supabase.from('payment_methods').select('user_id, payid_type, value, account_name').eq('kind', 'payid'),
  ]);
  if (groupsRes.error) throw groupsRes.error;

  const data: TallyData = { me: null, payIds: {}, people: {}, groups: [], expenses: [], settlements: [] };
  for (const p of payIdsRes.data ?? []) {
    data.payIds[p.user_id] = { type: p.payid_type as PayIdType, value: p.value, accountName: p.account_name };
  }
  if (meRes.data) {
    const p = meRes.data;
    data.me = { id: p.id, name: p.name, currency: p.currency, currencyChosen: p.currency_chosen, createdAt: p.created_at };
    data.people[p.id] = { id: p.id, name: p.name };
  }

  for (const g of groupsRes.data) {
    const memberIds: string[] = [];
    const roles: Record<string, GroupRole> = {};
    let myRole: GroupRole = 'member';
    for (const m of g.group_members) {
      // Keep names of people who left so their past expenses still read correctly.
      if (m.profiles) data.people[m.profiles.id] = { id: m.profiles.id, name: m.profiles.name, isGuest: m.profiles.is_guest };
      if (m.left_at) continue;
      memberIds.push(m.user_id);
      roles[m.user_id] = m.role;
      if (m.user_id === myId) myRole = m.role;
    }
    data.groups.push({ id: g.id, name: g.name, currency: g.currency, memberIds, roles, myRole });

    for (const e of g.expenses) {
      data.expenses.push({
        id: e.id,
        groupId: g.id,
        description: e.description,
        amount: e.amount_cents,
        payerId: e.payer_id,
        createdById: e.created_by,
        method: e.split_method,
        splits: e.expense_splits.map((s) => ({ userId: s.user_id, amount: s.amount_cents, weight: s.weight })),
        occurredAt: e.occurred_at,
        createdAt: e.created_at,
        updatedAt: e.updated_at,
      });
    }
    for (const s of g.settlements) {
      data.settlements.push({
        id: s.id,
        groupId: g.id,
        fromUserId: s.from_user_id,
        toUserId: s.to_user_id,
        amount: s.amount_cents,
        occurredAt: s.occurred_at,
        createdById: s.created_by,
        createdAt: s.created_at,
        note: s.note,
        replacesId: s.replaces_id,
      });
    }
  }
  return data;
}

export function useTallyData() {
  const myId = useMyId();
  const query = useQuery({
    queryKey: [...TALLY_KEY, myId],
    queryFn: () => fetchTally(myId),
    enabled: !!myId,
  });
  return { ...query, data: query.data ?? EMPTY };
}

/** "You" for the signed-in user, otherwise the person's name. */
export function useNameOf() {
  const myId = useMyId();
  const { data } = useTallyData();
  return (id: string) => (id === myId ? 'You' : (data.people[id]?.name ?? 'Someone'));
}

// ─── Derived balances ────────────────────────────────────────────────────────

export interface GroupSummary {
  group: Group;
  balances: Balances;
  myBalance: Cents;
  transfers: Transfer[];
}

export function summarizeGroup(group: Group, expenses: Expense[], settlements: Settlement[], myId: string): GroupSummary {
  const balances = computeBalances(
    expenses.filter((e) => e.groupId === group.id),
    settlements.filter((s) => s.groupId === group.id),
    group.memberIds,
  );
  return { group, balances, myBalance: balances.get(myId) ?? 0, transfers: simplifyDebts(balances) };
}

/** Net balance per currency. Different currencies are never added together. */
export function netByCurrency(summaries: GroupSummary[]): { currency: string; amount: Cents }[] {
  const totals = new Map<string, Cents>();
  for (const s of summaries) totals.set(s.group.currency, (totals.get(s.group.currency) ?? 0) + s.myBalance);
  return [...totals].map(([currency, amount]) => ({ currency, amount }));
}

// ─── Mutations ───────────────────────────────────────────────────────────────

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: TALLY_KEY }),
  });
}

export function useCreateGroup() {
  return useInvalidating(async (input: { name: string; currency: string }) => {
    const { data, error } = await supabase.rpc('create_group', { p_name: input.name, p_currency: input.currency });
    if (error) throw error;
    return data;
  });
}

/** Compute shares with the shared engine; the database re-checks they sum to the amount. */
function toRpcSplits(amount: Cents, split: SplitInput) {
  const shares = computeSplit(amount, split);
  const weights = new Map<string, number>();
  if (split.method === 'percentage') split.shares.forEach((s) => weights.set(s.userId, s.basisPoints));
  if (split.method === 'shares') split.shares.forEach((s) => weights.set(s.userId, s.units));
  return shares.map((s) => ({ user_id: s.userId, amount_cents: s.amount, weight: weights.get(s.userId) ?? null }));
}

export interface ExpenseInput {
  description: string;
  amount: Cents;
  payerId: string;
  split: SplitInput;
  occurredAt: string;
}

export function useCreateExpense() {
  return useInvalidating(async (input: ExpenseInput & { groupId: string }) => {
    const { data, error } = await supabase.rpc('create_expense', {
      p_group_id: input.groupId,
      p_description: input.description,
      p_amount_cents: input.amount,
      p_payer_id: input.payerId,
      p_split_method: input.split.method,
      p_occurred_at: input.occurredAt,
      p_splits: toRpcSplits(input.amount, input.split),
    });
    if (error) throw error;
    return data;
  });
}

export function useUpdateExpense() {
  return useInvalidating(async (input: ExpenseInput & { expenseId: string }) => {
    const { error } = await supabase.rpc('update_expense', {
      p_expense_id: input.expenseId,
      p_description: input.description,
      p_amount_cents: input.amount,
      p_payer_id: input.payerId,
      p_split_method: input.split.method,
      p_occurred_at: input.occurredAt,
      p_splits: toRpcSplits(input.amount, input.split),
    });
    if (error) throw error;
  });
}

/** Soft delete: the expense is hidden and its last state is kept in expense_revisions. */
export function useDeleteExpense() {
  return useInvalidating(async (expenseId: string) => {
    const { error } = await supabase.rpc('delete_expense', { p_expense_id: expenseId });
    if (error) throw error;
  });
}

export interface ExpenseRevision {
  id: string;
  editedById: string;
  at: string;
  before: { description: string; amount_cents: number; payer_id: string; split_method: string };
}

/** Edit history for one expense, newest first. */
export function useExpenseHistory(expenseId: string) {
  const { data: tally } = useTallyData();
  return useQuery({
    queryKey: [...TALLY_KEY, 'history', expenseId, tally.expenses.find((e) => e.id === expenseId)?.updatedAt],
    queryFn: async (): Promise<ExpenseRevision[]> => {
      const { data, error } = await supabase
        .from('expense_revisions')
        .select('id, edited_by, created_at, before')
        .eq('expense_id', expenseId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map((r) => ({
        id: r.id,
        editedById: r.edited_by,
        at: r.created_at,
        before: r.before as ExpenseRevision['before'],
      }));
    },
  });
}

export function useRecordSettlement() {
  return useInvalidating(async (input: { groupId: string; fromUserId: string; toUserId: string; amount: Cents; note?: string }) => {
    const { data, error } = await supabase.rpc('record_settlement', {
      p_group_id: input.groupId,
      p_from_user_id: input.fromUserId,
      p_to_user_id: input.toUserId,
      p_amount_cents: input.amount,
      p_note: input.note?.trim() || undefined,
    });
    if (error) throw error;
    return data;
  });
}

/** Owner only. Archives the group for every member; the database enforces the owner check. */
export function useDeleteGroup() {
  return useInvalidating(async (groupId: string) => {
    const { error } = await supabase.rpc('delete_group', { p_group_id: groupId });
    if (error) throw error;
  });
}

/** Members only (not the owner), and only with a zero balance. Enforced by the database. */
export function useLeaveGroup() {
  return useInvalidating(async (groupId: string) => {
    const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
    if (error) throw error;
  });
}

/** Owner only; the member's balance must be zero. Enforced by the database. */
export function useRemoveMember() {
  return useInvalidating(async (input: { groupId: string; userId: string }) => {
    const { error } = await supabase.rpc('remove_member', { p_group_id: input.groupId, p_user_id: input.userId });
    if (error) throw error;
  });
}

/** Owner only. The current owner becomes a regular member. */
export function useTransferOwnership() {
  return useInvalidating(async (input: { groupId: string; userId: string }) => {
    const { error } = await supabase.rpc('transfer_ownership', { p_group_id: input.groupId, p_new_owner_id: input.userId });
    if (error) throw error;
  });
}

/** Update your own name and/or default currency. RLS only allows editing your own profile. */
export function useUpdateProfile() {
  const myId = useMyId();
  return useInvalidating(async (input: { name?: string; currency?: string }) => {
    // Picking a currency by hand stops it following the device region.
    const patch = input.currency ? { ...input, currency_chosen: true } : input;
    const { error } = await supabase.from('profiles').update(patch).eq('id', myId);
    if (error) throw error;
  });
}

/**
 * Keep the default currency in line with the phone's region (e.g. AUD in Australia)
 * until the user chooses one in Profile. Runs once per signed-in session.
 */
export function useSyncDeviceCurrency() {
  const myId = useMyId();
  const { data } = useTallyData();
  const qc = useQueryClient();
  const me = data.me;
  useEffect(() => {
    if (!me || me.currencyChosen) return;
    const device = deviceCurrency();
    if (!device || device === me.currency) return;
    void supabase
      .from('profiles')
      .update({ currency: device })
      .eq('id', myId)
      .then(({ error }) => {
        if (!error) void qc.invalidateQueries({ queryKey: TALLY_KEY });
      });
  }, [me, myId, qc]);
}

/** Undo a payment recorded by mistake. It's marked voided (kept for history) and balances update. */
export function useVoidSettlement() {
  return useInvalidating(async (settlementId: string) => {
    const { error } = await supabase.rpc('void_settlement', { p_settlement_id: settlementId });
    if (error) throw error;
  });
}

/**
 * Correct a recorded payment. The original is voided and a new payment recorded in its place,
 * linked back to it, so the history shows what changed. Returns the new payment's id.
 */
export function useCorrectSettlement() {
  return useInvalidating(async (input: { settlementId: string; amount: Cents; note?: string }) => {
    const { data, error } = await supabase.rpc('correct_settlement', {
      p_settlement_id: input.settlementId,
      p_amount_cents: input.amount,
      p_note: input.note?.trim() || undefined,
    });
    if (error) throw error;
    return data;
  });
}

/** A payment that a correction replaced (now voided), for "corrects an earlier payment of …". */
export function useReplacedPayment(replacesId: string | null | undefined) {
  return useQuery({
    queryKey: [...TALLY_KEY, 'replaced', replacesId],
    enabled: !!replacesId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('id, amount_cents, note, created_by, created_at')
        .eq('id', replacesId!)
        .single();
      if (error) throw error;
      return { id: data.id, amount: data.amount_cents, note: data.note, createdById: data.created_by, createdAt: data.created_at };
    },
  });
}

/** Add someone to a group by name, before they have a Tally account. Returns the guest's id. */
export function useAddGuest() {
  return useInvalidating(async (input: { groupId: string; name: string }) => {
    const { data, error } = await supabase.rpc('add_guest', { p_group_id: input.groupId, p_name: input.name.trim() });
    if (error) throw error;
    return data;
  });
}

/** Save or replace your PayID. The value must already be normalised (see normalisePayId). AUD profiles only. */
export function useSetPayId() {
  return useInvalidating(async (input: { type: PayIdType; value: string; accountName?: string }) => {
    const { error } = await supabase.rpc('set_payid', {
      p_type: input.type,
      p_value: input.value,
      p_account_name: input.accountName?.trim() || undefined,
    });
    if (error) throw error;
  });
}

export function useRemovePayId() {
  return useInvalidating(async () => {
    const { error } = await supabase.rpc('remove_payid');
    if (error) throw error;
  });
}

/** PayID is an Australian service: only shown and offered for AUD. */
export const PAYID_CURRENCY = 'AUD';

export function useAcceptInvite() {
  return useInvalidating(async (token: string) => {
    const { data, error } = await supabase.rpc('accept_invite', { p_token: token });
    if (error) throw error;
    return data;
  });
}

/** An invite code for the group. Pass `guestId` to invite that guest to join and claim their history. */
export async function createInvite(groupId: string, guestId?: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_invite', { p_group_id: groupId, p_guest_id: guestId });
  if (error) throw error;
  return data;
}
