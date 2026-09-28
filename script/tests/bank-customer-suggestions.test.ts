import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { registerBankReview } from '../../server/bank-review';

const db: any = new DatabaseSync(':memory:');
db.transaction = (fn: any) => () => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
db.exec(`CREATE TABLE customers(id INTEGER PRIMARY KEY,role TEXT,business_name TEXT);
 INSERT INTO customers VALUES(1,'customer','Cafe A'),(2,'customer','Cafe B'),(3,'customer','Cafe C');
 CREATE TABLE expenses(id INTEGER PRIMARY KEY,amount INTEGER,expense_date TEXT,category TEXT,memo TEXT,sector TEXT,created_at INTEGER);
 CREATE TABLE payments(id INTEGER PRIMARY KEY,amount INTEGER,paid_at TEXT,customer_id INTEGER,memo TEXT,method TEXT,created_at INTEGER);
 CREATE TABLE fixed_cost_items(id INTEGER,name TEXT,sector TEXT,cost_type TEXT,active INTEGER,sort_order INTEGER);`);
const app = express(); app.use(express.json());
app.use((req: any, _res, next) => { req.session = { userId: 1 }; next(); });
registerBankReview(app, db, (req, res, next) => req.headers.role === 'owner' ? next() : res.sendStatus(403));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/api/admin`;
const originalFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init: any) => {
  assert(String(input).startsWith(base), 'External calls are forbidden in this test');
  return originalFetch(input, init);
}) as typeof fetch;
const call = async (path: string, body?: any, role = 'owner') => {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', role }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json().catch(() => null) };
};
const add = (id: number, remark: string, options: { env?: string; account?: string; deposit?: number; withdraw?: number; state?: string; target?: number } = {}) => {
  db.prepare(`INSERT INTO bank_review(id,environment,account,ref,at,deposit,withdraw,remark,currency,state,target_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id, options.env ?? 'production', options.account ?? '100001092', 'fixture-' + id,
    '20260928100000', options.deposit ?? id * 100, options.withdraw ?? 0, remark, 'KRW', options.state ?? 'pending', options.target ?? null);
};
const post = async (id: number, customerId = 1, env = 'bank-live') => {
  const r = await call(`/${env}/${id}/posting`, { kind: 'payment', customerId, memo: '', confirmProduction: true });
  assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data.id;
};
const rows = async (env = 'bank-live') => { const r = await call('/' + env); assert.equal(r.status, 200); return r.data.rows as any[]; };
const hint = (list: any[], id: number) => list.find(r => r.id === id)?.customerSuggestion;
try {
  add(1, '김예시'); add(2, '김예시');
  assert.equal(hint(await rows(), 2), null);
  const first = await post(1);
  const before = db.prepare('SELECT total_changes() AS n').get().n;
  let list = await rows();
  assert.deepEqual(hint(list, 2), { kind: 'customer', customerId: 1, name: 'Cafe A', count: 1 });
  assert.equal(hint(list, 1), null);
  assert.equal(list.find(r => r.id === 2).state, 'pending');
  assert.equal(list.find(r => r.id === 2).targetId, null);
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n, before, 'Suggestion reads must never write');
  assert.equal(db.prepare('SELECT count(*) AS n FROM payments').get().n, 1);
  assert(!JSON.stringify(list).includes('100001092'), 'Raw receiving account must stay private');

  add(3, '김예시'); const second = await post(3);
  assert.equal(hint(await rows(), 2).count, 2);
  assert.equal((await call(`/bank-live/3/posting/${second}/cancel`, { reason: 'fixture cancellation' })).status, 200);
  assert.equal(hint(await rows(), 2).count, 1);
  assert.equal((await call(`/bank-live/1/posting/${first}/cancel`, { reason: 'fixture cancellation' })).status, 200);
  assert.equal(hint(await rows(), 2), null, 'Cancelled postings do not teach');
  await post(1, 2);
  assert.equal(hint(await rows(), 2).customerId, 2, 'Corrected active posting replaces cancelled evidence');

  await post(3, 1);
  assert.deepEqual(hint(await rows(), 2), { kind: 'ambiguous' }, 'Same payer for two customers must not preselect');
  add(4, '단일입금자'); await post(4);
  add(5, '단일입금자'); add(6, '단일입금자', { state: 'settlement' });
  assert.deepEqual(hint(await rows(), 5), { kind: 'ambiguous' });
  db.prepare("UPDATE bank_review SET state='pending' WHERE id=6").run();
  assert.equal(hint(await rows(), 5).customerId, 1);
  db.prepare("UPDATE bank_review SET state='payment' WHERE id=6").run();
  assert.deepEqual(hint(await rows(), 5), { kind: 'ambiguous' }, 'Existing-record links require manual confirmation');

  add(10, '홍길동'); await post(10);
  add(11, '홍길동', { account: '200001092' });
  add(12, '홍 길동'); add(13, '홍길동(카페)'); add(14, ' 홍길동 ');
  add(15, '홍길동'.normalize('NFD'));
  add(16, '홍길동', { withdraw: 1 });
  add(17, '홍길동', { deposit: 0, withdraw: 100 });
  add(18, '홍길동', { state: 'customer', target: 2 });
  add(19, '홍길동', { deposit: 0 });
  list = await rows();
  for (const id of [11, 12, 13, 16, 17, 18, 19]) assert.equal(hint(list, id), null, `Ineligible/unequal row ${id}`);
  for (const id of [14, 15]) assert.equal(hint(list, id).customerId, 1);
  assert.equal(list.find(r => r.id === 18).targetId, 2, 'Explicit customer selection stays authoritative');

  add(20, '홍길동', { env: 'test' }); add(21, '홍길동', { env: 'test' });
  assert.equal(hint(await rows('bank-review'), 21), null);
  await post(20, 2, 'bank-review');
  assert.equal(hint(await rows('bank-review'), 21).customerId, 2);
  assert.equal(hint(await rows(), 14).customerId, 1, 'Production never learns from test');

  add(30, ''); add(31, ' '); await post(30); assert.equal(hint(await rows(), 31), null);
  add(32, '동일명칭'); await post(32, 3); add(33, '동일명칭');
  db.prepare("UPDATE customers SET role='staff' WHERE id=3").run();
  assert.equal(hint(await rows(), 33), null, 'Non-customer account must not be recommended');
  db.prepare('DELETE FROM customers WHERE id=3').run();
  assert.equal(hint(await rows(), 33), null, 'Deleted customer must not be recommended');
  db.prepare("UPDATE customers SET business_name='Cafe A renamed' WHERE id=1").run();
  assert.equal(hint(await rows(), 14).name, 'Cafe A renamed');
  for (const role of ['staff', 'manager', 'customer']) {
    assert.equal((await call('/bank-live', undefined, role)).status, 403);
    assert.equal((await call('/bank-review', undefined, role)).status, 403);
  }
  console.log('PASS customer suggestions: successful posting only, repeat count, cancellation/correction, ambiguity, receiving account and environment isolation, exact names, eligibility, role/deletion, no writes, masked accounts and owner access');
} finally { globalThis.fetch = originalFetch; server.close(); db.close(); }
