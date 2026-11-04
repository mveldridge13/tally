import { assertCents, type Cents } from './money.js';

export type UserId = string;

/** 100% expressed in basis points. Percentages are integers to avoid floats: 33.33% = 3333. */
export const FULL_PERCENT_BPS = 10_000;

export type SplitInput =
  | { method: 'equal'; participants: UserId[] }
  | { method: 'exact'; shares: { userId: UserId; amount: Cents }[] }
  | { method: 'percentage'; shares: { userId: UserId; basisPoints: number }[] }
  | { method: 'shares'; shares: { userId: UserId; units: number }[] };

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
  | 'ZERO_UNITS';

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
  }
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
