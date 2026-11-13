import { centsToDecimalString } from '@tally/shared';

import type { Expense, Group } from '@/lib/data';
import type { ActivityItem } from '@/store/hooks';

/**
 * Does an Activity item match what was typed in search? Everything is matched on the phone, over
 * what you can already see, so members never find other people's items.
 *
 * Matches the expense's name and its item names, the group's name, anyone who paid or was part of
 * it (or who paid or was paid, for a payment), and the amount ("42.50", "42.5" or "42").
 * Every word typed has to match somewhere: "sam pizza" finds Sam's pizza.
 */
export function matchesSearch(
  item: ActivityItem,
  query: string,
  ctx: { expense?: Expense; group?: Group; name: (id: string) => string },
): boolean {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const people =
    item.kind === 'expense'
      ? [item.actorId, ...(ctx.expense?.splits.map((s) => s.userId) ?? [])]
      : [item.fromUserId, item.toUserId];
  const amount = centsToDecimalString(item.amount);
  const haystack = [
    item.kind === 'expense' ? item.title : 'payment paid back settled',
    ...(ctx.expense?.items?.map((i) => i.name) ?? []),
    ctx.group?.name ?? '',
    ...people.map(ctx.name),
    amount,
    amount.replace(/0$/, ''),
    amount.replace(/\.00$/, ''),
  ]
    .join(' \u0000 ')
    .toLowerCase();

  return words.every((w) => haystack.includes(w.replace(/^\$/, '')));
}
