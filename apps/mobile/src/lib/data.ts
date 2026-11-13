import { type PayIdType, computeSplit, type Balances, type Cents, type SplitInput, type SplitItem, type SplitShare, type Transfer } from '@tally/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useMyId } from './auth';
import { deviceCurrency } from './currencies';
import { supabase } from './supabase';

/**
 * Data layer. Reads all of the user's groups in one nested query. RLS limits the rows: in groups
 * you own you get every expense and payment; elsewhere only the ones you added or took part in.
 * Balances come from the server (my_group_summaries), which sees the whole ledger.
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
  /** Emoji shown instead of the first letter; null for none. */
  icon: string | null;
  /** Current members only. People who left keep their history and still appear in expenses. */
  memberIds: string[];
  roles: Record<string, GroupRole>;
  /** The signed-in user's role in this group. */
  myRole: GroupRole;
  /** You put this group away ("Done with this group"): it sits at the bottom of your Groups list. */
  hiddenByMe: boolean;
  createdAt: string;
}

/** 'admin' is shown as "Co-owner": sees everything like the owner, but can't manage the group. */
export type GroupRole = 'owner' | 'admin' | 'member';

/** Owners and co-owners see every expense, payment and balance in the group. */
export function seesEverything(role: GroupRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

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
  /** The bill's lines when split by item; null for the other methods. */
  items: SplitItem[] | null;
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
  /**
   * 'pending': recorded by someone other than the receiver, waiting for the receiver to confirm.
   * Pending payments don't count towards any balance; they're kept in `pendingPayments`.
   */
  status: 'recorded' | 'pending';
}

