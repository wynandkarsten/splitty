import {
  balances, convertCents, distribute, formatMoney, parseMoney, simplifyDebts,
  splitEqual, splitExact, splitItemised, splitPercent, splitShares,
} from '../src/lib/split';
import { dueDates, nextDue } from '../src/lib/recurring';

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe('split maths', () => {
  test('equal split always sums to total (100 cents / 3)', () => {
    const s = splitEqual(100, ['a', 'b', 'c']);
    expect(sum(s)).toBe(100);
    expect(Object.values(s).sort()).toEqual([33, 33, 34]);
  });
  test('equal split with one person', () => {
    expect(splitEqual(999, ['a'])).toEqual({ a: 999 });
  });
  test('negative totals (refunds) distribute with sign', () => {
    const s = splitEqual(-100, ['a', 'b', 'c']);
    expect(sum(s)).toBe(-100);
  });
  test('shares are weighted', () => {
    expect(splitShares(1000, { a: 1, b: 3 })).toEqual({ a: 250, b: 750 });
  });
  test('zero weight members owe nothing', () => {
    expect(distribute(500, { a: 0, b: 1 })).toEqual({ a: 0, b: 500 });
  });
  test('percent split', () => {
    expect(splitPercent(1000, { a: 50, b: 30, c: 20 })).toEqual({ a: 500, b: 300, c: 200 });
  });
  test('percent split rejects bad totals', () => {
    expect(() => splitPercent(1000, { a: 50, b: 40 })).toThrow(/90/);
  });
  test('percent with thirds still sums', () => {
    const s = splitPercent(100, { a: 33.33, b: 33.33, c: 33.34 });
    expect(sum(s)).toBe(100);
  });
  test('exact split validates sum', () => {
    expect(splitExact(1000, { a: 400, b: 600 })).toEqual({ a: 400, b: 600 });
    expect(() => splitExact(1000, { a: 400, b: 500 })).toThrow();
  });
  test('itemised with shared item and proportional tip', () => {
    const r = splitItemised(
      [
        { name: 'pizza', priceCents: 10000, memberIds: ['a'] },
        { name: 'wine', priceCents: 10000, memberIds: ['a', 'b'] },
      ],
      3000,
      ['a', 'b'],
    );
    expect(r.total).toBe(23000);
    expect(sum(r.shares)).toBe(23000);
    expect(r.shares.a).toBeGreaterThan(r.shares.b);
    expect(r.shares.b).toBe(5000 + 750); // 5000 wine + 5000/20000 of 3000 tip
  });
  test('item with no members goes to everyone', () => {
    const r = splitItemised([{ name: 'x', priceCents: 300, memberIds: [] }], 0, ['a', 'b', 'c']);
    expect(r.shares).toEqual({ a: 100, b: 100, c: 100 });
  });
});

describe('balances and debts', () => {
  const members = ['a', 'b', 'c'];
  test('balances sum to zero', () => {
    const net = balances(members, [
      { id: '1', paidBy: 'a', amountCents: 3000, shares: splitEqual(3000, members) },
      { id: '2', paidBy: 'b', amountCents: 1500, shares: splitEqual(1500, members) },
    ]);
    expect(sum(net)).toBe(0);
    expect(net.a).toBe(3000 - 1000 - 500);
  });
  test('simplify settles everyone to zero with <= n-1 transfers', () => {
    const net = { a: 5000, b: -2000, c: -3000, d: 0 };
    const t = simplifyDebts(net);
    expect(t.length).toBeLessThanOrEqual(2);
    const after = { ...net };
    for (const x of t) { after[x.from as 'a'] += x.cents; after[x.to as 'a'] -= x.cents; }
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });
  test('simplify chain a->b->c collapses', () => {
    // a owes b 10, b owes c 10  => net a -10, b 0, c +10 => single transfer a->c
    expect(simplifyDebts({ a: -1000, b: 0, c: 1000 })).toEqual([{ from: 'a', to: 'c', cents: 1000 }]);
  });
  test('nothing owed means no transfers', () => {
    expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]);
  });
  test('settlement payment cancels debt', () => {
    const e = [
      { id: '1', paidBy: 'a', amountCents: 2000, shares: splitEqual(2000, ['a', 'b']) },
      { id: '2', paidBy: 'b', amountCents: 1000, shares: { a: 1000 } }, // b pays a back 10
    ];
    expect(balances(['a', 'b'], e)).toEqual({ a: 0, b: 0 });
  });
});

describe('money helpers', () => {
  test('parseMoney variants', () => {
    expect(parseMoney('12.50')).toBe(1250);
    expect(parseMoney('12,5')).toBe(1250);
    expect(parseMoney('R 1 200,00')).toBe(120000);
    expect(parseMoney('1,234.56')).toBe(123456);
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('123.45.')).toBe(12345);
    expect(parseMoney('12,5,')).toBe(1250);
    expect(parseMoney('7.')).toBe(700);
    expect(parseMoney('.')).toBeNull();
  });
  test('formatMoney', () => {
    expect(formatMoney(123456)).toBe('R1 234.56');
    expect(formatMoney(-5, 'USD')).toBe('-$0.05');
    expect(formatMoney(100, 'CHF')).toBe('CHF 1.00');
  });
  test('convertCents', () => {
    expect(convertCents(1000, 18.5)).toBe(18500);
  });
});

describe('recurring', () => {
  test('monthly clamps to month end', () => {
    expect(nextDue('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(nextDue('2028-01-31', 'monthly')).toBe('2028-02-29');
  });
  test('weekly and yearly', () => {
    expect(nextDue('2026-12-28', 'weekly')).toBe('2027-01-04');
    expect(nextDue('2026-05-10', 'yearly')).toBe('2027-05-10');
    expect(nextDue('2026-05-10', 'none')).toBeNull();
  });
  test('dueDates catches up', () => {
    expect(dueDates('2026-09-01', 'monthly', '2026-11-18')).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
    expect(dueDates('2027-01-01', 'monthly', '2026-11-18')).toEqual([]);
  });
});
