import * as SQLite from 'expo-sqlite';

import { dueDates, nextDue, type Recurrence } from './recurring';
import {
  balances as calcBalances, convertCents, simplifyDebts, type Expense as CalcExpense,
  type Item, type Shares, type SplitType, type Transfer,
} from './split';

export type Group = { id: string; name: string; currency: string; created_at: string; archived: number };
export type Member = { id: string; group_id: string; name: string };
export type ExpenseRow = {
  id: string; group_id: string; title: string; amount_cents: number; currency: string; rate: number;
  group_cents: number; paid_by: string; category: string; note: string; date: string;
  split_type: SplitType; recurrence: Recurrence; next_due: string | null; is_settlement: number; created_at: string;
};
export type Receipt = { id: string; expense_id: string; uri: string; created_at: string };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function uid(): string {
  const r = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}${r()}${r()}`;
}

const SCHEMA_VERSION = 1;

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const v = row?.user_version ?? 0;
  if (v < 1) {
    await db.execAsync(`
      CREATE TABLE groups (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'ZAR',
        created_at TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE members (id TEXT PRIMARY KEY NOT NULL, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        name TEXT NOT NULL);
      CREATE TABLE expenses (id TEXT PRIMARY KEY NOT NULL, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        title TEXT NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, rate REAL NOT NULL DEFAULT 1,
        group_cents INTEGER NOT NULL, paid_by TEXT NOT NULL REFERENCES members(id), category TEXT NOT NULL DEFAULT 'general',
        note TEXT NOT NULL DEFAULT '', date TEXT NOT NULL, split_type TEXT NOT NULL DEFAULT 'equal',
        recurrence TEXT NOT NULL DEFAULT 'none', next_due TEXT, is_settlement INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL);
      CREATE TABLE expense_shares (expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL REFERENCES members(id), cents INTEGER NOT NULL, PRIMARY KEY (expense_id, member_id));
      CREATE TABLE expense_items (id TEXT PRIMARY KEY NOT NULL, expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        name TEXT NOT NULL, price_cents INTEGER NOT NULL, member_ids TEXT NOT NULL);
      CREATE TABLE receipts (id TEXT PRIMARY KEY NOT NULL, expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        uri TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX idx_expenses_group ON expenses(group_id, date);
      CREATE INDEX idx_members_group ON members(group_id);
      CREATE INDEX idx_receipts_expense ON receipts(expense_id);
    `);
  }
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('splitty.db').then(async (db) => {
      await migrate(db);
      return db;
    });
  }
  return dbPromise;
}

const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();

// ---- groups & members
export async function listGroups(includeArchived = false): Promise<(Group & { member_count: number; expense_count: number })[]> {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT g.*, (SELECT COUNT(*) FROM members m WHERE m.group_id = g.id) AS member_count,
            (SELECT COUNT(*) FROM expenses e WHERE e.group_id = g.id) AS expense_count
     FROM groups g WHERE (? = 1 OR g.archived = 0) ORDER BY g.created_at DESC`,
    [includeArchived ? 1 : 0],
  );
}

export async function createGroup(name: string, currency: string, memberNames: string[]): Promise<string> {
  const db = await getDb();
  const id = uid();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO groups (id, name, currency, created_at) VALUES (?,?,?,?)', [id, name.trim(), currency, nowIso()]);
    for (const n of memberNames.map((x) => x.trim()).filter(Boolean)) {
      await db.runAsync('INSERT INTO members (id, group_id, name) VALUES (?,?,?)', [uid(), id, n]);
    }
  });
  return id;
}

export async function getGroup(id: string): Promise<Group | null> {
  const db = await getDb();
  return db.getFirstAsync<Group>('SELECT * FROM groups WHERE id = ?', [id]);
}
export async function listMembers(groupId: string): Promise<Member[]> {
  const db = await getDb();
  return db.getAllAsync<Member>('SELECT * FROM members WHERE group_id = ? ORDER BY rowid', [groupId]);
}
export async function addMember(groupId: string, name: string): Promise<string> {
  const db = await getDb();
  const id = uid();
  await db.runAsync('INSERT INTO members (id, group_id, name) VALUES (?,?,?)', [id, groupId, name.trim()]);
  return id;
}
export async function renameGroup(id: string, name: string) {
  const db = await getDb();
  await db.runAsync('UPDATE groups SET name = ? WHERE id = ?', [name.trim(), id]);
}
export async function setArchived(id: string, archived: boolean) {
  const db = await getDb();
  await db.runAsync('UPDATE groups SET archived = ? WHERE id = ?', [archived ? 1 : 0, id]);
}
export async function deleteGroup(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM groups WHERE id = ?', [id]);
}

// ---- expenses
export type NewExpense = {
  groupId: string; title: string; amountCents: number; currency: string; rate: number; paidBy: string;
  category: string; note: string; date: string; splitType: SplitType; shares: Shares; // shares in group currency cents
  items?: Item[]; recurrence?: Recurrence; isSettlement?: boolean; receiptUris?: string[];
};

