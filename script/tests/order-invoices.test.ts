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
db.exec(`CREATE TABLE customers(id INTEGER PRIMARY KEY,is_store INTEGER,business_name TEXT,biz_reg_no TEXT,tax_email TEXT,email TEXT,manager_name TEXT,default_address TEXT);
 INSERT INTO customers VALUES(1,0,'Buyer','2222222222','buyer@example.invalid','','Buyer','Address'),(2,0,'Other','3333333333','other@example.invalid','','Other','Address');
 CREATE TABLE orders(id INTEGER PRIMARY KEY,order_no TEXT,customer_id INTEGER,customer_snapshot TEXT,items TEXT,discount_amount INTEGER,supply_amount INTEGER,vat INTEGER,total_amount INTEGER,status TEXT,is_store_order INTEGER,is_sample INTEGER,ecount_date TEXT,created_at INTEGER,ecount_sent_at INTEGER);`);
db.transaction=(fn:any)=>()=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
for(let i=1;i<=8;i++)db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(i,'ORDER'+i,i===8?2:1,'{}',JSON.stringify([{name:'A & B',unitPrice:1000,qty:2,amount:2000}]),100,1900,190,2090,i===7?'cancelled':'done',0,0,'2026-09-01',1,null);
const request=(ids:number[])=>({supplier:party,date:'2026-09-01',purpose:'2',groups:[{ids,buyer:draft.buyer}]});
try{
 assert.equal((await call('/production/orders')).data.rows.length,7);
 assert.equal((await call('/production/order-drafts',request([7]))).status,400);
 assert.equal((await call('/production/order-drafts',request([1,8]))).status,400);
 assert.equal((await call('/production/order-drafts',request([1,1]))).status,400);
 const a=(await call('/production/order-drafts',request([1,2]))).data.rows[0];
 assert.equal(a.payload.amount,3800);assert.equal(a.payload.tax,380);assert.equal(a.payload.lines.length,4);assert.equal(a.payload.lines[1].amount,-100);assert.equal(a.payload.lines[0].qty,'2');
 assert.equal((await call('/production/order-drafts',request([2,3]))).status,400);
 assert.equal(db.prepare('SELECT count(*) n FROM tax_invoice_order_links WHERE order_id=3').get().n,0);
 assert.equal((await call(`/production/drafts/${a.id}/discard`,{})).status,200);
 const again=(await call('/production/order-drafts',request([1,2]))).data.rows[0];assert.notEqual(a.id,again.id);
 db.exec("UPDATE orders SET items='[]' WHERE id=1");
 assert.equal((await call(`/production/drafts/${again.id}/issue`,{confirm:again.id,duplicateChecked:true})).status,400);
 assert.equal(calls.filter(c=>c==='RegistAndIssueTaxInvoice').length,0);
 assert.equal((await call('/production/orders')).data.rows.find((r:any)=>r.id===1).state,'changed');
 const pair=(await call('/production/order-drafts',{...request([3]),groups:[{ids:[3],buyer:draft.buyer},{ids:[4],buyer:draft.buyer}]})).data.rows;
 for(const d of pair)assert.equal((await call(`/production/drafts/${d.id}/issue`,{confirm:d.id,duplicateChecked:true})).data.state,'issued');
 assert.equal(calls.filter(c=>c==='RegistAndIssueTaxInvoice').length,2);
 assert.equal((await call(`/production/drafts/${pair[0].id}/discard`,{})).status,400);
 assert.equal((await call('/production/orders/external',{ids:[5],approval:'123456789012345678901234',confirmed:true})).status,200);
 assert.equal((await call('/production/orders')).data.rows.find((r:any)=>r.id===5).state,'external');
 assert.equal((await call('/production/order-drafts',request([5]))).status,400);
 assert.equal((await call('/test/order-drafts',request([5]))).status,200);
 assert.equal(db.prepare('SELECT count(*) n FROM payments').get().n,0);
 console.log('PASS full order lines and discounts, aggregate totals, mixed buyer and duplicate rejection, atomic reservation rollback, discard and rebuild, changed-order block, equal-value distinct orders, external linkage, environment isolation');
}finally{globalThis.fetch=original;server.close();db.close();}
