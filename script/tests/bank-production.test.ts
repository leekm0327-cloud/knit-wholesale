import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { registerBankReview } from '../../server/bank-review';
const db:any=new DatabaseSync(':memory:');db.transaction=(fn:any)=>()=>{db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
db.exec(`CREATE TABLE customers(id INTEGER PRIMARY KEY,role TEXT,business_name TEXT);INSERT INTO customers VALUES(1,'customer','Fixture');CREATE TABLE expenses(id INTEGER PRIMARY KEY,amount INTEGER,expense_date TEXT,category TEXT,memo TEXT,sector TEXT,created_at INTEGER);CREATE TABLE payments(id INTEGER PRIMARY KEY,amount INTEGER,paid_at TEXT,customer_id INTEGER,memo TEXT,method TEXT,created_at INTEGER);CREATE TABLE fixed_cost_items(id INTEGER,name TEXT,sector TEXT,cost_type TEXT,active INTEGER,sort_order INTEGER);INSERT INTO fixed_cost_items VALUES(1,'Fixture','store','cogs',1,0);`);
process.env.SESSION_SECRET='unit-test-session-secret-not-for-production';
const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.session={userId:1};next();});registerBankReview(app,db,(req,res,next)=>req.headers['x-role']==='owner'?next():res.sendStatus(403));
db.exec(`INSERT INTO bank_review(id,environment,account,ref,at,deposit,withdraw,remark,currency,state,target_id) VALUES(1,'production','12345','a','20260908100000',0,1000,'Fixture','KRW','pending',NULL),(2,'production','12345','b','20260908100000',2000,0,'Fixture','KRW','customer',1),(3,'test','12345','a','20260908100000',0,1000,'Fixture','KRW','pending',NULL),(4,'production','12345','c','20260908100000',0,1000,'Fixture','KRW','pending',NULL);`);
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}/api/admin`;
async function call(path:string,body?:any,role='owner',method=body?'POST':'GET'){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','x-role':role},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json().catch(()=>null)};}
try{
 const creds={key:'fixture-key-never-a-real-key',corp:'0000000000',id:'fixture'};
 assert.equal((await call('/bank-connection/production',creds,'staff')).status,403);
 assert.equal((await call('/bank-connection/production',creds)).status,200);
 const ciphertext=db.prepare('SELECT ciphertext FROM bank_connections').get().ciphertext;assert(!ciphertext.includes(creds.key));assert(!ciphertext.includes(creds.id));
 assert.equal((await call('/bank-live')).data.configured,true);
 const originalFetch=globalThis.fetch;
 const hosts:string[]=[];
 globalThis.fetch=(async(input:any,options:any)=>{
  if(String(input).startsWith(base))return originalFetch(input,options);
  hosts.push(String(input));assert(String(options.body).includes(creds.key));
  const method=String(options.body).includes('<GetBankAccount ')?'GetBankAccount':'GetPeriodBankAccountTransLog';
  const value=method==='GetBankAccount'?'<BankAccount><BankAccountNum>54321</BankAccountNum><BankName>Fixture</BankName></BankAccount>':'<CurrentPage>1</CurrentPage><MaxPageNum>1</MaxPageNum><BankAccountLogList><BankAccountTransLog><TransRefKey>sync-fixture</TransRefKey><TransDT>20260908110000</TransDT><CurrencyCode>KRW</CurrencyCode><Deposit>700</Deposit><Withdraw>0</Withdraw><TransRemark1>Fixture</TransRemark1></BankAccountTransLog></BankAccountLogList>';
  return new Response(`<Envelope><Body><${method}Response><${method}Result>${value}</${method}Result></${method}Response></Body></Envelope>`,{status:200});
 }) as typeof fetch;
 try{assert.equal((await call('/bank-live/sync',{from:'2026-09-01',to:'2026-09-08'})).data.added,1);assert.equal((await call('/bank-live/sync',{from:'2026-09-01',to:'2026-09-08'})).data.added,0);assert(hosts.every(h=>h==='https://ws.baroservice.com/BANKACCOUNT.asmx'));}finally{globalThis.fetch=originalFetch;}
 assert.equal(db.prepare('SELECT count(*) AS n FROM payments').get().n,0);
 assert.equal((await call('/bank-live')).data.rows.length,4);
 assert.equal((await call('/bank-review')).data.rows.length,1);
 assert.equal((await call('/bank-live/3/posting')).status,409);
 const expense={kind:'expense',category:'Fixture',sector:'store',memo:'fixture',duplicateChecked:true};
 assert.equal((await call('/bank-live/1/posting',expense)).status,409);
 const e=await call('/bank-live/1/posting',{...expense,confirmProduction:true});assert.equal(e.status,200);
 assert.equal((await call('/bank-live/1/posting',{...expense,confirmProduction:true})).data.id,e.data.id);
 assert.equal((await call('/bank-live/4/posting',{...expense,confirmProduction:true})).status,409);
 assert.equal(db.prepare('SELECT sum(amount) AS amount FROM expenses').get().amount,1000);
 assert.throws(()=>db.exec("UPDATE expenses SET amount=123"));assert.throws(()=>db.exec('DELETE FROM expenses'));
 const p=await call('/bank-live/2/posting',{kind:'payment',customerId:1,memo:'fixture',duplicateChecked:true,confirmProduction:true});assert.equal(p.status,200);
 assert.equal(db.prepare('SELECT sum(amount) AS amount FROM payments').get().amount,2000);
 assert.throws(()=>db.exec('DELETE FROM payments'));
 assert.equal((await call(`/bank-live/1/posting/${e.data.id}/cancel`,{reason:'fixture'})).status,200);
 assert.equal((await call(`/bank-live/2/posting/${p.data.id}/cancel`,{reason:'fixture'})).status,200);
 assert.equal(db.prepare('SELECT count(*) AS n FROM expenses').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM payments').get().n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM bank_live_audit').get().n,4);
 console.log('PASS production confirmation, encrypted configuration, environment isolation, actual ledger writes, duplicate guards, edit protection, atomic reversals and audit');
}finally{server.close();db.close();}
