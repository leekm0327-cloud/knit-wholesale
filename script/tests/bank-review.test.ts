import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { registerBankReview,normalizeBankRow } from '../../server/bank-review';
const db:any=new DatabaseSync(':memory:');
db.transaction=(fn:any)=>()=>{db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
db.exec("CREATE TABLE expenses(id INTEGER,amount INTEGER,expense_date TEXT,category TEXT,memo TEXT);INSERT INTO expenses VALUES(1,1000,'2026-09-08','식재료','우유');CREATE TABLE payments(id INTEGER,amount INTEGER,paid_at TEXT,customer_id INTEGER,memo TEXT);CREATE TABLE customers(id INTEGER,business_name TEXT,role TEXT);INSERT INTO customers VALUES(1,'카페','customer');");
const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.session={userId:1};next();});
registerBankReview(app,db,(req,res,next)=>req.headers['x-role']==='owner'?next():res.sendStatus(403));
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const url=`http://127.0.0.1:${(server.address() as any).port}/api/admin/bank-review`;
const call=(path='',method='GET',body?:any,role='owner')=>fetch(url+path,{method,headers:{'Content-Type':'application/json','x-role':role},body:body?JSON.stringify(body):undefined});
try{
 for(const [path,method] of [['','GET'],['/sync','POST'],['/1/candidates','GET'],['/1','PATCH']])assert.equal((await call(path,method,undefined,'staff')).status,403);
 db.exec("INSERT INTO bank_review(account,ref,at,deposit,withdraw,remark,currency) VALUES('12345678','a','20260908100000',0,1000,'우유','KRW'),('12345678','b','20260908100100',0,1000,'우유','KRW');");
 const data=await (await call()).json();assert.equal(data.rows[0].account,'****5678');assert(!JSON.stringify(data).includes('12345678'));
 assert.equal((await (await call('/1/candidates')).json()).candidates.length,1);
 assert.equal((await call('/1','PATCH',{state:'expense',targetId:1,memo:''})).status,200);
 assert.notEqual((await call('/2','PATCH',{state:'expense',targetId:1,memo:''})).status,200);
 assert.equal(db.prepare('SELECT count(*) AS n FROM expenses').get().n,1);
 assert.equal(db.prepare('SELECT count(*) AS n FROM payments').get().n,0);
 assert.equal((await call('/1','PATCH',{state:'pending',targetId:null,memo:''})).status,200);
 assert.equal((await call('/2','PATCH',{state:'expense',targetId:1,memo:''})).status,200);
 assert.throws(()=>normalizeBankRow({TransRefKey:'1',TransDT:'20260908000000',CurrencyCode:'USD',Deposit:'1',Withdraw:'0'},'x'));
 assert.throws(()=>normalizeBankRow({TransRefKey:'',TransDT:'20260908000000',CurrencyCode:'KRW',Deposit:'1',Withdraw:'0'},'x'));
 const originalFetch=globalThis.fetch;
 process.env.BAROBILL_TEST_KEY='test-only-placeholder-key';process.env.BAROBILL_CORP_NUM='0000000000';process.env.BAROBILL_USER_ID='test';
 globalThis.fetch=(async(input:any,options:any)=>{
  if(!String(input).startsWith('https://testws.baroservice.com/'))return originalFetch(input,options);
  const method=String(options.headers.SOAPAction).includes('GetPeriod')?'GetPeriodBankAccountTransLog':'GetBankAccount';
  const content=method==='GetBankAccount'?'<BankAccount><BankName>Test</BankName><BankAccountNum>11112222</BankAccountNum></BankAccount>':'<CurrentPage>1</CurrentPage><MaxPageNum>1</MaxPageNum><BankAccountLogList><BankAccountTransLog><TransRefKey>stable-reference</TransRefKey><TransDT>20260908120000</TransDT><Deposit>100</Deposit><Withdraw>0</Withdraw><CurrencyCode>KRW</CurrencyCode><TransRemark1>Test</TransRemark1></BankAccountTransLog></BankAccountLogList>';
  return new Response(`<Envelope><Body><${method}Response><${method}Result>${content}</${method}Result></${method}Response></Body></Envelope>`);
 }) as any;
 try{
  const first=await (await call('/sync','POST',{from:'2026-09-01',to:'2026-09-08'})).json();assert.equal(first.added,1);
  const second=await (await call('/sync','POST',{from:'2026-09-01',to:'2026-09-08'})).json();assert.equal(second.added,0);
 }finally{globalThis.fetch=originalFetch;}
 console.log('PASS owner-only access, masked accounts, candidates, duplicate link rejection, undo, ledger unchanged, invalid import rejection');
}finally{server.close();db.close();}
