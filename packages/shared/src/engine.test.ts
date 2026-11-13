import { describe, expect, it } from 'vitest';
import {
  centsToDecimalString,
  computeBalances,
  computeSplit,
  createExpenseSchema,
  inferItemsRest,
  LedgerError,
  normalisePayId,
  formatPayId,
  copyablePayId,
  isValidAbn,
  pairBreakdown,
  parseToCents,
  simplifyDebts,
  SplitError,
  type SplitInput,
} from './index.js';

const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);

describe('money', () => {
  it('parses decimal strings to cents without float error', () => {
    expect(parseToCents('125.50')).toBe(12550);
    expect(parseToCents('125.5')).toBe(12550);
    expect(parseToCents('0.07')).toBe(7);
    expect(parseToCents('1,250')).toBe(125000);
    expect(parseToCents('0.29')).toBe(29); // 0.29 * 100 === 28.999999999999996 in floats
  });

  it('rejects malformed input', () => {
    expect(() => parseToCents('12.345')).toThrow();
    expect(() => parseToCents('abc')).toThrow();
    expect(() => parseToCents('')).toThrow();
  });

  it('formats cents', () => {
    expect(centsToDecimalString(12550)).toBe('125.50');
    expect(centsToDecimalString(-5)).toBe('-0.05');
  });
});

