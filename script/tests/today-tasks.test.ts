import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readTodayTasks } from '../../server/today-tasks';
import { registerAdminOperations } from '../../server/admin-operations';
import { needsDepositReview, todayTaskHref } from '../../shared/today-tasks';

const db: any = new DatabaseSync(':memory:');
const now = Date.parse('2026-09-27T02:00:00Z');
db.exec(`
CREATE TABLE orders(id INTEGER PRIMARY KEY,order_no TEXT,customer_snapshot TEXT,created_at INTEGER,desired_date TEXT,total_amount INTEGER,status TEXT,customer_id INTEGER,is_sample INTEGER DEFAULT 0,is_store_order INTEGER DEFAULT 0);
CREATE TABLE customers(id INTEGER PRIMARY KEY,is_store INTEGER);
CREATE TABLE bank_review(id INTEGER PRIMARY KEY,environment TEXT,at TEXT,remark TEXT,deposit INTEGER,withdraw INTEGER,state TEXT,account TEXT);
CREATE TABLE bank_live_postings(id INTEGER PRIMARY KEY,bank_id INTEGER,cancelled_at INTEGER);
CREATE TABLE tax_invoice_order_links(id INTEGER PRIMARY KEY,order_id INTEGER,environment TEXT,active INTEGER,draft_id TEXT);
CREATE TABLE tax_invoice_drafts(id TEXT PRIMARY KEY,environment TEXT,state TEXT);
CREATE TABLE leave_requests(id INTEGER PRIMARY KEY,staff_name TEXT,start_date TEXT,end_date TEXT,half_day INTEGER,created_at INTEGER,status TEXT,reason TEXT);
CREATE TABLE schedule_change_requests(id INTEGER PRIMARY KEY,staff_name TEXT,created_at INTEGER,status TEXT,reason TEXT);
CREATE TABLE supply_orders(id INTEGER PRIMARY KEY,vendor TEXT,body TEXT,order_date TEXT);
CREATE TABLE supply_order_meta(order_id INTEGER,status TEXT);
INSERT INTO customers VALUES(1,0),(2,1);
`);
function order(id: number, status: string, options: Partial<{ total: number; sample: number; store: number; customer: number }> = {}) {
  db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, `DEMO-${id}`, '{"businessName":"예시 거래처"}', now + id, '', options.total ?? 11000, status, options.customer ?? 1, options.sample ?? 0, options.store ?? 0);
}
for (let id=1;id<=5;id++) order(id, 'pending');
order(6,'cancelled');
for (let id=10;id<=17;id++) order(id,'done');
order(18,'done',{sample:1}); order(19,'done',{store:1}); order(20,'done',{store:-1,customer:2});
order(21,'done',{total:0}); order(22,'done',{total:-1000});
order(23,'done',{store:0,customer:2}); // explicit external order remains eligible
order(24,'done',{store:-1,customer:1});
for (const [id,state] of [[11,'draft'],[12,'rejected'],[13,'sending'],[14,'unknown'],[15,'issued'],[16,'external'],[17,'cancelled']] as const) {
  db.prepare('INSERT INTO tax_invoice_drafts VALUES(?,?,?)').run(`DOC-${id}`,'production',state);
  db.prepare('INSERT INTO tax_invoice_order_links VALUES(?,?,?,?,?)').run(id,id,'production',1,`DOC-${id}`);
}
// Issuance in test and inactive production links do not remove production work.
db.exec(`INSERT INTO tax_invoice_drafts VALUES('TEST','test','issued'),('OLD','production','issued');
INSERT INTO tax_invoice_order_links VALUES(100,10,'test',1,'TEST'),(101,10,'production',0,'OLD');`);
for (const [id,env,state,deposit] of [[1,'production','pending',5000],[2,'production','customer',10000],[3,'production','settlement',20000],[4,'production','payment',30000],[5,'production','pending',0],[6,'test','pending',40000],[7,'production','customer',50000],[8,'production','pending',60000],[9,'production','online',70000],[10,'production','delivery',80000]] as const) {
  db.prepare('INSERT INTO bank_review VALUES(?,?,?,?,?,?,?,?)').run(id,env,'20260926110000',`예시 입금 ${id}`,deposit,deposit?0:500,state,'NEVER-EXPOSE-ACCOUNT');
}
db.exec(`INSERT INTO bank_live_postings VALUES(1,7,NULL),(2,8,1);
INSERT INTO leave_requests VALUES(1,'예시 직원 A','2026-09-29','2026-09-29',0,1,'pending','PRIVATE-REASON'),(2,'예시 직원 B','2026-09-30','2026-09-30',1,2,'approved','PRIVATE-REASON');
INSERT INTO schedule_change_requests VALUES(1,'예시 직원 B',1,'pending','PRIVATE-REASON'),(2,'예시 직원 C',2,'rejected','PRIVATE-REASON');
INSERT INTO supply_orders VALUES(1,'예시 구매처','우유 2개','2026-08-01'),(2,'완료 구매처','입고 완료','2026-09-27'),(3,'기존 기록','상태 없음','2026-09-27');
INSERT INTO supply_order_meta VALUES(1,'partial'),(2,'received');`);
const read = (owner=true) => readTodayTasks(db,owner,now);
const get = (key: string) => read().groups.find(g=>g.key===key)!;
assert.equal(get('orders').count,5); assert.equal(get('orders').items.length,3);
assert.deepEqual(get('orders').items.map(r=>r.id),[1,2,3]);
assert.equal(get('invoices').count,8); // unissued + draft/rejected/sending/unknown/cancelled + explicit/legacy external
assert.equal(get('deposits').count,3); assert.deepEqual(get('deposits').items.map(r=>r.id),[1,2,8]);
assert.equal(get('leave').count,1); assert.equal(get('schedule').count,1); assert.equal(get('supply').count,1);
assert(!JSON.stringify(read()).includes('PRIVATE-REASON')); assert(!JSON.stringify(read()).includes('NEVER-EXPOSE-ACCOUNT'));
assert.equal(read().checkedAt,now);
assert.deepEqual(read(false).groups.map(g=>g.key),['orders','supply']);
// Read-only, including repeated polls.
const changes = db.prepare('SELECT total_changes() AS n').get().n;
read(); read(); assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes);

