import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { registerBankReview } from '../../server/bank-review';
const db:any=new DatabaseSync(':memory:');db.transaction=(fn:any)=>()=>{db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
db.exec("CREATE TABLE customers(id INTEGER,role TEXT,business_name TEXT);INSERT INTO customers VALUES(1,'customer','카페'),(2,'admin','관리자');CREATE TABLE expenses(id INTEGER,amount INTEGER,expense_date TEXT,category TEXT,memo TEXT);CREATE TABLE payments(id INTEGER,amount INTEGER,paid_at TEXT,customer_id INTEGER,memo TEXT);CREATE TABLE fixed_cost_items(id INTEGER,name TEXT,sector TEXT,cost_type TEXT,active INTEGER,sort_order INTEGER);INSERT INTO fixed_cost_items VALUES(1,'식자재','store','cogs',1,0),(2,'원금','common','none',1,1);");
const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.session={userId:1};next();});registerBankReview(app,db,(req,res,next)=>req.headers['x-role']==='owner'?next():res.sendStatus(403));
db.exec("INSERT INTO bank_review(id,account,ref,at,deposit,withdraw,remark,currency) VALUES(1,'123','a','20260908100000',0,1000,'식자재','KRW'),(2,'123','b','20260908100000',2000,0,'카페','KRW'),(3,'123','c','20260908100000',0,3000,'카드','KRW');UPDATE bank_review SET state='card' WHERE id=3;UPDATE bank_review SET state='customer',target_id=1 WHERE id=2;");
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}/api/admin`;
async function call(path:string,body?:any,role='owner',method=body?'POST':'GET'){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','x-role':role},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json().catch(()=>null)};}
const expense={kind:'expense',category:'식자재',sector:'store',memo:'테스트',duplicateChecked:true};
try{
 for(const path of ['/bank-review/1/posting','/bank-test-ledger'])assert.equal((await call(path,undefined,'staff')).status,403);
 assert.equal((await call('/bank-review/1/posting',expense,'staff')).status,403);
 assert.equal((await call('/bank-review/1/posting',{...expense,duplicateChecked:false})).status,400);
 assert.equal((await call('/bank-review/2/posting',expense)).status,409);
 assert.equal((await call('/bank-review/3/posting',expense)).status,409);
 assert.equal((await call('/bank-review/1/posting',{...expense,category:'원금'})).status,409);
 const a=await call('/bank-review/1/posting',expense);assert.equal(a.status,200);
 const repeat=await call('/bank-review/1/posting',expense);assert.equal(repeat.data.id,a.data.id);
 assert.equal((await call('/bank-review/1/posting',{...expense,memo:'수정'})).status,409);
 assert.equal((await call('/bank-review/1',{state:'pending',targetId:null,memo:''},'owner','PATCH')).status,502);
 assert.equal((await call('/bank-review/2/posting',{kind:'payment',customerId:2,memo:'',duplicateChecked:true})).status,409);
 const b=await call('/bank-review/2/posting',{kind:'payment',customerId:1,memo:'',duplicateChecked:true});assert.equal(b.status,200);
 const totals=(await call('/bank-test-ledger')).data;assert.equal(totals.expenses[0].amount,1000);assert.equal(totals.payments[0].amount,2000);
 assert.equal((await call(`/bank-review/2/posting/${a.data.id}/cancel`,{reason:'wrong row'})).status,409);
 assert.equal((await call(`/bank-review/1/posting/${a.data.id}/cancel`,{reason:''})).status,400);
 await call(`/bank-review/1/posting/${a.data.id}/cancel`,{reason:'취소 시험'});await call(`/bank-review/1/posting/${a.data.id}/cancel`,{reason:'취소 시험'});
 assert.equal((await call('/bank-test-ledger')).data.expenses.length,0);
 assert.equal(db.prepare("SELECT count(*) AS n FROM bank_test_audit WHERE action='cancel'").get().n,1);
 assert.equal((await call('/bank-review/1/posting',expense)).status,200);
 assert.equal(db.prepare('SELECT count(*) AS n FROM expenses').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM payments').get().n,0);
 console.log('PASS posting, idempotency, reversal, audit, invalid categories/directions, permissions, totals and production ledger isolation');
}finally{server.close();db.close();}
