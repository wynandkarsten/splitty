/** Pure split maths. All money is integer cents; no floats leak into balances. */

export type SplitType = 'equal' | 'exact' | 'percent' | 'shares' | 'itemised';

export type Shares = Record<string, number>; // memberId -> cents owed

/** Distribute `total` across weights using largest-remainder so the parts always sum to total. */
export function distribute(total: number, weights: Record<string, number>): Shares {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0);
  const out: Shares = {};
  for (const id of Object.keys(weights)) out[id] = 0;
  const sum = ids.reduce((a, id) => a + weights[id], 0);
  if (ids.length === 0 || sum <= 0) return out;
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  let assigned = 0;
  const rems: { id: string; rem: number }[] = [];
  for (const id of ids) {
    const exact = (abs * weights[id]) / sum;
    const floor = Math.floor(exact);
    out[id] = floor;
    assigned += floor;
    rems.push({ id, rem: exact - floor });
  }
  rems.sort((a, b) => b.rem - a.rem || (a.id < b.id ? -1 : 1));
  for (let i = 0; i < abs - assigned; i++) out[rems[i % rems.length].id] += 1;
  for (const id of ids) out[id] *= sign;
  return out;
}

export function splitEqual(total: number, memberIds: string[]): Shares {
  const w: Record<string, number> = {};
  for (const id of memberIds) w[id] = 1;
  return distribute(total, w);
}

export function splitShares(total: number, shares: Record<string, number>): Shares {
  return distribute(total, shares);
}

/** percents are plain numbers (e.g. 33.3); must sum to 100 within 0.01. */
export function splitPercent(total: number, percents: Record<string, number>): Shares {
  const sum = Object.values(percents).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.01) throw new Error(`Percentages add up to ${round2(sum)}, not 100`);
  const w: Record<string, number> = {};
  for (const [id, p] of Object.entries(percents)) w[id] = Math.round(p * 100);
  return distribute(total, w);
}

export function splitExact(total: number, amounts: Shares): Shares {
  const sum = Object.values(amounts).reduce((a, b) => a + b, 0);
  if (sum !== total) throw new Error(`Amounts add up to ${sum} cents, expected ${total}`);
  return { ...amounts };
}

export type Item = { name: string; priceCents: number; memberIds: string[] };

/** Each item is split equally among its members; tax and tip are spread in proportion to each member's subtotal. */
export function splitItemised(
  items: Item[],
  extrasCents: number,
  allMemberIds: string[],
): { shares: Shares; total: number } {
  const sub: Shares = {};
  for (const id of allMemberIds) sub[id] = 0;
  for (const it of items) {
    const ids = it.memberIds.length ? it.memberIds : allMemberIds;
    const part = splitEqual(it.priceCents, ids);
    for (const id of ids) sub[id] = (sub[id] ?? 0) + part[id];
  }
  const subtotal = Object.values(sub).reduce((a, b) => a + b, 0);
  const extra = extrasCents ? distribute(extrasCents, sub) : {};
  const shares: Shares = {};
  for (const id of Object.keys(sub)) shares[id] = sub[id] + (extra[id] ?? 0);
  return { shares, total: subtotal + extrasCents };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type Expense = {
  id: string;
  paidBy: string;
  amountCents: number; // in group currency (already converted)
  shares: Shares; // memberId -> cents owed, sums to amountCents
};

/** Net balance per member: positive = is owed money, negative = owes money. */
export function balances(memberIds: string[], expenses: Expense[]): Shares {
  const net: Shares = {};
  for (const id of memberIds) net[id] = 0;
  for (const e of expenses) {
    net[e.paidBy] = (net[e.paidBy] ?? 0) + e.amountCents;
    for (const [id, owed] of Object.entries(e.shares)) net[id] = (net[id] ?? 0) - owed;
  }
  return net;
}

export type Transfer = { from: string; to: string; cents: number };

/** Greedy debt simplification: at most (n-1) transfers, biggest debtor pays biggest creditor. */
export function simplifyDebts(net: Shares): Transfer[] {
  const debtors = Object.entries(net).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const creditors = Object.entries(net).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const out: Transfer[] = [];
  const byAmt = (a: { v: number; id: string }, b: { v: number; id: string }) => b.v - a.v || (a.id < b.id ? -1 : 1);
  while (debtors.length && creditors.length) {
    debtors.sort(byAmt);
    creditors.sort(byAmt);
    const d = debtors[0];
    const c = creditors[0];
    const amt = Math.min(d.v, c.v);
    out.push({ from: d.id, to: c.id, cents: amt });
    d.v -= amt;
    c.v -= amt;
    if (d.v === 0) debtors.shift();
    if (c.v === 0) creditors.shift();
  }
  return out;
}

/** Convert an amount in a foreign currency to group currency cents using rate (1 foreign = rate group). */
export function convertCents(cents: number, rate: number): number {
  return Math.round(cents * rate);
}

/** Parse "12.50", "12,5", "R 1 200,00" into cents. Returns null if invalid. */
export function parseMoney(input: string): number | null {
  let s = input.replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const decimalAt = Math.max(lastComma, lastDot);
  if (decimalAt >= 0 && s.length - decimalAt - 1 <= 2) {
    s = s.slice(0, decimalAt).replace(/[.,]/g, '') + '.' + s.slice(decimalAt + 1);
  } else {
    s = s.replace(/[.,]/g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function formatMoney(cents: number, currency = 'ZAR'): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const frac = (abs % 100).toString().padStart(2, '0');
  const sym: Record<string, string> = { ZAR: 'R', USD: '$', EUR: '€', GBP: '£' };
  const prefix = sym[currency] ?? currency + ' ';
  return `${sign}${prefix}${whole}.${frac}`;
}
