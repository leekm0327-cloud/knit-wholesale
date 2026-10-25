import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { registerBankReview } from '../../server/bank-review';
const db:any=new DatabaseSync(':memory:');
db.transaction=(fn:any)=>()=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
db.exec(`CREATE TABLE expenses(id INTEGER,amount INTEGER,expense_date TEXT,category TEXT,memo TEXT);CREATE TABLE payments(id INTEGER,amount INTEGER,paid_at TEXT,customer_id INTEGER,memo TEXT);CREATE TABLE customers(id INTEGER,business_name TEXT,role TEXT);CREATE TABLE store_sales(id INTEGER,amount INTEGER);INSERT INTO store_sales VALUES(1,900000);`);
const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.session={userId:1};next();});registerBankReview(app,db,(req,res,next)=>req.headers['x-role']==='owner'?next():res.sendStatus(403));
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
const originalFetch=globalThis.fetch,originalNow=Date.now;let now=Date.UTC(2026,9,24,1);Date.now=()=>now;
let soapCalls=0;
globalThis.fetch=(async(input:any,options:any)=>{if(String(input).startsWith(base+'/'))return originalFetch(input,options);throw new Error('External request blocked: test fixture only');}) as any;
const call=(path='',method='GET',body?:any,role='owner',environment='test')=>fetch(base+(environment==='test'?'/api/admin/bank-review':'/api/admin/bank-live')+path,{method,headers:{'Content-Type':'application/json','x-role':role},body:body?JSON.stringify(body):undefined});
const json=async(path='',method='GET',body?:any)=>{const r=await call(path,method,body);const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
const row=(ref:string,overrides={})=>({account:'000011112222',ref,at:'20261024100100',deposit:97000,withdraw:0,remark:'가상카드 정산',currency:'KRW',...overrides});
const insert=(r:any,state='pending',env='test')=>Number(db.prepare('INSERT INTO bank_review(environment,account,ref,at,deposit,withdraw,remark,currency,state) VALUES(?,?,?,?,?,?,?,?,?)').run(env,r.account,r.ref,r.at,r.deposit,r.withdraw,r.remark,r.currency,state).lastInsertRowid);
const state=(id:number)=>db.prepare('SELECT state FROM bank_review WHERE id=?').get(id).state;
const imported=async(items:any[])=>json('/import','POST',{environment:'test',rows:items});
const checks:string[]=[];
try{
 for(const [p,m,b] of [['/settlement-rules','GET',null],['/settlement-rules','POST',{}],['/settlement-rules/1','PATCH',{}],['/settlement-rules/history/1/undo','POST',{}]] as any[])assert.equal((await call(p,m,b,'staff')).status,403);checks.push('owner-only endpoints');
 const seed=insert(row('seed',{at:'20261023090000'}),'settlement');const oldPending=insert(row('old-pending'));
 let data=await json('/settlement-rules');assert.equal(data.candidates.length,1);assert.equal(data.rules.length,0);assert(!JSON.stringify(data).includes('000011112222'));checks.push('history creates masked candidate only, no automatic activation');
 const candidate=data.candidates[0];assert.notEqual((await call('/settlement-rules','POST',{...candidate})).status,200);
 const activation={bankId:seed,token:candidate.token,confirmCardSettlement:true};
 const responses=await Promise.all([call('/settlement-rules','POST',activation),call('/settlement-rules','POST',activation)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);checks.push('explicit confirmation and concurrent duplicate rule creation');
 assert.equal(state(oldPending),'pending');now+=120000;
 let result=await imported([row('new'),row('different-account',{account:'000099992222'}),row('withdraw',{deposit:0,withdraw:97000}),row('different-remark',{remark:'가상카드  정산'}),row('old-date',{at:'20261023090000'}),row('future',{at:'20261025100100'}),row('empty',{remark:''})]);assert.equal(result.classified,1);assert.equal(result.manual,6);assert.equal(state(oldPending),'pending');checks.push('exact full account / direction / remark; old and future dates excluded; existing pending untouched');
 const first=db.prepare("SELECT id FROM bank_review WHERE ref='new'").get().id;
 const duplicates=await Promise.all([imported([row('new')]),imported([row('new')])]);assert(duplicates.every(x=>x.added===0&&x.classified===0));assert.equal(db.prepare('SELECT count(*) n FROM bank_settlement_applications').get().n,1);checks.push('concurrent reimport idempotence and single audit');
 data=await json('/settlement-rules');const r=data.rules[0];await json(`/settlement-rules/${r.id}`,'PATCH',{enabled:false,version:r.version});assert.equal((await imported([row('paused')])).classified,0);
 assert.notEqual((await call(`/settlement-rules/${r.id}`,'PATCH',{enabled:true,version:r.version,confirmCardSettlement:true})).status,200);
 await json(`/settlement-rules/${r.id}`,'PATCH',{enabled:true,version:r.version+1,confirmCardSettlement:true});now+=120000;assert.equal((await imported([row('resumed',{at:'20261024100300'})])).classified,1);checks.push('pause/resume/version concurrency and new activation cutoff');
 const h=(await json('/settlement-rules')).history.find((x:any)=>x.bankId===first);await json(`/settlement-rules/history/${h.id}/undo`,'POST',{reason:'가상 검토 취소'});await json(`/settlement-rules/history/${h.id}/undo`,'POST',{reason:'반복 요청'});assert.equal(state(first),'pending');assert.equal((await imported([row('new')])).classified,0);assert(db.prepare('SELECT * FROM bank_settlement_suppressions WHERE bank_id=?').get(first));checks.push('undo idempotence / suppression / reimport does not reapply');
 const resumed=db.prepare("SELECT id FROM bank_review WHERE ref='resumed'").get().id;await json('/'+resumed,'PATCH',{state:'pending',targetId:null,memo:'수동 수정'});assert.equal((await json('/settlement-rules')).history.find((x:any)=>x.bankId===resumed).reason,'manual');checks.push('manual correction overrides automatic classification');
 insert(row('conflict',{at:'20261024100300'}),'other');assert.equal((await imported([row('blocked',{at:'20261024100300'})])).classified,0);assert((await json('/settlement-rules')).rules[0].blocked);checks.push('conflicting historical classification requires manual review');
 assert.equal((await (await call('/settlement-rules','GET',undefined,'owner','production')).json()).rules.length,0);checks.push('test / production isolation');
 // Separate candidate: stale snapshot cannot activate after intervening manual edit.
 const stale=insert(row('stale',{remark:'가상카드B'}),'settlement');data=await json('/settlement-rules');const sc=data.candidates.find((x:any)=>x.bankId===stale);await json('/'+stale,'PATCH',{state:'other',targetId:null,memo:''});assert.notEqual((await call('/settlement-rules','POST',{bankId:stale,token:sc.token,confirmCardSettlement:true})).status,200);checks.push('stale candidate rejection');
 // Undo cannot silently erase subsequent changes; cancelled ledger links remain ineligible.
 const special=insert(row('special-seed',{remark:'가상카드 C'}),'settlement');const cc=(await json('/settlement-rules')).candidates.find((x:any)=>x.bankId===special);
 await json('/settlement-rules','POST',{bankId:special,token:cc.token,confirmCardSettlement:true});now+=120000;
 assert.equal((await imported([row('protected',{remark:'가상카드 C',at:'20261024100500'}),row('invalid-time',{remark:'가상카드 C',at:'20261024009900'})])).classified,1);
 const protectedId=db.prepare("SELECT id FROM bank_review WHERE ref='protected'").get().id;const ph=(await json('/settlement-rules')).history.find((x:any)=>x.bankId===protectedId);
 db.prepare('UPDATE bank_review SET memo=? WHERE id=?').run('후속 변경',protectedId);
 assert.equal((await call('/settlement-rules/history/'+ph.id+'/undo','POST',{reason:'거부 확인'})).status,409);assert.equal(state(protectedId),'settlement');
 const cancelled=insert(row('cancelled-seed',{remark:'가상카드 취소'}),'settlement');db.prepare("INSERT INTO bank_test_postings(bank_id,kind,amount,posted_date,memo,created_by,created_at,cancelled_at) VALUES(?,'payment',97000,'2026-10-24','fixture',1,1,2)").run(cancelled);
 assert(!(await json('/settlement-rules')).candidates.some((x:any)=>x.bankId===cancelled));checks.push('undo refuses later edits; invalid timestamp and cancelled posting candidate excluded');
 const uncertain=await imported([row('ambiguous',{remark:'가상카드 C',at:'20261024100500'}),row('ambiguous',{remark:'가상카드 C',at:'20261024100500',deposit:100000})]);assert.equal(uncertain.added,1);assert.equal(uncertain.classified,0);assert.equal(uncertain.manual,1);checks.push('conflicting duplicate provider identity stays manual');
 // Deliberate failure proves import and classification/audit roll back together.
 db.exec("CREATE TRIGGER fixture_fail BEFORE INSERT ON bank_settlement_applications WHEN NEW.bank_id=(SELECT id FROM bank_review WHERE ref='atomic-fail') BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
 assert.notEqual((await call('/import','POST',{environment:'test',rows:[row('atomic-fail',{remark:'가상카드 C',at:'20261024100500'})]})).status,200);assert(!db.prepare("SELECT id FROM bank_review WHERE ref='atomic-fail'").get());db.exec('DROP TRIGGER fixture_fail');checks.push('atomic rollback on audit failure');
 // Sync only through a SOAP fixture. No external service can be reached.
 process.env.BAROBILL_TEST_KEY='fixture-placeholder-key-0000';process.env.BAROBILL_CORP_NUM='0000000000';process.env.BAROBILL_USER_ID='fixture';
 globalThis.fetch=(async(input:any,options:any)=>{if(String(input).startsWith(base+'/'))return originalFetch(input,options);if(String(input)!=='https://testws.baroservice.com/BANKACCOUNT.asmx')throw new Error('External request blocked');soapCalls++;const method=String(options.headers.SOAPAction).includes('GetPeriod')?'GetPeriodBankAccountTransLog':'GetBankAccount';const content=method==='GetBankAccount'?'<BankAccount><BankName>Fixture</BankName><BankAccountNum>000011112222</BankAccountNum></BankAccount>':'<CurrentPage>1</CurrentPage><MaxPageNum>1</MaxPageNum><BankAccountLogList><BankAccountTransLog><TransRefKey>sync-only</TransRefKey><TransDT>20261024100500</TransDT><Deposit>97000</Deposit><Withdraw>0</Withdraw><CurrencyCode>KRW</CurrencyCode><TransRemark1>가상카드 C</TransRemark1></BankAccountTransLog></BankAccountLogList>';return new Response(`<Envelope><Body><${method}Response><${method}Result>${content}</${method}Result></${method}Response></Body></Envelope>`);}) as any;
 const syncResult=await json('/sync','POST',{from:'2026-10-24',to:'2026-10-24'});assert.equal(syncResult.added,1);assert.equal(syncResult.classified,1);assert.equal((await json('/sync','POST',{from:'2026-10-24',to:'2026-10-24'})).added,0);assert.equal(soapCalls,4);checks.push('sync uses same classification hook, fixture-only SOAP, repeated sync unchanged');
 assert.equal(db.prepare('SELECT count(*) n FROM expenses').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM payments').get().n,0);assert.deepEqual({...db.prepare('SELECT * FROM store_sales').get()},{id:1,amount:900000});checks.push('expense/payment/POS sales untouched');
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
}finally{Date.now=originalNow;globalThis.fetch=originalFetch;server.close();db.close();}
