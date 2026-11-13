import { assertCents, type Cents } from './money.js';

export type UserId = string;

/** 100% expressed in basis points. Percentages are integers to avoid floats: 33.33% = 3333. */
export const FULL_PERCENT_BPS = 10_000;

export type SplitInput =
  | { method: 'equal'; participants: UserId[] }
  | { method: 'exact'; shares: { userId: UserId; amount: Cents }[] }
  | { method: 'percentage'; shares: { userId: UserId; basisPoints: number }[] }
  | { method: 'shares'; shares: { userId: UserId; units: number }[] }
  | { method: 'items'; items: SplitItem[] }
  | { method: 'adjustment'; shares: { userId: UserId; adjustment: Cents }[] };

/**
 * One line of a bill (split by item). The price is shared equally by the people who had it.
 */
export interface SplitItem {
  name: string;
  amount: Cents;
  userIds: UserId[];
}

export type SplitMethod = SplitInput['method'];

export interface SplitShare {
  userId: UserId;
  amount: Cents;
}

export type SplitErrorCode =
  | 'INVALID_TOTAL'
  | 'NO_PARTICIPANTS'
  | 'DUPLICATE_PARTICIPANT'
  | 'INVALID_SHARE'
  | 'EXACT_SUM_MISMATCH'
  | 'PERCENT_SUM_MISMATCH'
  | 'ZERO_UNITS'
  | 'NO_ITEMS'
  | 'ITEMS_EXCEED_TOTAL'
  | 'ADJUSTMENTS_EXCEED_TOTAL'
  | 'NEGATIVE_SHARE';

export class SplitError extends Error {
  constructor(
    public readonly code: SplitErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SplitError';
  }
}

/**
 * Split `total` cents between participants. The result always sums to exactly `total`.
 *
 * Remainder rule (largest-remainder method): each person first gets the floor of their
 * exact share. Leftover cents go one at a time to the people with the largest fractional
 * remainder; ties go to whoever appears first in the input. For an equal split this means
 * the first N participants listed each get one extra cent.
 */
export function computeSplit(total: Cents, input: SplitInput): SplitShare[] {
  assertCents(total, 'total');
  if (total <= 0) {
    throw new SplitError('INVALID_TOTAL', 'Expense total must be greater than zero');
  }

  switch (input.method) {
    case 'equal': {
      const ids = uniqueIds(input.participants);
      return allocateByWeights(
        total,
        ids.map((userId) => ({ userId, weight: 1 })),
      );
    }

    case 'exact': {
      const ids = uniqueIds(input.shares.map((s) => s.userId));
      let sum = 0;
      for (const s of input.shares) {
        if (!Number.isSafeInteger(s.amount) || s.amount < 0) {
          throw new SplitError('INVALID_SHARE', `Share for ${s.userId} must be a non-negative integer of cents`);
        }
        sum += s.amount;
      }
      if (sum !== total) {
        throw new SplitError(
          'EXACT_SUM_MISMATCH',
          `Exact shares add up to ${sum} but the expense total is ${total}`,
        );
      }
      return input.shares.map((s, i) => ({ userId: ids[i]!, amount: s.amount }));
    }

    case 'percentage': {
      uniqueIds(input.shares.map((s) => s.userId));
      let sum = 0;
      for (const s of input.shares) {
        if (!Number.isSafeInteger(s.basisPoints) || s.basisPoints < 0) {
          throw new SplitError('INVALID_SHARE', `Percentage for ${s.userId} must be a non-negative integer of basis points`);
        }
        sum += s.basisPoints;
      }
      if (sum !== FULL_PERCENT_BPS) {
        throw new SplitError(
          'PERCENT_SUM_MISMATCH',
          `Percentages add up to ${sum / 100}% but must total 100%`,
        );
      }
      return allocateByWeights(
        total,
        input.shares.map((s) => ({ userId: s.userId, weight: s.basisPoints })),
      );
    }

    case 'shares': {
      uniqueIds(input.shares.map((s) => s.userId));
      let sum = 0;
      for (const s of input.shares) {
        if (!Number.isSafeInteger(s.units) || s.units < 0) {
          throw new SplitError('INVALID_SHARE', `Shares for ${s.userId} must be a non-negative integer`);
        }
        sum += s.units;
      }
      if (sum === 0) {
        throw new SplitError('ZERO_UNITS', 'At least one participant must have a share');
      }
      return allocateByWeights(
        total,
        input.shares.map((s) => ({ userId: s.userId, weight: s.units })),
      );
    }

    case 'items':
      return splitByItems(total, input.items);

    case 'adjustment':
      return splitWithAdjustments(total, input.shares);
  }
}