describe('computeSplit', () => {
  it('splits equally and gives leftover cents to the first participants', () => {
    expect(computeSplit(10000, { method: 'equal', participants: ['a', 'b', 'c'] })).toEqual([
      { userId: 'a', amount: 3334 },
      { userId: 'b', amount: 3333 },
      { userId: 'c', amount: 3333 },
    ]);
    expect(computeSplit(2, { method: 'equal', participants: ['a', 'b', 'c'] })).toEqual([
      { userId: 'a', amount: 1 },
      { userId: 'b', amount: 1 },
      { userId: 'c', amount: 0 },
    ]);
  });

  it('accepts exact amounts only when they sum to the total', () => {
    const split = computeSplit(5000, {
      method: 'exact',
      shares: [
        { userId: 'a', amount: 3000 },
        { userId: 'b', amount: 2000 },
      ],
    });
    expect(split).toEqual([
      { userId: 'a', amount: 3000 },
      { userId: 'b', amount: 2000 },
    ]);
    expect(() =>
      computeSplit(5000, {
        method: 'exact',
        shares: [
          { userId: 'a', amount: 3000 },
          { userId: 'b', amount: 1999 },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'EXACT_SUM_MISMATCH' }));
  });

  it('splits by percentage (basis points) with largest-remainder rounding', () => {
    const split = computeSplit(10000, {
      method: 'percentage',
      shares: [
        { userId: 'a', basisPoints: 3333 },
        { userId: 'b', basisPoints: 3333 },
        { userId: 'c', basisPoints: 3334 },
      ],
    });
    expect(split).toEqual([
      { userId: 'a', amount: 3333 },
      { userId: 'b', amount: 3333 },
      { userId: 'c', amount: 3334 },
    ]);
    expect(() =>
      computeSplit(10000, { method: 'percentage', shares: [{ userId: 'a', basisPoints: 9999 }] }),
    ).toThrow(expect.objectContaining({ code: 'PERCENT_SUM_MISMATCH' }));
  });

  it('splits by shares', () => {
    expect(
      computeSplit(1000, {
        method: 'shares',
        shares: [
          { userId: 'a', units: 2 },
          { userId: 'b', units: 1 },
        ],
      }),
    ).toEqual([
      { userId: 'a', amount: 667 },
      { userId: 'b', amount: 333 },
    ]);
  });

  it('splits by item, sharing an item only between the people who had it', () => {
    // $90 dinner: pasta (a), steak (b), salad (c), garlic bread shared by all three.
    const split = computeSplit(9000, {
      method: 'items',
      items: [
        { name: 'Pasta', amount: 2500, userIds: ['a'] },
        { name: 'Steak', amount: 4000, userIds: ['b'] },
        { name: 'Salad', amount: 1500, userIds: ['c'] },
        { name: 'Garlic bread', amount: 1000, userIds: ['a', 'b', 'c'] },
      ],
    });
    expect(split).toEqual([
      { userId: 'a', amount: 2834 },
      { userId: 'b', amount: 4333 },
      { userId: 'c', amount: 1833 },
    ]);
  });

  it('shares tax and tip on top of the items in proportion to what each person had', () => {
    // Items come to $100; the bill is $110. a had $75 of it, b $25, so a pays 3/4 of the extra $10.
    expect(
      computeSplit(11_000, {
        method: 'items',
        items: [
          { name: 'Mains', amount: 7500, userIds: ['a'] },
          { name: 'Dessert', amount: 2500, userIds: ['b'] },
        ],
      }),
    ).toEqual([
      { userId: 'a', amount: 8250 },
      { userId: 'b', amount: 2750 },
    ]);
  });

  it('can split everything else equally, covering a one-off extra', () => {
    // $90 dinner for three; a also had a $15 cocktail. The other $75 is split three ways.
    expect(
      computeSplit(9000, {
        method: 'items',
        items: [{ name: 'Cocktail', amount: 1500, userIds: ['a'] }],
        rest: 'equal',
        participants: ['a', 'b', 'c'],
      }),
    ).toEqual([
      { userId: 'a', amount: 4000 },
      { userId: 'b', amount: 2500 },
      { userId: 'c', amount: 2500 },
    ]);
  });

  it('works out how a saved items split shared everything else', () => {
    const items = [{ name: 'Cocktail', amount: 1500, userIds: ['a'] }];
    const equal = computeSplit(9000, { method: 'items', items, rest: 'equal', participants: ['a', 'b'] });
    expect(inferItemsRest(9000, items, equal)).toEqual({ rest: 'equal', participants: ['a', 'b'] });
    // a had the cocktail but isn't sharing the rest.
    const notA = computeSplit(9000, { method: 'items', items, rest: 'equal', participants: ['b', 'c'] });
    expect(inferItemsRest(9000, items, notA)).toEqual({ rest: 'equal', participants: ['b', 'c'] });
    const both = [...items, { name: 'Pasta', amount: 1500, userIds: ['b'] }];
    expect(inferItemsRest(4000, both, computeSplit(4000, { method: 'items', items: both })).rest).toBe('equal');
    const uneven = [
      { name: 'Mains', amount: 7500, userIds: ['a'] },
      { name: 'Dessert', amount: 2500, userIds: ['b'] },
    ];
    expect(inferItemsRest(11_000, uneven, computeSplit(11_000, { method: 'items', items: uneven })).rest).toBe(
      'proportional',
    );
  });

  it('needs someone to share everything else when it is split equally', () => {
    expect(() =>
      computeSplit(9000, { method: 'items', items: [{ name: 'Cocktail', amount: 1500, userIds: ['a'] }], rest: 'equal' }),
    ).toThrow(expect.objectContaining({ code: 'NO_PARTICIPANTS' }));
  });

  it('rejects items that are empty, unassigned or more than the total', () => {
    expect(() => computeSplit(100, { method: 'items', items: [] })).toThrow(
      expect.objectContaining({ code: 'NO_ITEMS' }),
    );
    expect(() =>
      computeSplit(100, { method: 'items', items: [{ name: 'Chips', amount: 100, userIds: [] }] }),
    ).toThrow(expect.objectContaining({ code: 'NO_PARTICIPANTS' }));
    expect(() =>
      computeSplit(100, { method: 'items', items: [{ name: 'Chips', amount: 0, userIds: ['a'] }] }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_SHARE' }));
    expect(() =>
      computeSplit(100, { method: 'items', items: [{ name: 'Chips', amount: 150, userIds: ['a'] }] }),
    ).toThrow(expect.objectContaining({ code: 'ITEMS_EXCEED_TOTAL' }));
  });

  it('accepts an items split in the expense schema', () => {
    const parsed = createExpenseSchema.safeParse({
      groupId: 'g',
      description: 'Dinner',
      amount: 1000,
      payerId: 'a',
      date: new Date().toISOString(),
      split: { method: 'items', items: [{ name: 'Pizza', amount: 1000, userIds: ['a', 'b'] }] },
    });
    expect(parsed.success).toBe(true);
  });

  it('splits equally after adjustments', () => {
    // $90 dinner for three; a had an extra $15 cocktail. $75 split three ways, then +$15 for a.
    expect(
      computeSplit(9000, {
        method: 'adjustment',
        shares: [
          { userId: 'a', adjustment: 1500 },
          { userId: 'b', adjustment: 0 },
          { userId: 'c', adjustment: 0 },
        ],
      }),
    ).toEqual([
      { userId: 'a', amount: 4000 },
      { userId: 'b', amount: 2500 },
      { userId: 'c', amount: 2500 },
    ]);
  });

  it('takes a negative adjustment off that person and shares it among the rest', () => {
    // $100 for two; b skipped $10 of it. The $110 is split $55 each, then b gets $10 off.
    const split = computeSplit(10_000, {
      method: 'adjustment',
      shares: [
        { userId: 'a', adjustment: 0 },
        { userId: 'b', adjustment: -1000 },
      ],
    });
    expect(split).toEqual([
      { userId: 'a', amount: 5500 },
      { userId: 'b', amount: 4500 },
    ]);
  });

  it('keeps an adjusted split adding up to the total, cent for cent', () => {
    const split = computeSplit(1000, {
      method: 'adjustment',
      shares: [
        { userId: 'a', adjustment: 1 },
        { userId: 'b', adjustment: 0 },
        { userId: 'c', adjustment: 0 },
      ],
    });
    expect(sum(split)).toBe(1000);
    expect(split.map((s) => s.amount)).toEqual([334, 333, 333]);
  });

  it('rejects adjustments bigger than the total or a discount bigger than a share', () => {
    expect(() =>
      computeSplit(1000, { method: 'adjustment', shares: [{ userId: 'a', adjustment: 1500 }, { userId: 'b', adjustment: 0 }] }),
    ).toThrow(expect.objectContaining({ code: 'ADJUSTMENTS_EXCEED_TOTAL' }));
    expect(() =>
      computeSplit(1000, { method: 'adjustment', shares: [{ userId: 'a', adjustment: -2000 }, { userId: 'b', adjustment: 0 }] }),
    ).toThrow(expect.objectContaining({ code: 'NEGATIVE_SHARE' }));
  });

  it('accepts an adjustment split in the expense schema', () => {
    const parsed = createExpenseSchema.safeParse({
      groupId: 'g',
      description: 'Dinner',
      amount: 9000,
      payerId: 'a',
      date: new Date().toISOString(),
      split: { method: 'adjustment', shares: [{ userId: 'a', adjustment: 1500 }, { userId: 'b', adjustment: -500 }] },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects bad input', () => {
    expect(() => computeSplit(0, { method: 'equal', participants: ['a'] })).toThrow(SplitError);
    expect(() => computeSplit(10.5, { method: 'equal', participants: ['a'] })).toThrow();
    expect(() => computeSplit(100, { method: 'equal', participants: [] })).toThrow(
      expect.objectContaining({ code: 'NO_PARTICIPANTS' }),
    );
    expect(() => computeSplit(100, { method: 'equal', participants: ['a', 'a'] })).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_PARTICIPANT' }),
    );
    expect(() =>
      computeSplit(100, { method: 'shares', shares: [{ userId: 'a', units: 0 }] }),
    ).toThrow(expect.objectContaining({ code: 'ZERO_UNITS' }));
  });

  it('always sums exactly to the total (randomized)', () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let i = 0; i < 2000; i++) {
      const total = 1 + rand(10_000_000);
      const people = Array.from({ length: 1 + rand(12) }, (_, k) => `u${k}`);
      const inputs: SplitInput[] = [
        { method: 'equal', participants: people },
        { method: 'shares', shares: people.map((userId) => ({ userId, units: 1 + rand(5) })) },
      ];
      // Items that use up a random part of the total, each shared by a random set of people.
      const items = Array.from({ length: 1 + rand(6) }, (_, k) => ({
        name: `item${k}`,
        amount: 1,
        userIds: people.filter((_, j) => j === k % people.length || rand(2) === 0),
      }));
      let room = total - items.length;
      if (room >= 0) {
        for (const item of items) {
          const more = rand(Math.floor(room / 2) + 1);
          item.amount += more;
          room -= more;
        }
        inputs.push({ method: 'items', items });
      }
      for (const input of inputs) {
        const split = computeSplit(total, input);
        expect(sum(split)).toBe(total);
        expect(split.every((s) => Number.isInteger(s.amount) && s.amount >= 0)).toBe(true);
      }
    }
  });
});

describe('computeBalances', () => {
  it('credits the payer and debits participants', () => {
    const balances = computeBalances([
      { payerId: 'a', amount: 9000, splits: computeSplit(9000, { method: 'equal', participants: ['a', 'b', 'c'] }) },
    ]);
    expect(Object.fromEntries(balances)).toEqual({ a: 6000, b: -3000, c: -3000 });
  });

  it('applies settlements without touching expenses', () => {
    const expenses = [
      { payerId: 'a', amount: 9000, splits: computeSplit(9000, { method: 'equal', participants: ['a', 'b', 'c'] }) },
    ];
    const balances = computeBalances(expenses, [{ fromUserId: 'b', toUserId: 'a', amount: 3000 }]);
    expect(Object.fromEntries(balances)).toEqual({ a: 3000, b: 0, c: -3000 });
  });

  it('includes members with no activity at zero', () => {
    expect(computeBalances([], [], ['a', 'b']).get('b')).toBe(0);
  });

  it('rejects an expense whose splits do not match its amount', () => {
    expect(() =>
      computeBalances([{ payerId: 'a', amount: 100, splits: [{ userId: 'b', amount: 99 }] }]),
    ).toThrow(LedgerError);
  });
});

describe('simplifyDebts', () => {
  it('produces transfers that zero out every balance', () => {
    const expenses = [
      { payerId: 'a', amount: 12000, splits: computeSplit(12000, { method: 'equal', participants: ['a', 'b', 'c', 'd'] }) },
      { payerId: 'b', amount: 4000, splits: computeSplit(4000, { method: 'equal', participants: ['c', 'd'] }) },
      { payerId: 'c', amount: 999, splits: computeSplit(999, { method: 'equal', participants: ['a', 'b', 'c'] }) },
    ];
    const balances = computeBalances(expenses);
    const transfers = simplifyDebts(balances);

    expect(transfers.length).toBeLessThanOrEqual(balances.size - 1);
    const after = computeBalances(
      expenses,
      transfers.map((t) => ({ fromUserId: t.fromUserId, toUserId: t.toUserId, amount: t.amount })),
    );
    for (const v of after.values()) expect(v).toBe(0);
  });

  it('returns nothing when everyone is settled', () => {
    expect(simplifyDebts(new Map([['a', 0], ['b', 0]]))).toEqual([]);
  });
});

describe('schemas', () => {
  it('validates a create-expense request', () => {
    const ok = createExpenseSchema.safeParse({
      groupId: 'g1',
      description: 'Dinner',
      amount: 12550,
      payerId: 'a',
      date: '2026-11-04T19:00:00Z',
      split: { method: 'equal', participants: ['a', 'b'] },
    });
    expect(ok.success).toBe(true);

    const floatAmount = createExpenseSchema.safeParse({
      groupId: 'g1',
      description: 'Dinner',
      amount: 125.5,
      payerId: 'a',
      date: '2026-11-04T19:00:00Z',
      split: { method: 'equal', participants: ['a'] },
    });
    expect(floatAmount.success).toBe(false);
  });
});

describe('pairBreakdown', () => {
  const expenses = [
    { payerId: 'me', amount: 9000, splits: computeSplit(9000, { method: 'equal', participants: ['me', 'sam', 'leo'] }) },
    { payerId: 'sam', amount: 4000, splits: computeSplit(4000, { method: 'equal', participants: ['me', 'sam'] }) },
    { payerId: 'leo', amount: 1200, splits: computeSplit(1200, { method: 'equal', participants: ['sam', 'leo'] }) },
  ];
  const settlements = [{ fromUserId: 'sam', toUserId: 'me', amount: 500 }];

  it('lists only items between the two people, with signed amounts', () => {
    const { entries, total } = pairBreakdown('me', 'sam', expenses, settlements);
    expect(entries).toEqual([
      { kind: 'expense', index: 0, amount: 3000 }, // I paid, Sam's share
      { kind: 'expense', index: 1, amount: -2000 }, // Sam paid, my share
      { kind: 'settlement', index: 0, amount: -500 }, // Sam paid me back
    ]);
    expect(total).toBe(500);
    // The Leo-paid expense didn't involve me, so it isn't listed.
    expect(pairBreakdown('me', 'leo', expenses, settlements).entries).toEqual([{ kind: 'expense', index: 0, amount: 3000 }]);
  });

  it('is antisymmetric: what Sam owes me is what I am owed by Sam', () => {
    expect(pairBreakdown('sam', 'me', expenses, settlements).total).toBe(-pairBreakdown('me', 'sam', expenses, settlements).total);
  });

  it('pairwise totals always add up to the group balance (randomized)', () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let round = 0; round < 300; round++) {
      const people = Array.from({ length: 2 + rand(5) }, (_, k) => `p${k}`);
      const ex = Array.from({ length: 1 + rand(8) }, () => {
        const amount = 1 + rand(50_000);
        const participants = people.filter(() => rand(2) === 0);
        const split = participants.length ? participants : [people[0]!];
        return { payerId: people[rand(people.length)]!, amount, splits: computeSplit(amount, { method: 'equal', participants: split }) };
      });
      const st = Array.from({ length: rand(4) }, () => {
        const from = people[rand(people.length)]!;
        const to = people.filter((p) => p !== from)[rand(people.length - 1)]!;
        return { fromUserId: from, toUserId: to, amount: 1 + rand(10_000) };
      });
      const balances = computeBalances(ex, st, people);
      for (const me of people) {
        const sum = people.filter((p) => p !== me).reduce((acc, other) => acc + pairBreakdown(me, other, ex, st).total, 0);
        expect(sum).toBe(balances.get(me));
      }
    }
  });
});