// Completion, rejection/cancellation and reopening are derived from live source status.
db.exec(`UPDATE orders SET status='done' WHERE id=1;
INSERT INTO bank_live_postings VALUES(3,2,NULL); UPDATE bank_review SET state='other' WHERE id=1;
UPDATE tax_invoice_drafts SET state='issued' WHERE id='DOC-11';
UPDATE leave_requests SET status='approved' WHERE id=1;
UPDATE schedule_change_requests SET status='cancelled' WHERE id=1;
UPDATE supply_order_meta SET status='received' WHERE order_id=1;`);
assert.equal(get('orders').count,4); assert.equal(get('deposits').count,1);
assert(!get('invoices').items.some(r=>r.id===11)); assert.equal(get('invoices').count,8); // one completed order added, one invoice issued
assert.equal(get('leave').count,0); assert.equal(get('schedule').count,0); assert.equal(get('supply').count,0);
db.exec(`UPDATE bank_live_postings SET cancelled_at=2 WHERE id=3; UPDATE orders SET status='pending' WHERE id=1; UPDATE leave_requests SET status='pending' WHERE id=1;`);
assert.equal(get('deposits').count,2); assert.equal(get('orders').count,5); assert.equal(get('leave').count,1);

// UI predicate is consistent with the overview, including a classified but unposted receipt.
assert(needsDepositReview({deposit:10,state:'customer',posted:0}));
assert(!needsDepositReview({deposit:10,state:'customer',posted:1}));
assert(!needsDepositReview({deposit:10,state:'settlement',posted:0}));
assert(!needsDepositReview({deposit:0,state:'pending',posted:0}));
const link = new URL(todayTaskHref('/admin/tax-invoices','invoices',10),'https://example.test/');
assert.equal(link.hash,'#/admin/tax-invoices'); assert.equal(link.searchParams.get('order'),'10');
assert.equal(link.searchParams.get('environment'),'production');

// The endpoint preserves admin middleware, ignores query-based privilege escalation,
// and doesn't touch owner sources for a manager.
let handler: any; const auth=()=>{};
registerAdminOperations({get:(path:string,...handlers:any[])=>{assert.equal(handlers[0],auth);if(path.endsWith('/tasks'))handler=handlers[1];}} as any,db,auth);
let payload: any; const res={setHeader:(key:string,value:string)=>assert.equal(`${key}:${value}`,'Cache-Control:no-store'),json:(value:any)=>{payload=value;}};
handler({session:{adminRole:'manager'},query:{owner:'true'}},res,(e:any)=>{throw e;});
assert.deepEqual(payload.groups.map((g:any)=>g.key),['orders','supply']);
handler({session:{adminRole:'owner'}},res,(e:any)=>{throw e;}); assert.equal(payload.groups.length,6);
for (const table of ['bank_review','tax_invoice_drafts','leave_requests','schedule_change_requests']) db.exec(`DROP TABLE ${table}`);
assert.doesNotThrow(()=>read(false));
let failure: any; handler({session:{adminRole:'owner'}},res,(e:any)=>{failure=e;}); assert(failure); // no misleading zero counts
db.close();
console.log('PASS: bounded previews, production-only finance, invoice eligibility, owner permissions, read-only lifecycle and task links');