/**
 * Split equally, with adjustments. Each adjustment is taken off the total first (an extra the
 * person had) or added back (something they skipped), the rest is split equally, then each
 * person's adjustment is added to their equal part. A negative adjustment is a discount.
 */
export function splitWithAdjustments(
  total: Cents,
  shares: { userId: UserId; adjustment: Cents }[],
): SplitShare[] {
  const ids = uniqueIds(shares.map((s) => s.userId));
  let adjustments = 0;
  for (const s of shares) {
    if (!Number.isSafeInteger(s.adjustment)) {
      throw new SplitError('INVALID_SHARE', `Adjustment for ${s.userId} must be a whole number of cents`);
    }
    adjustments += s.adjustment;
  }
  const rest = total - adjustments;
  if (rest < 0) {
    throw new SplitError(
      'ADJUSTMENTS_EXCEED_TOTAL',
      `Adjustments add up to ${adjustments} but the expense total is ${total}`,
    );
  }
  const equal = allocateByWeights(
    rest,
    ids.map((userId) => ({ userId, weight: 1 })),
  );
  const result = equal.map((e, i) => ({ userId: e.userId, amount: e.amount + shares[i]!.adjustment }));
  if (result.some((r) => r.amount < 0)) {
    throw new SplitError('NEGATIVE_SHARE', 'A discount can’t be more than that person’s share');
  }
  return result;
}

/** What the adjustments add up to: the part of the total that isn't split equally. */
export function adjustmentsTotal(shares: { adjustment: Cents }[]): Cents {
  return shares.reduce((sum, s) => sum + s.adjustment, 0);
}

/**
 * Split by item. Each item's price is shared equally by the people who had it. Anything the
 * total has on top of the items (tax, tip, service charge) is shared in proportion to what each
 * person's items cost, so someone who ordered more pays more of the tip.
 *
 * People are listed in the order they first appear in the items.
 */
export function splitByItems(total: Cents, items: SplitItem[]): SplitShare[] {
  if (items.length === 0) {
    throw new SplitError('NO_ITEMS', 'Add at least one item');
  }
  const subtotals = new Map<UserId, number>();
  let itemsTotal = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.amount) || item.amount <= 0) {
      throw new SplitError('INVALID_SHARE', `Enter a price for ${item.name.trim() || 'every item'}`);
    }
    if (item.userIds.length === 0) {
      throw new SplitError('NO_PARTICIPANTS', `Choose who had ${item.name.trim() || 'every item'}`);
    }
    const ids = uniqueIds(item.userIds);
    for (const share of allocateByWeights(
      item.amount,
      ids.map((userId) => ({ userId, weight: 1 })),
    )) {
      subtotals.set(share.userId, (subtotals.get(share.userId) ?? 0) + share.amount);
    }
    itemsTotal += item.amount;
  }

  const extra = total - itemsTotal;
  if (extra < 0) {
    throw new SplitError(
      'ITEMS_EXCEED_TOTAL',
      `Items add up to ${itemsTotal} but the expense total is ${total}`,
    );
  }

  const people = [...subtotals.entries()].map(([userId, amount]) => ({ userId, amount }));
  if (extra === 0) return people;
  const extras = allocateByWeights(
    extra,
    people.map((p) => ({ userId: p.userId, weight: p.amount })),
  );
  return people.map((p, i) => ({ userId: p.userId, amount: p.amount + extras[i]!.amount }));
}

/** What the items add up to, before tax, tip and other extras. */
export function itemsSubtotal(items: SplitItem[]): Cents {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

function uniqueIds(ids: UserId[]): UserId[] {
  if (ids.length === 0) {
    throw new SplitError('NO_PARTICIPANTS', 'An expense needs at least one participant');
  }
  const seen = new Set<UserId>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new SplitError('DUPLICATE_PARTICIPANT', `${id} appears more than once in the split`);
    }
    seen.add(id);
  }
  return ids;
}

/**
 * Integer-only largest-remainder allocation. Uses BigInt for the intermediate
 * product so large totals multiplied by weights can't lose precision.
 */
function allocateByWeights(total: Cents, entries: { userId: UserId; weight: number }[]): SplitShare[] {
  const weightSum = entries.reduce((acc, e) => acc + e.weight, 0);
  const T = BigInt(total);
  const W = BigInt(weightSum);

  const base = entries.map((e, index) => {
    const product = T * BigInt(e.weight);
    return {
      userId: e.userId,
      index,
      amount: product / W,
      remainder: product % W,
    };
  });

  let leftover = T - base.reduce((acc, b) => acc + b.amount, 0n);

  const order = [...base].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return a.index - b.index;
  });
  for (const entry of order) {
    if (leftover === 0n) break;
    entry.amount += 1n;
    leftover -= 1n;
  }

  return base.map((b) => ({ userId: b.userId, amount: Number(b.amount) }));
}
