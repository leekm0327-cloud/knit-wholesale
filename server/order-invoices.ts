import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {invoiceDraft,invoiceParty,taxDate,taxEnvironment} from '../shared/tax-invoices';
const fail=(s:string)=>{throw new Error('바로빌 주문 연결: '+s);};
export function orderSnapshot(o:any){return JSON.stringify([o.customer_id,o.items,o.discount_amount,o.supply_amount,o.vat,o.total_amount,o.status,o.is_store_order,o.is_sample,o.ecount_date]);}
export function orderInvoiceLines(orders:any[]){
 const lines:any[]=[];
 for(const o of orders){
  const items=JSON.parse(o.items);if(!Array.isArray(items)||!items.length)fail('품목이 없습니다.');
  let sum=0,vat=0;
  for(const i of items){if(!Number.isSafeInteger(i.amount)||i.amount<0||!Number.isFinite(i.qty)||i.qty<=0||!Number.isFinite(i.unitPrice)||i.unitPrice<0)fail('품목 금액을 확인해 주세요.');sum+=i.amount;
   const tax=Math.floor(i.amount/10);vat+=tax;lines.push({name:String(i.name),qty:String(i.qty),unitPrice:String(i.unitPrice),amount:i.amount,tax,description:o.order_no});}
  const discount=o.discount_amount||0;
  if(discount){const tax=-Math.floor(discount/10);vat+=tax;lines.push({name:'주문 할인',qty:'',unitPrice:'',amount:-discount,tax,description:o.order_no});}
  if(sum-discount!==o.supply_amount||o.supply_amount+o.vat!==o.total_amount)fail('주문 합계와 품목 합계가 다릅니다.');
  lines[lines.length-1].tax+=o.vat-vat;
 }
 if(lines.length>99)fail('품목이 99개를 넘습니다. 주문을 나누어 선택해 주세요.');return lines;
}
export function registerOrderInvoices(app:any,db:any,owner:any,route:any,credentials:any){
 db.exec(`CREATE TABLE IF NOT EXISTS tax_invoice_order_links(id INTEGER PRIMARY KEY,environment TEXT NOT NULL,order_id INTEGER NOT NULL,draft_id TEXT NOT NULL,snapshot TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
 CREATE UNIQUE INDEX IF NOT EXISTS tax_invoice_order_active ON tax_invoice_order_links(environment,order_id) WHERE active=1;`);
 const base='/api/admin/tax-invoices/:environment';
 const eligible=(o:any)=>o&&o.status==='done'&&o.total_amount>0&&o.is_sample!==1&&o.is_store_order!==1&&!(o.is_store_order===-1&&o.is_store===1);
 const get=(id:number)=>db.prepare('SELECT o.*,c.is_store FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.id=?').get(id);
 const unlinked=(env:string,o:any)=>{if(!eligible(o))fail('처리 완료된 유상 외부 주문만 선택할 수 있습니다.');if(db.prepare('SELECT id FROM tax_invoice_order_links WHERE environment=? AND order_id=? AND active=1').get(env,o.id))fail('이미 연결된 주문입니다. 기존 문서를 확인해 주세요.');};
 app.get(base+'/orders',owner,route((req:any,res:any)=>{
  const env=taxEnvironment.parse(req.params.environment);
  const rows=db.prepare(`SELECT o.*,c.is_store,c.business_name,c.biz_reg_no,c.tax_email,c.email,c.manager_name,c.default_address,l.draft_id,l.snapshot,d.state FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN tax_invoice_order_links l ON l.order_id=o.id AND l.environment=? AND l.active=1 LEFT JOIN tax_invoice_drafts d ON d.id=l.draft_id ORDER BY o.created_at DESC`).all(env);
  res.json({rows:rows.filter((o:any)=>eligible(o)||o.draft_id).map((o:any)=>({id:o.id,orderNo:o.order_no,customerId:o.customer_id,name:o.business_name||JSON.parse(o.customer_snapshot).businessName||'거래처',date:o.ecount_date||new Date(o.created_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),amount:o.supply_amount,tax:o.vat,total:o.total_amount,items:JSON.parse(o.items),discount:o.discount_amount||0,ecountSent:!!o.ecount_sent_at,draftId:o.draft_id,state:o.draft_id?(o.snapshot!==orderSnapshot(o)?'changed':o.state):'unissued',buyer:{corpNum:(o.biz_reg_no||'').replace(/\D/g,''),name:o.business_name||'',ceo:'',address:o.default_address||'',bizType:'',bizClass:'',contact:o.manager_name||'',email:o.tax_email||o.email||''}}))});
 }));
 app.post(base+'/order-drafts',owner,route((req:any,res:any)=>{
  const env=taxEnvironment.parse(req.params.environment),p=z.object({supplier:invoiceParty,date:taxDate,purpose:z.enum(['1','2']),groups:z.array(z.object({ids:z.array(z.number().int().positive()).min(1).max(100),buyer:invoiceParty})).min(1).max(100)}).parse(req.body);
  if(p.supplier.corpNum!==credentials(env).corp||p.date>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}))fail('사업자번호·작성일을 확인해 주세요.');
  const ids=p.groups.flatMap(g=>g.ids);if(new Set(ids).size!==ids.length)fail('선택 주문이 중복되었습니다.');
  const result=db.transaction(()=>p.groups.map(g=>{
   const orders=g.ids.map(get);orders.forEach(o=>unlinked(env,o));if(new Set(orders.map(o=>o.customer_id)).size!==1)fail('다른 거래처는 한 장으로 합칠 수 없습니다.');
   const lines=orderInvoiceLines(orders),d=invoiceDraft.parse({supplier:p.supplier,buyer:g.buyer,date:p.date,purpose:p.purpose,item:orders.length===1?orders[0].order_no:`주문 ${orders.length}건`,amount:orders.reduce((s,o)=>s+o.supply_amount,0),tax:orders.reduce((s,o)=>s+o.vat,0),remark:'',lines});
   const id='KN'+randomUUID().replaceAll('-','').slice(0,22),payload=JSON.stringify(d),fingerprint=createHash('sha256').update(payload+JSON.stringify(g.ids.slice().sort())+id).digest('hex');
   db.prepare('INSERT INTO tax_invoice_drafts(id,environment,fingerprint,payload,created_at) VALUES(?,?,?,?,?)').run(id,env,fingerprint,payload,Date.now());
   for(const o of orders)db.prepare('INSERT INTO tax_invoice_order_links(environment,order_id,draft_id,snapshot) VALUES(?,?,?,?)').run(env,o.id,id,orderSnapshot(o));
   return {...db.prepare('SELECT * FROM tax_invoice_drafts WHERE id=?').get(id),payload:d};
  }))();res.json({rows:result});
 }));
 app.post(base+'/orders/external',owner,route((req:any,res:any)=>{
  const env=taxEnvironment.parse(req.params.environment),p=z.object({ids:z.array(z.number().int().positive()).min(1).max(100),approval:z.string().regex(/^\d{24}$/),confirmed:z.literal(true)}).parse(req.body);
  db.transaction(()=>{
   const orders=p.ids.map(get);orders.forEach(o=>unlinked(env,o));if(new Set(p.ids).size!==p.ids.length||new Set(orders.map(o=>o.customer_id)).size!==1)fail('같은 거래처의 중복 없는 주문을 선택해 주세요.');
   const id='EXT'+randomUUID().replaceAll('-','').slice(0,21),payload=JSON.stringify({date:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),buyer:{name:orders[0].business_name||JSON.parse(orders[0].customer_snapshot).businessName||'기존 발행'},item:'외부 발행 연결',amount:orders.reduce((s,o)=>s+o.supply_amount,0),tax:orders.reduce((s,o)=>s+o.vat,0),approval:p.approval});
   db.prepare('INSERT INTO tax_invoice_drafts(id,environment,fingerprint,payload,state,created_at) VALUES(?,?,?,?,?,?)').run(id,env,'external:'+p.approval,payload,'external',Date.now());
   for(const o of orders)db.prepare('INSERT INTO tax_invoice_order_links(environment,order_id,draft_id,snapshot) VALUES(?,?,?,?)').run(env,o.id,id,orderSnapshot(o));
  })();res.json({ok:true});
 }));
 app.post(base+'/drafts/:id/discard',owner,route((req:any,res:any)=>{const env=taxEnvironment.parse(req.params.environment);db.transaction(()=>{
  const r=db.prepare('SELECT * FROM tax_invoice_drafts WHERE id=? AND environment=?').get(req.params.id,env);if(!r||r.state!=='draft')fail('아직 발행 요청하지 않은 문서만 작성 취소할 수 있습니다.');
  db.prepare("UPDATE tax_invoice_drafts SET state='discarded' WHERE id=?").run(r.id);db.prepare('UPDATE tax_invoice_order_links SET active=0 WHERE draft_id=?').run(r.id);
 })();res.json({ok:true});}));
}
export function assertOrderInvoiceCurrent(db:any,id:string){
 const links=db.prepare('SELECT * FROM tax_invoice_order_links WHERE draft_id=? AND active=1').all(id);
 for(const l of links){const o=db.prepare('SELECT * FROM orders WHERE id=?').get(l.order_id);if(!o||o.status!=='done'||orderSnapshot(o)!==l.snapshot)fail('발행 준비 후 주문이 변경되었습니다. 발행 전 문서는 작성 취소 후 다시 준비해 주세요.');}
}
