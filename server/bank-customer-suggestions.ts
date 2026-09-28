import type Database from 'better-sqlite3';
import type { BankEnvironment } from './bank-connection';
import type { BankCustomerSuggestion } from '../shared/bank-customer-suggestion';

type History = {
  id: number; account: string; remark: string; deposit: number; withdraw: number;
  state: string; targetId: number | null; postingId: number | null;
  postingKind: string | null; customerId: number | null;
  customerName: string | null; customerRole: string | null;
};

// Keep punctuation, case and inner spaces: similar names are not the same payer.
const keyOf = (row: History) => {
  const remark = row.remark.normalize('NFC').trim();
  return remark ? JSON.stringify([row.account, remark]) : null;
};

export function bankCustomerSuggestions(db: Database.Database, environment: BankEnvironment) {
  const table = environment === 'production' ? 'bank_live_postings' : 'bank_test_postings';
  const rows = db.prepare(`SELECT b.id,b.account,b.remark,b.deposit,b.withdraw,b.state,
    b.target_id AS targetId,p.id AS postingId,p.kind AS postingKind,
    p.customer_id AS customerId,c.business_name AS customerName,c.role AS customerRole
    FROM bank_review b
    LEFT JOIN ${table} p ON p.bank_id=b.id AND p.cancelled_at IS NULL
    LEFT JOIN customers c ON c.id=p.customer_id
    WHERE b.environment=? AND b.deposit>0 AND b.withdraw=0`).all(environment) as History[];
  const groups = new Map<string, { customers: Map<number, { name: string; count: number }>; blocked: boolean }>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const group = groups.get(key) ?? { customers: new Map(), blocked: false };
    groups.set(key, group);
    if (row.postingId !== null) {
      if (row.postingKind === 'payment' && row.customerId && row.customerRole === 'customer' &&
          row.customerName && row.state === 'customer' && row.targetId === row.customerId) {
        const previous = group.customers.get(row.customerId);
        group.customers.set(row.customerId, { name: row.customerName, count: (previous?.count ?? 0) + 1 });
      } else group.blocked = true;
    } else if (!['pending', 'customer'].includes(row.state)) {
      // A settlement/transfer or an existing-record link may represent a different use.
      group.blocked = true;
    }
  }
  const suggestions = new Map<number, BankCustomerSuggestion>();
  for (const row of rows) {
    if (row.state !== 'pending' || row.postingId !== null) continue;
    const key = keyOf(row), group = key ? groups.get(key) : undefined;
    if (!group?.customers.size) continue;
    if (group.blocked || group.customers.size !== 1) {
      suggestions.set(row.id, { kind: 'ambiguous' });
    } else {
      const [customerId, history] = Array.from(group.customers)[0];
      suggestions.set(row.id, { kind: 'customer', customerId, ...history });
    }
  }
  return suggestions;
}