describe('PayID', () => {
  it('normalises Australian mobiles in any common format', () => {
    for (const input of ['0412 345 678', '0412345678', '+61 412 345 678', '61412345678', '(0412) 345-678']) {
      expect(normalisePayId('phone', input)).toEqual({ ok: true, value: '+61412345678' });
    }
    expect(normalisePayId('phone', '02 9876 5432').ok).toBe(false); // landline
    expect(normalisePayId('phone', '0412 345').ok).toBe(false);
    expect(formatPayId('phone', '+61412345678')).toBe('0412 345 678');
    expect(copyablePayId('phone', '+61412345678')).toBe('0412345678');
  });

  it('checks and lowercases emails', () => {
    expect(normalisePayId('email', '  Sam@Example.COM ')).toEqual({ ok: true, value: 'sam@example.com' });
    expect(normalisePayId('email', 'sam@').ok).toBe(false);
    expect(normalisePayId('email', 'not an email').ok).toBe(false);
  });

  it('validates ABNs with the official checksum', () => {
    expect(isValidAbn('51824753556')).toBe(true); // the ATO's published example
    expect(normalisePayId('abn', '51 824 753 556')).toEqual({ ok: true, value: '51824753556' });
    expect(normalisePayId('abn', '51 824 753 557')).toEqual({ ok: false, error: 'That ABN doesn’t look right. Check the digits.' });
    expect(normalisePayId('abn', '1234').ok).toBe(false);
    expect(formatPayId('abn', '51824753556')).toBe('51 824 753 556');
  });

  it('asks for a value when empty', () => {
    expect(normalisePayId('email', '   ')).toEqual({ ok: false, error: 'Enter your PayID.' });
  });
});
