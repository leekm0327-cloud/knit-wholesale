import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {registerTaxInvoices} from '../../server/tax-invoices';
const db:any=new DatabaseSync(':memory:');db.exec('CREATE TABLE payments(id INTEGER); CREATE TABLE expenses(id INTEGER);');
const app=express();app.use(express.json());const creds={key:'fixture-no-secret',corp:'1111111111',id:'fixture'};
registerTaxInvoices(app,db,(req,res,next)=>req.headers['x-role']==='owner'?next():res.sendStatus(403),()=>creds);
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const base=`http://127.0.0.1:${(server.address() as any).port}/api/admin/tax-invoices`;
const original=globalThis.fetch;let calls:string[]=[],mode='success';
globalThis.fetch=(async(input:any,options:any)=>{
 if(String(input).startsWith(base))return original(input,options);
 const method=String(options.headers.SOAPAction).split('/').pop()!.replaceAll('"','');calls.push(method);let value='1';
 if(method==='RegistAndIssueTaxInvoice'){
  assert(String(options.body).includes('<SendSMS>false</SendSMS>'));assert(String(options.body).includes('<ForceIssue>false</ForceIssue>'));assert(String(options.body).includes('A &amp; B'));
  if(mode==='timeout')throw new Error('timeout');if(mode==='reject')value='-123';
 }
 if(method==='GetTaxInvoiceStateEX')value='<BarobillState>3011</BarobillState><NTSSendState>4</NTSSendState><NTSSendKey>fixture</NTSSendKey>';
 if(method.startsWith('GetPeriod'))value=mode==='malformed'?'<foo/>':'<CurrentPage>1</CurrentPage><MaxPageNum>2</MaxPageNum><MaxIndex>101</MaxIndex><SimpleTaxInvoiceEx2List><SimpleTaxInvoiceEx2><NTSSendKey>fixture</NTSSendKey><TotalAmount>-1100</TotalAmount></SimpleTaxInvoiceEx2></SimpleTaxInvoiceEx2List>';
 if(method==='GetCertificateRegistURL')value='https://www.barobill.co.kr/fixture';if(method==='GetTaxInvoiceScrapRequestURL')value='https://evil.invalid/';
 return new Response(`<Envelope><Body><${method}Response><${method}Result>${value}</${method}Result></${method}Response></Body></Envelope>`);
}) as typeof fetch;
async function call(path:string,body?:any,role='owner',verb=body?'POST':'GET'){
 const r=await fetch(base+path,{method:verb,headers:{'Content-Type':'application/json','x-role':role},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null)};
}
const party={corpNum:creds.corp,name:'A & B',ceo:'Fixture',address:'Fixture address',bizType:'',bizClass:'',contact:'Fixture',email:'fixture@example.invalid'};
const draft={supplier:party,buyer:{...party,corpNum:'2222222222'},date:'2026-09-01',purpose:'2',item:'Fixture',amount:1000,tax:100,remark:''};
try{
 assert.equal((await call('/test',undefined,'staff')).status,403);
 for(const body of [{...draft,tax:500},{...draft,date:'2026-02-30'},{...draft,buyer:party}])assert.equal((await call('/test/drafts',body)).status,400);
 assert.equal((await call('/test/profile',party,'owner','PUT')).status,200);
 const a=(await call('/test/drafts',draft)).data;assert.equal((await call('/test/drafts',draft)).data.id,a.id);
 assert.equal((await call(`/production/drafts/${a.id}/issue`,{confirm:a.id,duplicateChecked:true})).status,404);
 assert.equal((await call(`/test/drafts/${a.id}/issue`,{})).status,400);
 const args={confirm:a.id,duplicateChecked:true};const concurrent=await Promise.all([call(`/test/drafts/${a.id}/issue`,args),call(`/test/drafts/${a.id}/issue`,args)]);
 assert.equal(concurrent.filter(r=>r.status===200).length,1);assert.equal(calls.filter(c=>c==='RegistAndIssueTaxInvoice').length,1);
 const b=(await call('/test/drafts',{...draft,remark:'memo changed'})).data;assert.equal((await call(`/test/drafts/${b.id}/issue`,{confirm:b.id,duplicateChecked:true})).status,409);
 assert.equal((await call(`/test/drafts/${a.id}/status`,{})).data.remote_state.NTSSendState,'4');
 mode='timeout';const c=(await call('/test/drafts',{...draft,amount:2000,tax:200})).data;assert.equal((await call(`/test/drafts/${c.id}/issue`,{confirm:c.id,duplicateChecked:true})).data.state,'unknown');
 const count=calls.length;assert.equal((await call(`/test/drafts/${c.id}/issue`,{confirm:c.id,duplicateChecked:true})).status,409);assert.equal(calls.length,count);
 mode='reject';const d=(await call('/test/drafts',{...draft,amount:3000,tax:300})).data;assert.equal((await call(`/test/drafts/${d.id}/issue`,{confirm:d.id,duplicateChecked:true})).data.state,'rejected');
 const beforeRemoved=calls.length;
 assert.equal((await call('/production/search',{direction:'purchase'})).status,404);
 assert.equal((await call('/production/setup',{kind:'hometax'})).status,400);assert.equal(calls.length,beforeRemoved);assert.equal((await call('/production/setup',{kind:'certificate'})).status,200);
 assert.equal(db.prepare('SELECT count(*) n FROM payments').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM expenses').get().n,0);
 console.log('PASS invoice validation, owner and environment isolation, concurrent and economic duplicate guards, ambiguous timeout lock, reconciliation, removed HomeTax endpoints without upstream calls, certificate setup, no ledger writes');
}finally{globalThis.fetch=original;server.close();db.close();}