export async function saveExpense(e: NewExpense, editId?: string): Promise<string> {
  const db = await getDb();
  const id = editId ?? uid();
  const groupCents = e.currency === '' ? e.amountCents : Object.values(e.shares).reduce((a, b) => a + b, 0);
  const rec = e.recurrence ?? 'none';
  await db.withTransactionAsync(async () => {
    if (editId) {
      await db.runAsync('DELETE FROM expense_shares WHERE expense_id = ?', [id]);
      await db.runAsync('DELETE FROM expense_items WHERE expense_id = ?', [id]);
      await db.runAsync(
        `UPDATE expenses SET title=?, amount_cents=?, currency=?, rate=?, group_cents=?, paid_by=?, category=?, note=?, date=?,
         split_type=?, recurrence=?, next_due=?, is_settlement=? WHERE id=?`,
        [e.title.trim(), e.amountCents, e.currency, e.rate, groupCents, e.paidBy, e.category, e.note, e.date, e.splitType,
          rec, nextDue(e.date, rec), e.isSettlement ? 1 : 0, id],
      );
    } else {
      await db.runAsync(
        `INSERT INTO expenses (id, group_id, title, amount_cents, currency, rate, group_cents, paid_by, category, note, date,
         split_type, recurrence, next_due, is_settlement, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, e.groupId, e.title.trim(), e.amountCents, e.currency, e.rate, groupCents, e.paidBy, e.category, e.note, e.date,
          e.splitType, rec, nextDue(e.date, rec), e.isSettlement ? 1 : 0, nowIso()],
      );
    }
    for (const [memberId, cents] of Object.entries(e.shares)) {
      if (cents !== 0) await db.runAsync('INSERT INTO expense_shares (expense_id, member_id, cents) VALUES (?,?,?)', [id, memberId, cents]);
    }
    for (const it of e.items ?? []) {
      await db.runAsync('INSERT INTO expense_items (id, expense_id, name, price_cents, member_ids) VALUES (?,?,?,?,?)',
        [uid(), id, it.name, it.priceCents, JSON.stringify(it.memberIds)]);
    }
    for (const uri of e.receiptUris ?? []) {
      await db.runAsync('INSERT INTO receipts (id, expense_id, uri, created_at) VALUES (?,?,?,?)', [uid(), id, uri, nowIso()]);
    }
  });
  return id;
}

export async function listExpenses(groupId: string): Promise<ExpenseRow[]> {
  const db = await getDb();
  return db.getAllAsync<ExpenseRow>('SELECT * FROM expenses WHERE group_id = ? ORDER BY date DESC, created_at DESC', [groupId]);
}
export async function getExpense(id: string) {
  const db = await getDb();
  const row = await db.getFirstAsync<ExpenseRow>('SELECT * FROM expenses WHERE id = ?', [id]);
  if (!row) return null;
  const shares = await db.getAllAsync<{ member_id: string; cents: number }>('SELECT member_id, cents FROM expense_shares WHERE expense_id = ?', [id]);
  const items = await db.getAllAsync<{ name: string; price_cents: number; member_ids: string }>('SELECT * FROM expense_items WHERE expense_id = ?', [id]);
  const receipts = await listReceipts(id);
  return {
    row,
    shares: Object.fromEntries(shares.map((s) => [s.member_id, s.cents])) as Shares,
    items: items.map((i) => ({ name: i.name, priceCents: i.price_cents, memberIds: JSON.parse(i.member_ids) as string[] })),
    receipts,
  };
}
export async function deleteExpense(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
}

// ---- receipts
export async function listReceipts(expenseId: string): Promise<Receipt[]> {
  const db = await getDb();
  return db.getAllAsync<Receipt>('SELECT * FROM receipts WHERE expense_id = ? ORDER BY created_at', [expenseId]);
}
export async function addReceipt(expenseId: string, uri: string) {
  const db = await getDb();
  await db.runAsync('INSERT INTO receipts (id, expense_id, uri, created_at) VALUES (?,?,?,?)', [uid(), expenseId, uri, nowIso()]);
}
export async function removeReceipt(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM receipts WHERE id = ?', [id]);
}

// ---- balances
export async function groupBalances(groupId: string): Promise<{ net: Shares; transfers: Transfer[]; members: Member[] }> {
  const db = await getDb();
  const members = await listMembers(groupId);
  const exps = await listExpenses(groupId);
  const shareRows = await db.getAllAsync<{ expense_id: string; member_id: string; cents: number }>(
    'SELECT s.expense_id, s.member_id, s.cents FROM expense_shares s JOIN expenses e ON e.id = s.expense_id WHERE e.group_id = ?', [groupId]);
  const byExp = new Map<string, Shares>();
  for (const r of shareRows) {
    const m = byExp.get(r.expense_id) ?? {};
    m[r.member_id] = r.cents;
    byExp.set(r.expense_id, m);
  }
  const calc: CalcExpense[] = exps.map((e) => ({ id: e.id, paidBy: e.paid_by, amountCents: e.group_cents, shares: byExp.get(e.id) ?? {} }));
  const net = calcBalances(members.map((m) => m.id), calc);
  return { net, transfers: simplifyDebts(net), members };
}

/** Create overdue occurrences of recurring expenses. Call on app open. Returns how many were created. */
export async function runRecurring(): Promise<number> {
  const db = await getDb();
  const due = await db.getAllAsync<ExpenseRow>(
    `SELECT * FROM expenses WHERE recurrence != 'none' AND next_due IS NOT NULL AND next_due <= ?`, [today()]);
  let created = 0;
  for (const e of due) {
    const dates = dueDates(e.next_due as string, e.recurrence, today());
    const full = await getExpense(e.id);
    if (!full) continue;
    for (const d of dates) {
      await saveExpense({
        groupId: e.group_id, title: e.title, amountCents: e.amount_cents, currency: e.currency, rate: e.rate, paidBy: e.paid_by,
        category: e.category, note: e.note, date: d, splitType: e.split_type, shares: full.shares, items: full.items, recurrence: 'none',
      });
      created++;
    }
    const last = dates[dates.length - 1];
    await db.runAsync('UPDATE expenses SET next_due = ? WHERE id = ?', [nextDue(last, e.recurrence), e.id]);
  }
  return created;
}

export function toGroupCents(amountCents: number, rate: number) {
  return convertCents(amountCents, rate);
}
