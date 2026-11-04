import { assertCents, type Cents } from './money.js';
import type { SplitShare, UserId } from './split.js';

export interface LedgerExpense {
  payerId: UserId;
  amount: Cents;
  splits: SplitShare[];
}

export interface LedgerSettlement {
  /** The person paying money back. */
  fromUserId: UserId;
  /** The person receiving it. */
  toUserId: UserId;
  amount: Cents;
}

/** Net position per user. Positive = the group owes them. Negative = they owe the group. */
export type Balances = Map<UserId, Cents>;

export interface Transfer {
  fromUserId: UserId;
  toUserId: UserId;
  amount: Cents;
}

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

/**
 * Compute each member's net balance from the ledger.
 *
 * - Expense: payer is credited the full amount; each participant is debited their share.
 * - Settlement: the payer of the settlement is credited, the receiver is debited.
 *
 * Throws if an expense's splits don't sum to its amount, or if balances don't net to zero.
 */
export function computeBalances(
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[] = [],
  memberIds: UserId[] = [],
): Balances {
  const balances: Balances = new Map(memberIds.map((id) => [id, 0]));
  const add = (id: UserId, delta: Cents) => balances.set(id, (balances.get(id) ?? 0) + delta);

  for (const expense of expenses) {
    assertCents(expense.amount, 'expense amount');
    const splitSum = expense.splits.reduce((acc, s) => {
      assertCents(s.amount, 'split amount');
      return acc + s.amount;
    }, 0);
    if (splitSum !== expense.amount) {
      throw new LedgerError(`Expense splits sum to ${splitSum} but the expense amount is ${expense.amount}`);
    }
    add(expense.payerId, expense.amount);
    for (const split of expense.splits) add(split.userId, -split.amount);
  }

  for (const s of settlements) {
    assertCents(s.amount, 'settlement amount');
    if (s.amount <= 0) throw new LedgerError('Settlement amount must be greater than zero');
    if (s.fromUserId === s.toUserId) throw new LedgerError('A settlement needs two different people');
    add(s.fromUserId, s.amount);
    add(s.toUserId, -s.amount);
  }

  let net = 0;
  for (const value of balances.values()) net += value;
  if (net !== 0) {
    throw new LedgerError(`Ledger is out of balance by ${net} cents`);
  }
  return balances;
}

/**
 * Reduce balances to a short list of transfers that settles everyone up.
 * Greedy: repeatedly match the largest debtor with the largest creditor.
 * Produces at most (n - 1) transfers. Ties are broken by user ID so output is deterministic.
 */
export function simplifyDebts(balances: Balances): Transfer[] {
  const creditors: { id: UserId; amount: Cents }[] = [];
  const debtors: { id: UserId; amount: Cents }[] = [];
  for (const [id, amount] of balances) {
    if (amount > 0) creditors.push({ id, amount });
    else if (amount < 0) debtors.push({ id, amount: -amount });
  }
  const byAmountThenId = (a: { id: UserId; amount: Cents }, b: { id: UserId; amount: Cents }) =>
    b.amount - a.amount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const transfers: Transfer[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(byAmountThenId);
    debtors.sort(byAmountThenId);
    const creditor = creditors[0]!;
    const debtor = debtors[0]!;
    const amount = Math.min(creditor.amount, debtor.amount);

    transfers.push({ fromUserId: debtor.id, toUserId: creditor.id, amount });
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) creditors.shift();
    if (debtor.amount === 0) debtors.shift();
  }
  return transfers;
}

export interface PairEntry {
  kind: 'expense' | 'settlement';
  /** Index of the item in the array it came from. */
  index: number;
  /** Effect on what `otherId` owes `meId`: positive = they owe you more, negative = you owe them more. */
  amount: Cents;
}

/**
 * Everything between two people in a group: which expenses and payments make up what one owes the other.
 *
 * - An expense you paid: the other person owes you their share.
 * - An expense they paid: you owe them your share.
 * - A payment from them to you lowers what they owe; a payment from you to them raises it.
 *
 * Summing `pairBreakdown(...).total` over every other member gives exactly your group balance from `computeBalances`.
 * (The simplified "who owes whom" transfers can route money differently; the totals are the same.)
 */
export function pairBreakdown(
  meId: UserId,
  otherId: UserId,
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[] = [],
): { entries: PairEntry[]; total: Cents } {
  const entries: PairEntry[] = [];
  expenses.forEach((e, index) => {
    let amount = 0;
    if (e.payerId === meId) amount = e.splits.find((s) => s.userId === otherId)?.amount ?? 0;
    else if (e.payerId === otherId) amount = -(e.splits.find((s) => s.userId === meId)?.amount ?? 0);
    if (amount !== 0) entries.push({ kind: 'expense', index, amount });
  });
  settlements.forEach((s, index) => {
    let amount = 0;
    if (s.fromUserId === otherId && s.toUserId === meId) amount = -s.amount;
    else if (s.fromUserId === meId && s.toUserId === otherId) amount = s.amount;
    if (amount !== 0) entries.push({ kind: 'settlement', index, amount });
  });
  return { entries, total: entries.reduce((sum, e) => sum + e.amount, 0) };
}
