import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { registerBankReview } from '../../server/bank-review';

const db: any = new DatabaseSync(':memory:');
db.transaction = (fn: any) => () => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
db.exec(`CREATE TABLE customers(id INTEGER PRIMARY KEY,role TEXT,business_name TEXT);
 INSERT INTO customers VALUES(1,'customer','Cafe A'),(2,'customer','Cafe B');
 CREATE TABLE expenses(id INTEGER PRIMARY KEY,amount INTEGER,expense_date TEXT,category TEXT,memo TEXT,sector TEXT,created_at INTEGER);
 CREATE TABLE payments(id INTEGER PRIMARY KEY,amount INTEGER,paid_at TEXT,customer_id INTEGER,memo TEXT,method TEXT,created_at INTEGER);
 CREATE TABLE fixed_cost_items(id INTEGER,name TEXT,sector TEXT,cost_type TEXT,active INTEGER,sort_order INTEGER);`);
const app = express(); app.use(express.json()); app.use((req: any, _res, next) => { req.session = { userId: 77 }; next(); });
registerBankReview(app, db, (req, res, next) => req.headers.role === 'owner' ? next() : res.sendStatus(403));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/api/admin`;
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init: any) => {
  assert(String(input).startsWith(base), 'No external services in tests'); return realFetch(input, init);
}) as typeof fetch;
const call = async (path: string, body: any, role = 'owner') => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', role }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const add = (id: number, remark = 'Payer A', amount = id * 137, env = 'production', at = '20260929120000') => db.prepare(
  "INSERT INTO bank_review(id,environment,account,ref,at,deposit,withdraw,remark,currency,state) VALUES(?,?,'123456789',?,?,?,0,?,'KRW','pending')"
).run(id, env, 'fixture-' + id, at, amount, remark);
const single = async (id: number, customerId = 1, env = 'bank-live') => {
  const r = await call(`/${env}/${id}/posting`, { kind: 'payment', customerId, memo: '', confirmProduction: true });
  assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data.id;
};
const preview = async (ids: number[], env = 'bank-live') => {
  const r = await call(`/${env}/payments/preview`, { ids }); assert.equal(r.status, 200); return r.data.rows as any[];
};
const payload = (rows: any[]) => ({ items: rows.map(({ id, customerId, snapshot }) => ({ id, customerId, snapshot })), confirmProduction: true });
const bulk = async (rows: any[], env = 'bank-live') => {
  const r = await call(`/${env}/payments/bulk`, payload(rows)); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data.results as any[];
};
const count = () => db.prepare('SELECT count(*) AS n FROM payments').get().n;
try {
  add(1001, 'Payer A', 11, 'production', '20260901120000'); await single(1001);
  add(1002, 'Payer B', 12, 'production', '20260901120000'); await single(1002, 2);
  add(1003, 'Ambiguous', 13, 'production', '20260901120000'); await single(1003);
  add(1004, 'Ambiguous', 14, 'production', '20260901120000'); await single(1004, 2);
  add(1); add(2, 'Payer B'); add(3, 'Ambiguous'); add(4); add(5, 'Payer A', 5000); add(6, 'Payer A', 5000);
  db.prepare("INSERT INTO payments(amount,paid_at,customer_id,memo,method,created_at) VALUES(?,'2026-09-29',1,'manual','transfer',1)").run(4 * 137);
  let before = db.prepare('SELECT total_changes() AS n').get().n;
  const list = await preview([1, 2, 3, 4, 5, 6, 999]);
  assert.deepEqual(list.map(r => r.status), ['ready', 'ready', 'review', 'review', 'review', 'review', 'review']);
  assert(!JSON.stringify(list).includes('123456789')); assert.equal(db.prepare('SELECT total_changes() AS n').get().n, before);
  const ready = list.slice(0, 2), initial = count();
  assert.equal((await call('/bank-live/payments/bulk', { ...payload(ready), confirmProduction: false })).status, 409);
  for (const role of ['staff', 'manager', 'customer']) {
    assert.equal((await call('/bank-live/payments/preview', { ids: [1] }, role)).status, 403);
    assert.equal((await call('/bank-live/payments/bulk', payload(ready), role)).status, 403);
  }
  for (const ids of [[], [1, 1], Array.from({ length: 101 }, (_, i) => i + 1)]) assert.equal((await call('/bank-live/payments/preview', { ids })).status, 400);
  assert.equal((await call('/bank-live/payments/bulk', payload([ready[0], ready[0]]))).status, 400);
  assert.equal(count(), initial);
  assert.deepEqual((await bulk(ready)).map(r => r.status), ['posted', 'posted']);
  assert.equal(count(), initial + 2);
  assert.deepEqual((await bulk(ready)).map(r => r.status), ['already', 'already']);
  assert.equal(count(), initial + 2, 'Retried batch must not create another payment');
  const ledger = db.prepare("SELECT p.* FROM payments p JOIN bank_live_postings b ON b.ledger_id=p.id WHERE b.bank_id=1").get();
  assert.equal(ledger.amount, 137); assert.equal(ledger.customer_id, 1);

  add(7); add(8); add(9);
  const stale = await preview([7, 8, 9]);
  db.exec("UPDATE bank_review SET state='settlement' WHERE id=7; UPDATE bank_review SET memo='changed' WHERE id=8;");
  db.prepare("INSERT INTO payments(amount,paid_at,customer_id,memo,method,created_at) VALUES(?,'2026-09-29',1,'late manual','transfer',1)").run(9 * 137);
  before = count(); assert((await bulk(stale)).every(r => r.status === 'review')); assert.equal(count(), before);
  db.exec("UPDATE bank_review SET state='pending' WHERE id=7");

  add(10); add(11);
  const partial = await preview([10, 11]);
  assert(partial.every(r => r.status === 'ready'));
  db.exec("CREATE TRIGGER fixture_failure BEFORE INSERT ON bank_live_audit WHEN NEW.bank_id=10 BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  assert.deepEqual((await bulk(partial)).map(r => r.status), ['review', 'posted']);
  assert.equal(db.prepare('SELECT state FROM bank_review WHERE id=10').get().state, 'pending');
  assert.equal(db.prepare('SELECT count(*) AS n FROM bank_live_postings WHERE bank_id=10').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM payments WHERE amount=?').get(10 * 137).n, 0, 'Failed row must roll back its ledger write');
  db.exec('DROP TRIGGER fixture_failure');
  assert.deepEqual((await bulk(partial)).map(r => r.status), ['posted', 'already']);

  add(12); const changedAmount = await preview([12]); db.exec('UPDATE bank_review SET deposit=999999 WHERE id=12');
  assert.equal((await bulk(changedAmount))[0].status, 'review');
  add(13); const tampered = await preview([13]); tampered[0].customerId = 2;
  assert.equal((await bulk(tampered))[0].status, 'review');
  add(14); const racing = await preview([14]); await single(14);
  assert.equal((await bulk(racing))[0].status, 'already');
  add(15); const racingOther = await preview([15]); await single(15, 2);
  assert.equal((await bulk(racingOther))[0].status, 'review');
  add(16, 'Payer B'); const cancellation = await preview([16]);
  const b = db.prepare('SELECT id FROM bank_live_postings WHERE bank_id=1002').get().id;
  assert.equal((await call(`/bank-live/1002/posting/${b}/cancel`, { reason: 'fixture cancellation' })).status, 200);
  // Payer B still has row 2 as evidence; removing that last evidence must invalidate the preview.
  const b2 = db.prepare('SELECT id FROM bank_live_postings WHERE bank_id=2').get().id;
  await call(`/bank-live/2/posting/${b2}/cancel`, { reason: 'fixture cancellation' });
  assert.equal((await bulk(cancellation))[0].status, 'review');

  add(2001, 'Test payer', 1, 'test', '20260901120000'); await single(2001, 1, 'bank-review');
  add(2002, 'Test payer', 2, 'test');
  assert.equal((await preview([2002]))[0].status, 'review', 'Other environment must not be readable');
  const test = await preview([2002], 'bank-review'); before = count();
  assert.equal((await bulk(test, 'bank-review'))[0].status, 'posted'); assert.equal(count(), before, 'Test never writes production payments');
  assert.equal(db.prepare('SELECT count(*) AS n FROM bank_test_audit WHERE actor=77').get().n, 2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM bank_live_audit WHERE bank_id=11 AND actor=77').get().n, 1);
  console.log('PASS bulk receipts: preview-only, authorization, exact selection, duplicate groups, current ledger guard, snapshot changes, partial rollback, retry, individual race, cancellation, audit and isolated test environment');
} finally { globalThis.fetch = realFetch; server.close(); db.close(); }
