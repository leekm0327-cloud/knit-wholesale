import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { registerTaxInvoices } from '../../server/tax-invoices';
import { buyerRepresentatives } from '../../server/tax-buyer-representatives';
import { blankParty, updateBuyerParty, updateOrderBuyer } from '../../shared/tax-invoices';

// In-memory fixtures only. Any upstream request is a test failure.
const db: any = new DatabaseSync(':memory:');
db.transaction = (fn: any) => () => {
 db.exec('BEGIN');
 try { const value = fn(); db.exec('COMMIT'); return value; }
 catch (error) { db.exec('ROLLBACK'); throw error; }
};
const supplier = {...blankParty, corpNum:'1111111111', name:'테스트 공급자', ceo:'공급 대표', address:'사업장 주소', contact:'발행 담당', email:'seller@example.invalid'};
const buyer = {...supplier, corpNum:'2222222222', name:'테스트 거래처', ceo:'이전 대표', contact:'별도 담당자', email:'buyer@example.invalid'};
const draft = {supplier, buyer, date:'2026-09-01', purpose:'1', item:'원두', amount:2000, tax:200, remark:''};
const app = express(); app.use(express.json());
registerTaxInvoices(app, db, (req,res,next) => req.headers['x-role']==='owner'?next():res.sendStatus(403), () => ({key:'fixture-no-secret',id:'fixture',corp:supplier.corpNum}));
db.exec(`CREATE TABLE customers(id INTEGER PRIMARY KEY,is_store INTEGER,business_name TEXT,biz_reg_no TEXT,tax_email TEXT,email TEXT,manager_name TEXT,default_address TEXT);
 INSERT INTO customers VALUES(1,0,'테스트 거래처','222-22-22222','buyer@example.invalid','','별도 담당자','배송지'),(2,0,'새 거래처','3333333333','other@example.invalid','','담당자만 등록','배송지');
 CREATE TABLE orders(id INTEGER PRIMARY KEY,order_no TEXT,customer_id INTEGER,customer_snapshot TEXT,items TEXT,discount_amount INTEGER,supply_amount INTEGER,vat INTEGER,total_amount INTEGER,status TEXT,is_store_order INTEGER,is_sample INTEGER,ecount_date TEXT,created_at INTEGER,ecount_sent_at INTEGER);`);
for(let id=1;id<=5;id++) db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'ORDER'+id,id===5?2:1,'{}',JSON.stringify([{name:'원두',qty:2,unitPrice:1000,amount:2000}]),0,2000,200,2200,'done',0,0,'2026-09-01',1,null);
function historical(id:string, environment:string, ceo:string, state='issued', corp=supplier.corpNum, createdAt=1) {
 const payload=JSON.stringify({...draft,supplier:{...supplier,corpNum:corp},buyer:{...buyer,ceo}});
 db.prepare('INSERT INTO tax_invoice_drafts(id,environment,fingerprint,payload,state,created_at) VALUES(?,?,?,?,?,?)').run(id,environment,id,payload,state,createdAt);
}
historical('old','production','이전 대표');
historical('latest','production','최근 대표','issued',supplier.corpNum,2);
historical('discarded','production','취소한 입력','discarded',supplier.corpNum,3);
historical('cancelled','production','취소 문서','cancelled',supplier.corpNum,4);
historical('external','production','외부 연결','external',supplier.corpNum,5);
historical('empty','production','   ','issued',supplier.corpNum,6);
historical('different-supplier','production','다른 공급자 대표','issued','4444444444',7);
historical('test-only','test','테스트 대표','issued',supplier.corpNum,8);
// The lookup is not restricted to the 300 documents displayed on screen.
for(let i=0;i<301;i++) historical('newer-'+i,'production','무관한 대표','issued','5555555555',i+10);
const originalIssued = db.prepare("SELECT payload FROM tax_invoice_drafts WHERE id='latest'").get().payload;
assert.deepEqual(buyerRepresentatives(db,'production',supplier.corpNum),{[buyer.corpNum]:'최근 대표'});
assert.deepEqual(buyerRepresentatives(db,'test',supplier.corpNum),{[buyer.corpNum]:'테스트 대표'});
assert.deepEqual(buyerRepresentatives(db,'production',''),{});

