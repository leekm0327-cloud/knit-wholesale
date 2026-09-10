import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {registerBankOnline} from '../../server/bank-online';
const db:any=new DatabaseSync(':memory:');db.transaction=(fn:any)=>()=>{db.exec('BEGIN');try{fn();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}};
db.exec(`CREATE TABLE bank_review(id INTEGER PRIMARY KEY,environment TEXT,deposit INTEGER,withdraw INTEGER,state TEXT,target_id INTEGER,updated_by INTEGER,updated_at INTEGER);CREATE TABLE bank_live_postings(id INTEGER,bank_id INTEGER,cancelled_at INTEGER);CREATE TABLE bank_test_postings(id INTEGER,bank_id INTEGER,cancelled_at INTEGER);CREATE TABLE store_sales(id INTEGER,sector TEXT,amount INTEGER,sale_date TEXT,memo TEXT);INSERT INTO store_sales VALUES(1,'online',600,'2026-09-01','fixture'),(2,'online',400,'2026-09-02','fixture');INSERT INTO bank_review VALUES(1,'production',950,0,'pending',NULL,NULL,NULL),(2,'production',950,0,'pending',NULL,NULL,NULL),(3,'test',950,0,'pending',NULL,NULL,NULL),(4,'production',0,950,'pending',NULL,NULL,NULL);`);
const app=express();app.use(express.json());app.use((r:any,_s,n)=>{r.session={userId:1};n();});const owner:any=(r:any,s:any,n:any)=>r.headers.role==='owner'?n():s.sendStatus(403);registerBankOnline(app,db,owner,'production','/live');registerBankOnline(app,db,owner,'test','/test');
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
const call=(path:string,body:any,role='owner',method='POST')=>fetch(base+path,{method,headers:{role,'Content-Type':'application/json'},body:method==='DELETE'?undefined:JSON.stringify(body)});
const payload={channel:'Fixture',fees:50,saleIds:[1,2]};
try{
assert.equal((await call('/live/1/online',payload,'staff')).status,403);
assert.equal((await call('/live/3/online',payload)).status,409);
assert.equal((await call('/live/4/online',payload)).status,409);
assert.equal((await call('/live/1/online',{...payload,fees:40})).status,409);
assert.equal((await call('/live/1/online',{...payload,saleIds:[1,1]})).status,409);
assert.equal((await call('/live/1/online',payload)).status,200);
assert.equal((await call('/live/1/online',payload)).status,200);
assert.equal((await call('/live/2/online',payload)).status,409);
assert.equal((await call('/test/3/online',payload)).status,200);
assert.equal((await call('/live/1/online',null,'owner','DELETE')).status,200);
assert.equal((await call('/live/2/online',payload)).status,200);
assert.equal(db.prepare('SELECT SUM(amount) AS n FROM store_sales').get().n,1000);
console.log('online settlement: validation, ownership, deduplication, environment isolation, unlink and unchanged sales passed');
}finally{server.close();}
