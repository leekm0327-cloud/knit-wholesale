import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { initSupplyWorkflow, registerSupplyWorkflow } from '../../server/supply-workflow';
const sql = new DatabaseSync(':memory:');
const db: any = { exec: (s: string) => sql.exec(s), prepare: (s: string) => sql.prepare(s), transaction: (fn: any) => (...args: any[]) => { sql.exec('BEGIN IMMEDIATE'); try {
        const v = fn(...args);
        sql.exec('COMMIT');
        return v;
    }
    catch (e) {
        sql.exec('ROLLBACK');
        throw e;
    } } };
sql.exec(`CREATE TABLE staff(id INTEGER PRIMARY KEY,name TEXT,active INTEGER); INSERT INTO staff VALUES(1,'직원 A',1),(2,'직원 B',1),(3,'퇴사',0);
CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT,category TEXT,available INTEGER,sort_order INTEGER);INSERT INTO products VALUES(1,'코튼 블렌드 1kg','blend',1,0),(2,'드립백','bag',1,1),(3,'품절 원두','blend',0,2);
CREATE TABLE product_categories(key TEXT,is_bean INTEGER);INSERT INTO product_categories VALUES('blend',1),('bag',0);
CREATE TABLE supply_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,order_date TEXT,vendor TEXT,body TEXT,amount INTEGER,staff_id INTEGER,staff_name TEXT,created_at INTEGER,updated_at INTEGER);
INSERT INTO supply_orders VALUES(1,'2026-08-01','기존','과거 기록',1000,1,'직원 A',1,1);`);
initSupplyWorkflow(db);
initSupplyWorkflow(db);
assert.equal((sql.prepare('SELECT amount FROM supply_orders WHERE id=1').get() as any).amount, 1000);
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => { req.session = { staffId: Number(req.headers['x-staff']) || undefined, userId: req.headers['x-admin'] === 'owner' ? 10 : undefined }; next(); });
registerSupplyWorkflow(app, db, (req: any, res, next) => { if (!req.session.staffId) {
    res.status(401).end();
    return;
} next(); }, (req:any,res,next)=>req.session.userId?next():res.sendStatus(403));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(r => server.once('listening', r));
const port = (server.address() as any).port;
async function call(method: string, path: string, body?: any, staff = 1) { const r = await fetch(`http://127.0.0.1:${port}/api/staff${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-staff': String(staff) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, data: await r.json().catch(() => null) }; }
try {
    assert.equal((await call('GET', '/bean-stock', undefined, 0)).status, 401);
    assert.equal((await call('GET', '/bean-stock', undefined, 3)).status, 401);
    const products = await call('GET', '/bean-stock');
    assert.deepEqual(products.data.map((r: any) => r.productId), [1, 3]);
    assert.equal(products.data[0].grams, null);
    for (const bad of [-1, 5.5555, '5.5', null]) {
        if (bad !== null)
            assert.equal((await call('PUT', '/bean-stock/1', { kg: bad, minimumKg: 2, tracked: true, version: 0 })).status, 400);
    }
    assert.equal((await call('PUT', '/bean-stock/2', { kg: 5.5, minimumKg: 2, tracked: true, version: 0 })).status, 404);
    assert.equal((await call('PUT', '/bean-stock/1', { kg: 5.5, minimumKg: 6, tracked: true, version: 0 })).status, 200);
    assert.equal((await call('PUT', '/bean-stock/1', { kg: 2.3, minimumKg: 6, tracked: true, version: 0 }, 2)).status, 409);
    assert.equal((await call('GET', '/bean-stock')).data[0].grams, 5500);
    assert.equal((await call('PUT', '/bean-stock/1', { kg: 2.3, minimumKg: 6, tracked: true, version: 1 }, 2)).status, 200);
    const hist = (await call('GET', '/bean-stock/1/history')).data;
    assert.deepEqual(hist.map((r: any) => r.grams), [2300, 5500]);
    assert.equal(hist[0].staffName, '직원 B');
    const req1 = await call('POST', '/bean-stock/1/request', {});
    const req2 = await call('POST', '/bean-stock/1/request', {});
    assert.equal(req1.data.id, req2.data.id);
    assert.equal(req2.data.existing, true);
    let rows = (await call('GET', '/supply-board?month=2026-08')).data;
    assert.equal(rows.find((r: any) => r.id === 1).status, 'recorded');
    assert(rows.some((r: any) => r.id === req1.data.id));
    const order = { orderDate: '2026-07-05', vendor: '매일', body: '우유 2박스', amount: 43190, destination: '매장', expectedDate: '2026-07-06', link: 'https://example.com', note: '' };
    assert.equal((await call('POST', '/supply-board', { ...order, link: 'javascript:alert(1)', status: 'ordered' })).status, 400);
    assert.equal((await call('POST', '/supply-board', { ...order, orderDate: '2026-02-30', status: 'ordered' })).status, 400);
    let request = rows.find((r: any) => r.id === req1.data.id);
    let paid = (await call('POST', `/supply-board/${request.id}/status`, { version: request.updatedAt, status: 'ordered', note: '주문 완료', order }, 2)).data;
    assert.equal(paid.staffId, 2);
    assert.equal(paid.amount, 43190);
    assert.equal((await call('PATCH', `/supply-board/${paid.id}`, { ...order, version: paid.updatedAt }, 1)).status, 403);
    assert((await call('GET', '/supply-board?month=2026-08')).data.some((r: any) => r.id === paid.id));
    assert.equal((await call('POST', `/supply-board/${paid.id}/status`, { status: 'partial', version: paid.updatedAt, note: '' })).status, 400);
    let partial = (await call('POST', `/supply-board/${paid.id}/status`, { status: 'partial', version: paid.updatedAt, note: '우유 1박스 누락' })).data;
    assert.equal((await call('POST', `/supply-board/${paid.id}/status`, { status: 'received', version: paid.updatedAt, note: '' })).status, 409);
    let received = (await call('POST', `/supply-board/${paid.id}/status`, { status: 'received', version: partial.updatedAt, note: '나머지 도착' })).data;
    assert.equal(received.receivedBy, '직원 A');
    assert.equal((await call('PATCH', `/supply-board/${paid.id}`, { ...order, version: received.updatedAt }, 2)).status,409);
    const edited = received;
    let refund = (await call('POST', `/supply-board/${paid.id}/status`, { status: 'refund_pending', version: edited.updatedAt, note: '파손' })).data;
    assert.equal((await call('PATCH', `/supply-board/${paid.id}`, {...order, version:refund.updatedAt},2)).status,409);
    let refunded = (await call('POST', `/supply-board/${paid.id}/status`, { status: 'refunded', version: refund.updatedAt, note: '전액 환불 확인' })).data;
    assert.equal(refunded.amount, 43190);
    assert.equal((await call('POST', `/supply-board/${paid.id}/status`, { status: 'ordered', version: refunded.updatedAt, note: '' })).status, 400);
    assert((await call('GET', `/supply-board/${paid.id}/events`)).data.length >= 5);
    assert.equal((await call('POST', '/supply-templates', { name: '우유', vendor: order.vendor, body: order.body, link: order.link, destination: order.destination })).status, 200);
    assert.equal((await call('GET', '/supply-templates')).data.length, 1);
    const fresh = (await call('POST','/supply-board',{...order,status:'ordered'})).data;
    let updated = await call('PATCH',`/supply-board/${fresh.id}`,{...order,body:'우유 3박스',version:fresh.updatedAt});
    assert.equal(updated.status,200); assert.equal(updated.data.body,'우유 3박스');
    assert.equal((await call('PATCH',`/supply-board/${fresh.id}`,{...order,version:fresh.updatedAt})).status,409);
    async function admin(method:string,path:string,body?:any,allow=true) {
        const r=await fetch(`http://127.0.0.1:${port}/api/admin/staff${path}`,{method,headers:{'Content-Type':'application/json','x-admin':allow?'owner':''},body:body?JSON.stringify(body):undefined});
        return {status:r.status,data:await r.json().catch(()=>null)};
    }
    assert.equal((await admin('GET','/supply-board?from=2026-07-01&to=2026-08-31',undefined,false)).status,403);
    assert.equal((await admin('PATCH',`/supply-board/${fresh.id}`,{body:'관리자 수정',version:updated.data.updatedAt},false)).status,403);
    const byAdmin=await admin('PATCH',`/supply-board/${fresh.id}`,{body:'관리자 수정',version:updated.data.updatedAt});
    assert.equal(byAdmin.status,200);assert.equal(byAdmin.data.staffId,1);assert.equal(byAdmin.data.body,'관리자 수정');
    const events=(await call('GET',`/supply-board/${fresh.id}/events`)).data;
    assert.equal(events[0].staffName,'관리자 #10');assert(events[0].note.includes('우유 3박스'));
    const complete=(await call('POST',`/supply-board/${fresh.id}/status`,{status:'received',version:byAdmin.data.updatedAt,note:''})).data;
    assert.equal((await admin('PATCH',`/supply-board/${fresh.id}`,{body:'금지',version:byAdmin.data.updatedAt})).status,409);
    assert.equal((await admin('PATCH',`/supply-board/${fresh.id}`,{body:'금지',version:complete.updatedAt})).status,409);
    assert.equal((await call('PATCH',`/supply-orders/${fresh.id}`,{body:'우회 시도',version:complete.updatedAt})).status,409);
    assert.equal((await admin('GET','/supply-board?from=2026-07-01&to=2026-08-31')).data.find((r:any)=>r.id===fresh.id).body,'관리자 수정');
    console.log('PASS: additive migration, auth, bean-category privacy, decimals/history/conflicts, duplicate request guard, cross-month pending, validation, purchase/partial receipt/refund lifecycle and receipt attribution');
}
finally {
    await new Promise<void>(r => server.close(() => r()));
    sql.close();
}