const server=app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${(server.address() as any).port}/api/admin/tax-invoices`;
const originalFetch=globalThis.fetch;
let externalCalls=0;
globalThis.fetch=((input:any,options:any)=>{
 if(!String(input).startsWith(base)){externalCalls++;throw new Error('Unexpected external request');}
 return originalFetch(input,options);
}) as typeof fetch;
async function call(path:string,body?:unknown,role='owner') {
 const res=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-role':role},body:body?JSON.stringify(body):undefined});
 return {status:res.status,data:await res.json().catch(()=>null)};
}
try {
 assert.equal((await call('/production',undefined,'staff')).status,403);
 assert.equal((await call('/production/orders',undefined,'staff')).status,403);
 assert.equal((await call('/production')).data.buyerRepresentatives[buyer.corpNum],'최근 대표');
 const orders=(await call('/production/orders')).data;
 assert.equal(orders.rows.find((r:any)=>r.id===1).buyer.ceo,'최근 대표');
 assert.equal(orders.rows.find((r:any)=>r.id===5).buyer.ceo,''); // no contact-name fallback
 assert.equal(orders.rows.find((r:any)=>r.id===1).buyer.contact,'별도 담당자');
 const manual=await call('/production/drafts',{...draft,buyer:{...buyer,ceo:'직접 수정한 대표'}});
 assert.equal(manual.status,200);
 assert.equal((await call('/production/orders')).data.rows.find((r:any)=>r.id===2).buyer.ceo,'직접 수정한 대표');
 const request={supplier,date:'2026-09-01',purpose:'1',groups:[{ids:[1],buyer:{...buyer,ceo:'주문에서 수정한 대표'}}]};
 assert.equal((await call('/production/order-drafts',request)).status,200);
 assert.equal((await call('/production')).data.buyerRepresentatives[buyer.corpNum],'주문에서 수정한 대표');
 assert.equal((await call('/production/orders')).data.rows.find((r:any)=>r.id===2).buyer.ceo,'주문에서 수정한 대표');
 assert.equal((await call('/test/orders')).data.rows.find((r:any)=>r.id===2).buyer.ceo,'테스트 대표');
 // Failed batches roll back remembered names along with the draft inserts.
 const failed=await call('/production/order-drafts',{...request,groups:[{ids:[3],buyer:{...buyer,ceo:'실패한 입력'}},{ids:[999],buyer}]});
 assert.equal(failed.status,400);
 assert.equal((await call('/production')).data.buyerRepresentatives[buyer.corpNum],'주문에서 수정한 대표');
 assert.equal(db.prepare("SELECT payload FROM tax_invoice_drafts WHERE id='latest'").get().payload,originalIssued);
 assert.equal(externalCalls,0);

 const groups=[{buyer,ids:[1]},{buyer:{...buyer,contact:'다른 담당',address:'별도 사업장'},ids:[2]},{buyer:{...buyer,corpNum:'3333333333',ceo:'다른 대표'},ids:[3]}];
 const changed=updateOrderBuyer(groups,0,{...buyer,ceo:'새 대표'});
 assert.equal(changed[1].buyer.ceo,'새 대표');
 assert.equal(changed[1].buyer.contact,'다른 담당');
 assert.equal(changed[1].buyer.address,'별도 사업장');
 assert.equal(changed[2].buyer.ceo,'다른 대표');
 assert.equal(groups[0].buyer.ceo,'이전 대표');
 assert.equal(updateBuyerParty(buyer,{...buyer,corpNum:'3333333333'},{'3333333333':'저장된 대표'}).ceo,'저장된 대표');
 assert.equal(updateBuyerParty(buyer,{...buyer,corpNum:'9999999999'},{}).ceo,'');
 assert.equal(updateBuyerParty(buyer,{...buyer,ceo:'수동 입력'},{[buyer.corpNum]:'기억된 대표'}).ceo,'수동 입력');
 console.log('PASS: historical names, owner/supplier/environment isolation, manual and order reuse, rollback, immutable issued documents, batch sharing and no external issuance');
} finally {
 globalThis.fetch=originalFetch;
 await new Promise<void>(resolve=>server.close(()=>resolve()));
 db.close();
}