/** A payment someone says they made to you, waiting for you to confirm or say it never arrived. */
export interface PaymentToConfirm {
  id: string;
  group: { id: string; name: string; icon: string | null; currency: string };
  fromUserId: string;
  fromName: string;
  amount: Cents;
  occurredAt: string;
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

/** A saved PayID (Australia only). Visible to its owner and to members of groups they own. */
export interface PayId {
  type: PayIdType;
  /** Stored normalised: +614XXXXXXXX, a lower-case email, or 11 ABN digits. */
  value: string;
  accountName: string | null;
}

export interface TallyData {
  me: Profile | null;
  /** PayIDs by user id: yours, and those of the owners of your groups. */
  payIds: Record<string, PayId>;
  people: Record<string, Person>;
  groups: Group[];
  /** Expenses and payments you're allowed to see: everything in groups you own, only your own elsewhere. */
  expenses: Expense[];
  /** Payments that count: confirmed, or recorded by the person who received them. */
  settlements: Settlement[];
  /** Payments you can see that are waiting for the receiver to confirm. They don't count yet. */
  pendingPayments: Settlement[];
  /** Balances per group, worked out on the server from the whole ledger (see my_group_summaries). */
  ledgers: Record<string, GroupLedger>;
}

/** What the server tells you about a group's money. Members get only their own share of this. */
export interface GroupLedger {
  myBalance: Cents;
  myShare: Cents;
  /** Owner only; null for members. */
  totalSpent: Cents | null;
  /** Owner: every member. Member: only you. */
  balances: Map<string, Cents>;
  /** Owner: the whole "who pays whom" list. Member: only the lines that include you. */
  transfers: Transfer[];
}

const EMPTY: TallyData = { me: null, payIds: {}, people: {}, groups: [], expenses: [], settlements: [], pendingPayments: [], ledgers: {} };
export const TALLY_KEY = ['tally'] as const;

async function fetchTally(myId: string): Promise<TallyData> {
  const [groupsRes, meRes, payIdsRes, ledgersRes, hiddenRes] = await Promise.all([
    supabase
      .from('groups')
      .select(
        `id, name, currency, icon, created_at,
         group_members ( user_id, role, left_at, profiles ( id, name, is_guest ) ),
         expenses ( id, description, amount_cents, payer_id, created_by, split_method, occurred_at,
                    created_at, updated_at, deleted_at, items,
                    expense_splits ( user_id, amount_cents, weight ) ),
         settlements ( id, from_user_id, to_user_id, amount_cents, occurred_at, status, created_by, created_at, note, replaces_id )`,
      )
      .is('archived_at', null)
      .is('expenses.deleted_at', null)
      // Everything but undone payments: pending ones are kept apart from the ones that count, and
      // declined ones are skipped below. (Filtering this way also works before the database knows
      // the newer statuses.)
      .neq('settlements.status', 'voided')
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, name, currency, currency_chosen, created_at').eq('id', myId).maybeSingle(),
    // RLS returns only your own PayID and those of the owners of groups you're in.
    supabase.from('payment_methods').select('user_id, payid_type, value, account_name').eq('kind', 'payid'),
    supabase.rpc('my_group_summaries'),
    // Only your own rows (RLS). Nobody else can see which groups you've put away.
    supabase.from('hidden_groups').select('group_id'),
  ]);
  if (groupsRes.error) throw groupsRes.error;
  if (ledgersRes.error) throw ledgersRes.error;

  const data: TallyData = { me: null, payIds: {}, people: {}, groups: [], expenses: [], settlements: [], pendingPayments: [], ledgers: {} };
  for (const l of (ledgersRes.data ?? []) as unknown as ServerLedger[]) {
    data.ledgers[l.group_id] = {
      myBalance: l.my_balance,
      myShare: l.my_share,
      totalSpent: l.total_spent,
      balances: new Map(l.balances.map((b) => [b.user_id, b.balance_cents])),
      transfers: l.transfers.map((t) => ({ fromUserId: t.from_user_id, toUserId: t.to_user_id, amount: t.amount_cents })),
    };
  }
  for (const p of payIdsRes.data ?? []) {
    data.payIds[p.user_id] = { type: p.payid_type as PayIdType, value: p.value, accountName: p.account_name };
  }
  if (meRes.data) {
    const p = meRes.data;
    data.me = { id: p.id, name: p.name, currency: p.currency, currencyChosen: p.currency_chosen, createdAt: p.created_at };
    data.people[p.id] = { id: p.id, name: p.name };
  }

  // Not fatal: if this fails, every group just shows as usual.
  const hidden = new Set((hiddenRes.data ?? []).map((h) => h.group_id));

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
    data.groups.push({
      id: g.id,
      name: g.name,
      currency: g.currency,
      icon: g.icon,
      memberIds,
      roles,
      myRole,
      hiddenByMe: hidden.has(g.id),
      createdAt: g.created_at,
    });

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
        items: Array.isArray(e.items) ? (e.items as RpcItem[]).map(fromRpcItem) : null,
        occurredAt: e.occurred_at,
        createdAt: e.created_at,
        updatedAt: e.updated_at,
      });
    }
    for (const s of g.settlements) {
      if (s.status !== 'recorded' && s.status !== 'pending') continue;
      (s.status === 'pending' ? data.pendingPayments : data.settlements).push({
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
        status: s.status === 'pending' ? 'pending' : 'recorded',
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

/**
 * Your share of each group's expenses this calendar month (device time zone), by group id.
 * Worked out on the server, since members can't download expenses other people added.
 * Null (not an error) while loading or if the server doesn't have the function yet.
 */
export function useMonthSpending(): Record<string, Cents> | null {
  const myId = useMyId();
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const query = useQuery({
    queryKey: [...TALLY_KEY, myId, 'month-spending', from.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_spending_between', { p_from: from.toISOString(), p_to: to.toISOString() });
      if (error) return null;
      return Object.fromEntries((data ?? []).map((r) => [r.group_id, r.my_share])) as Record<string, Cents>;
    },
    enabled: !!myId,
  });
  return query.data ?? null;
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
  /** You own or co-own the group, so you see everything in it. */
  seesAll: boolean;
  /**
   * Owner or co-owner: every member's balance in the group.
   * Member: your balance, and for everyone else what's owed between the two of you
   * (positive = you owe them, negative = they owe you), from the transfers you're in.
   */
  balances: Balances;
  myBalance: Cents;
  transfers: Transfer[];
  myShare: Cents;
  /** Owner only. */
  totalSpent: Cents | null;
}

/** Shape of one entry from the my_group_summaries() database function. */
interface ServerLedger {
  group_id: string;
  my_balance: number;
  my_share: number;
  total_spent: number | null;
  balances: { user_id: string; balance_cents: number }[];
  transfers: { from_user_id: string; to_user_id: string; amount_cents: number }[];
}

const NO_LEDGER: GroupLedger = { myBalance: 0, myShare: 0, totalSpent: null, balances: new Map(), transfers: [] };

export function summarizeGroup(group: Group, ledger: GroupLedger | undefined, myId: string): GroupSummary {
  const l = ledger ?? NO_LEDGER;
  const seesAll = seesEverything(group.myRole);
  let balances: Balances = l.balances;
  if (!seesAll) {
    // Members only get the lines that include them: show each person what's between you two.
    balances = new Map(group.memberIds.map((id) => [id, 0]));
    balances.set(myId, l.myBalance);
    for (const t of l.transfers) {
      if (t.fromUserId === myId) balances.set(t.toUserId, (balances.get(t.toUserId) ?? 0) + t.amount);
      else if (t.toUserId === myId) balances.set(t.fromUserId, (balances.get(t.fromUserId) ?? 0) - t.amount);
    }
  }
  return { group, seesAll, balances, myBalance: l.myBalance, transfers: l.transfers, myShare: l.myShare, totalSpent: l.totalSpent };
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

/** "Done with this group" (hidden: true) or bring it back. Only changes your own Groups list. */
export function useSetGroupHidden() {
  return useInvalidating(async ({ groupId, hidden }: { groupId: string; hidden: boolean }) => {
    const { error } = hidden
      ? await supabase.from('hidden_groups').upsert({ group_id: groupId }, { ignoreDuplicates: true })
      : await supabase.from('hidden_groups').delete().eq('group_id', groupId);
    if (error) throw error;
  });
}

export function useCreateGroup() {
  return useInvalidating(async (input: { name: string; currency: string; icon?: string | null }) => {
    const { data, error } = await supabase.rpc('create_group', {
      p_name: input.name,
      p_currency: input.currency,
      p_icon: input.icon ?? undefined,
    });
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
  if (split.method === 'adjustment') split.shares.forEach((s) => weights.set(s.userId, s.adjustment));
  return shares.map((s) => ({ user_id: s.userId, amount_cents: s.amount, weight: weights.get(s.userId) ?? null }));
}

/** How an item is stored on the expense. */
type RpcItem = {
  name: string;
  amount_cents: number;
  user_ids: string[];
};

const fromRpcItem = (i: RpcItem): SplitItem => ({ name: i.name, amount: i.amount_cents, userIds: i.user_ids });

function toRpcItems(split: SplitInput): RpcItem[] | undefined {
  if (split.method !== 'items') return undefined;
  return split.items.map((i) => ({ name: i.name.trim(), amount_cents: i.amount, user_ids: i.userIds }));
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
      p_items: toRpcItems(input.split),
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
      p_items: toRpcItems(input.split),
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

/** Owner only: make a member a co-owner, or a co-owner a member again. Guests can't be co-owners. */
export function useSetCoOwner() {
  return useInvalidating(async (input: { groupId: string; userId: string; coOwner: boolean }) => {
    const { error } = await supabase.rpc('set_co_owner', { p_group_id: input.groupId, p_user_id: input.userId, p_co_owner: input.coOwner });
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

/** Payments someone says they made to you that you haven't answered yet (Home shows them). */
export function usePaymentsToConfirm() {
  const myId = useMyId();
  const query = useQuery({
    queryKey: [...TALLY_KEY, 'to-confirm', myId],
    queryFn: async (): Promise<PaymentToConfirm[]> => {
      const { data, error } = await supabase.rpc('payments_to_confirm');
      if (error) throw error;
      return data.map((p) => ({
        id: p.id,
        group: { id: p.group_id, name: p.group_name, icon: p.group_icon, currency: p.group_currency },
        fromUserId: p.from_user_id,
        fromName: p.from_name,
        amount: p.amount_cents,
        occurredAt: p.occurred_at,
      }));
    },
    enabled: !!myId,
  });
  return { ...query, data: query.data ?? [] };
}

/** The receiver answers a pending payment: it arrived (it counts now) or it didn't (it's dropped). */
export function useRespondToPayment() {
  return useInvalidating(async (input: { settlementId: string; received: boolean }) => {
    const { error } = await supabase.rpc('respond_to_payment', { p_settlement_id: input.settlementId, p_received: input.received });
    if (error) throw error;
  });
}

/** The payer nudges the receiver to confirm a pending payment (once a day). */
export function useRemindToConfirm() {
  return useInvalidating(async (settlementId: string) => {
    const { error } = await supabase.rpc('remind_to_confirm', { p_settlement_id: settlementId });
    if (error) throw error;
  });
}

/** Undo a payment recorded by mistake (or cancel one still waiting to be confirmed). It's marked voided (kept for history) and balances update. */
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

/** Set or clear a group's emoji (empty string clears it). Any member can. */
export function useSetGroupIcon() {
  return useInvalidating(async (input: { groupId: string; icon: string | null }) => {
    const { error } = await supabase.rpc('set_group_icon', { p_group_id: input.groupId, p_icon: input.icon ?? '' });
    if (error) throw error;
  });
}

/** Someone you are, or were, in a group with. They can be added to any of your groups without an invite. */
export interface SplitPartner {
  id: string;
  name: string;
  sharedGroups: number;
}

/** People you split with, most recent first. Refreshes whenever the rest of the data does. */
export function useSplitPartners() {
  const myId = useMyId();
  const query = useQuery({
    queryKey: [...TALLY_KEY, 'partners', myId],
    queryFn: async (): Promise<SplitPartner[]> => {
      const { data, error } = await supabase.rpc('split_partners');
      if (error) throw error;
      return data.map((p) => ({ id: p.user_id, name: p.name, sharedGroups: p.shared_groups }));
    },
    enabled: !!myId,
  });
  return { ...query, data: query.data ?? [] };
}

/** Add people you split with to a group, all at once. */
export function useAddMembers() {
  return useInvalidating(async (input: { groupId: string; userIds: string[] }) => {
    const { error } = await supabase.rpc('add_members', { p_group_id: input.groupId, p_user_ids: input.userIds });
    if (error) throw error;
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

export interface AppNotification {
  id: string;
  kind:
    | 'added_to_group'
    | 'settle_reminder'
    | 'made_co_owner'
    | 'removed_co_owner'
    | 'removed_from_group'
    | 'group_settled'
    | 'payment_to_confirm'
    | 'payment_confirmed'
    | 'payment_declined'
    | 'confirm_reminder'
    | 'recurring_heads_up'
    | 'recurring_added'
    | 'recurring_due'
    | 'recurring_due_reminder';
  /** Recurring notifications: which recurring expense, and its name. */
  recurringId: string | null;
  recurringDescription: string | null;
  /** Payment notifications: the payment, and where it stands now (pending, recorded, declined, voided). */
  settlementId: string | null;
  settlementStatus: string | null;
  group: { id: string; name: string; icon: string | null; currency: string };
  actorName: string;
  /** settle_reminder: what you owed when reminded, in the group's currency. */
  amount: Cents | null;
  at: string;
  read: boolean;
}

/** Your notifications under the bell, newest first. Refreshes whenever the rest of the data does. */
export function useNotifications() {
  const myId = useMyId();
  const query = useQuery({
    queryKey: [...TALLY_KEY, 'notifications', myId],
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase.rpc('my_notifications');
      if (error) throw error;
      return data.map((n) => ({
        id: n.id,
        kind: n.kind as AppNotification['kind'],
        group: { id: n.group_id, name: n.group_name, icon: n.group_icon, currency: n.group_currency },
        actorName: n.actor_name ?? 'Someone',
        amount: n.amount_cents,
        at: n.created_at,
        read: n.read_at !== null,
        settlementId: n.settlement_id,
        settlementStatus: n.settlement_status,
        recurringId: (n as { recurring_id?: string | null }).recurring_id ?? null,
        recurringDescription: (n as { recurring_description?: string | null }).recurring_description ?? null,
      }));
    },
    enabled: !!myId,
  });
  const list = query.data ?? [];
  return { ...query, data: list, unread: list.filter((n) => !n.read).length };
}

/** Mark all your notifications as read (on opening the list). */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_notifications_read');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...TALLY_KEY, 'notifications'] }),
  });
}

/** Owner only: members of a group reminded to settle in the last 24 hours (worked out when fetched). */
export function useRecentlyReminded(groupId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: [...TALLY_KEY, 'reminders', groupId],
    queryFn: async (): Promise<ReadonlySet<string>> => {
      const { data, error } = await supabase.rpc('group_reminders', { p_group_id: groupId });
      if (error) throw error;
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      return new Set(data.filter((r) => new Date(r.last_reminded_at).getTime() > dayAgo).map((r) => r.user_id));
    },
    enabled,
  });
  return query.data ?? new Set<string>();
}

/** Owner only: remind a member who owes money to settle up (once a day per person). */
export function useRemindToSettle() {
  return useInvalidating(async (input: { groupId: string; userId: string }) => {
    const { error } = await supabase.rpc('remind_to_settle', { p_group_id: input.groupId, p_user_id: input.userId });
    if (error) throw error;
  });
}

// ─── Recurring expenses ──────────────────────────────────────────────────────

export type Frequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';
export const FREQUENCIES: Frequency[] = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];
/** Heads-up choices: days before the date. */
export const HEADS_UP_DAYS = [0, 1, 3, 7] as const;

/** A recurring expense: what it adds, how often, and where it's up to. Kept apart from the expenses it adds. */
export interface RecurringExpense {
  id: string;
  groupId: string;
  createdById: string;
  description: string;
  payerId: string;
  /** The split as it was entered, so the form opens filled in. */
  split: SplitInput;
  /** Amount changes each time: Tally asks for it on the day. */
  variable: boolean;
  /** Fixed amount only. */
  amount: Cents | null;
  frequency: Frequency;
  startDate: string;
  nextDate: string;
  endDate: string | null;
  remaining: number | null;
  headsUpDays: number;
  /** Variable only: the date still waiting for its amount. */
  dueDate: string | null;
  paused: boolean;
  createdAt: string;
}

type RecurringRow = {
  id: string;
  group_id: string;
  created_by: string;
  description: string;
  payer_id: string;
  split_input: unknown;
  variable: boolean;
  amount_cents: number | null;
  frequency: string;
  start_date: string;
  next_date: string;
  end_date: string | null;
  remaining: number | null;
  heads_up_days: number;
  due_date: string | null;
  paused: boolean;
  created_at: string;
};

const fromRecurringRow = (r: RecurringRow): RecurringExpense => ({
  id: r.id,
  groupId: r.group_id,
  createdById: r.created_by,
  description: r.description,
  payerId: r.payer_id,
  split: r.split_input as SplitInput,
  variable: r.variable,
  amount: r.amount_cents,
  frequency: r.frequency as Frequency,
  startDate: r.start_date,
  nextDate: r.next_date,
  endDate: r.end_date,
  remaining: r.remaining,
  headsUpDays: r.heads_up_days,
  dueDate: r.due_date,
  paused: r.paused,
  createdAt: r.created_at,
});

const RECURRING_COLUMNS =
  'id, group_id, created_by, description, payer_id, split_input, variable, amount_cents, frequency, start_date, next_date, end_date, remaining, heads_up_days, due_date, paused, created_at';

/**
 * A group's active recurring expenses (not stopped). Owners and co-owners see all of them;
 * members see the ones they set up.
 */
export function useRecurring(groupId: string) {
  const query = useQuery({
    queryKey: [...TALLY_KEY, 'recurring', groupId],
    queryFn: async (): Promise<RecurringExpense[]> => {
      const { data, error } = await (supabase.from('recurring_expenses' as never) as unknown as ReturnType<typeof supabase.from>)
        .select(RECURRING_COLUMNS)
        .eq('group_id', groupId)
        .is('stopped_at', null)
        .order('created_at');
      if (error) throw error;
      return ((data ?? []) as unknown as RecurringRow[]).map(fromRecurringRow);
    },
  });
  return { ...query, data: query.data ?? [] };
}

/** The expenses one recurring expense has added, newest first (only ones you can see). */
export function useRecurringHistory(recurringId: string) {
  const { data } = useTallyData();
  const ids = useQuery({
    queryKey: [...TALLY_KEY, 'recurring-history', recurringId],
    queryFn: async (): Promise<string[]> => {
      const { data: rows, error } = await supabase.from('expenses').select('id').eq('recurring_id' as never, recurringId as never);
      if (error) throw error;
      return (rows ?? []).map((r) => r.id);
    },
  });
  const set = new Set(ids.data ?? []);
  return data.expenses.filter((e) => set.has(e.id)).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
}

/** Bills with an amount that changes each time, due and waiting for someone to enter it. */
export interface RecurringDue {
  id: string;
  groupId: string;
  description: string;
  payerId: string;
  split: SplitInput;
  frequency: Frequency;
  dueDate: string;
}

export function useRecurringDue() {
  const myId = useMyId();
  const query = useQuery({
    queryKey: [...TALLY_KEY, 'recurring-due', myId],
    queryFn: async (): Promise<RecurringDue[]> => {
      const { data, error } = await callRpc('recurring_due', {});
      if (error) throw error;
      return ((data ?? []) as { id: string; group_id: string; description: string; payer_id: string; split_input: unknown; frequency: string; due_date: string }[]).map(
        (r) => ({
          id: r.id,
          groupId: r.group_id,
          description: r.description,
          payerId: r.payer_id,
          split: r.split_input as SplitInput,
          frequency: r.frequency as Frequency,
          dueDate: r.due_date,
        }),
      );
    },
    enabled: !!myId,
  });
  return { ...query, data: query.data ?? [] };
}

/** What a recurring expense is set to do, as entered on the form. */
export interface RecurringInput {
  description: string;
  payerId: string;
  split: SplitInput;
  variable: boolean;
  /** Needed for a fixed amount; ignored when it changes each time. */
  amount: Cents | null;
  frequency: Frequency;
  endDate: string | null;
  remaining: number | null;
  headsUpDays: number;
}

/** Calls a database function by name, kept bound to the client (calling `supabase.rpc` detached loses `this`). */
const callRpc = (fn: string, args: Record<string, unknown>) =>
  supabase.rpc(fn as never, args as never) as unknown as Promise<{ data: unknown; error: Error | null }>;

function recurringArgs(input: RecurringInput) {
  const fixed = !input.variable && input.amount !== null;
  return {
    p_description: input.description,
    p_payer_id: input.payerId,
    p_split_method: input.split.method,
    p_split_input: input.split,
    p_variable: input.variable,
    p_amount_cents: fixed ? input.amount : null,
    p_splits: fixed ? toRpcSplits(input.amount!, input.split) : null,
    p_items: fixed ? (toRpcItems(input.split) ?? null) : null,
    p_frequency: input.frequency,
    p_end_date: input.endDate,
    p_remaining: input.remaining,
    p_heads_up_days: input.headsUpDays,
  };
}

/**
 * Set up a recurring expense. When it starts today, pass the expense just saved as `firstExpenseId`:
 * it counts as the first one.
 */
export function useCreateRecurring() {
  return useInvalidating(async (input: RecurringInput & { groupId: string; startDate: string; firstExpenseId?: string }) => {
    const { data, error } = await callRpc('create_recurring', {
      p_group_id: input.groupId,
      ...recurringArgs(input),
      p_start_date: input.startDate,
      p_first_expense_id: input.firstExpenseId ?? null,
    });
    if (error) throw error;
    return data as string;
  });
}

/**
 * Change what future ones will be; expenses already added stay as they are. `nextDate` moves the
 * next one (the schedule counts on from there at the same frequency).
 */
export function useUpdateRecurring() {
  return useInvalidating(async (input: RecurringInput & { id: string; nextDate?: string }) => {
    // Only sent when the date was moved, so an edit that keeps the date works with any database version.
    const { error } = await callRpc('update_recurring', {
      p_id: input.id,
      ...recurringArgs(input),
      ...(input.nextDate ? { p_next_date: input.nextDate } : {}),
    });
    if (error) throw error;
  });
}

export function useSetRecurringPaused() {
  return useInvalidating(async (input: { id: string; paused: boolean }) => {
    const { error } = await callRpc('set_recurring_paused', { p_id: input.id, p_paused: input.paused });
    if (error) throw error;
  });
}

export function useStopRecurring() {
  return useInvalidating(async (id: string) => {
    const { error } = await callRpc('stop_recurring', { p_id: id });
    if (error) throw error;
  });
}

/** After the amount for a due bill is saved as an expense: link it and clear the due bill. */
export async function completeRecurringDue(recurringId: string, expenseId: string) {
  const { error } = await callRpc('complete_recurring_due', { p_id: recurringId, p_expense_id: expenseId });
  if (error) throw error;
}
