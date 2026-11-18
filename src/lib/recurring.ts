export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Next due date (ISO yyyy-mm-dd) after `from`. Monthly clamps to month length (31 Jan -> 28/29 Feb). */
export function nextDue(from: string, rec: Recurrence): string | null {
  if (rec === 'none') return null;
  const [y, m, d] = from.split('-').map(Number);
  if (rec === 'daily' || rec === 'weekly') {
    const dt = new Date(Date.UTC(y, m - 1, d + (rec === 'daily' ? 1 : 7)));
    return dt.toISOString().slice(0, 10);
  }
  const addMonths = rec === 'monthly' ? 1 : 12;
  const total = m - 1 + addMonths;
  const ny = y + Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, last);
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

/** All due dates up to and including `today`, starting at `start` (inclusive). Capped to avoid runaway loops. */
export function dueDates(start: string, rec: Recurrence, today: string, cap = 120): string[] {
  const out: string[] = [];
  let cur: string | null = start;
  while (cur && cur <= today && out.length < cap) {
    out.push(cur);
    cur = nextDue(cur, rec);
  }
  return out;
}
