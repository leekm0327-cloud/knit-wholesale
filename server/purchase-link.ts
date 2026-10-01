import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import { effectiveOrderYmd } from '../shared/orderDate';

const hash = (v: unknown) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const parse = (s: string) => JSON.parse(s || '[]') as any[];
export function initPurchaseLinks(db: any) {
  db.exec(`CREATE TABLE IF NOT EXISTS purchase_links (
    order_id INTEGER PRIMARY KEY, purchase_id INTEGER UNIQUE NOT NULL,
    baseline TEXT NOT NULL, locked INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS purchase_link_history (
    id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, purchase_id INTEGER NOT NULL,
    before_json TEXT, after_json TEXT, actor_id INTEGER, created_at INTEGER NOT NULL);`);
}
const normalizedItems = (s:string) => parse(s).map(i=>[i.productId??null,i.name,Number(i.qty),Number(i.unitPrice),Number(i.amount)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const snapshot = (p: any) => hash([normalizedItems(p.items),p.purchase_date,p.supplier_id,p.total_amount]);
export function purchaseLocked(db: any, id: number) {
  return !!db.prepare('SELECT locked FROM purchase_links WHERE purchase_id=?').get(id)?.locked;
}
export function purchasePlan(db: any, id: number) {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o) throw new Error('주문을 찾을 수 없습니다.');
  const p = o.auto_purchase_id ? db.prepare('SELECT * FROM purchases WHERE id=?').get(o.auto_purchase_id) : null;
  const link = db.prepare('SELECT * FROM purchase_links WHERE order_id=?').get(id);
  const supplier = p ? db.prepare('SELECT * FROM suppliers WHERE id=?').get(p.supplier_id) : db.prepare('SELECT * FROM suppliers ORDER BY id LIMIT 1').get();
  const categories = db.prepare('SELECT key FROM product_categories WHERE is_bean=1').all().map((c:any)=>c.key);
  const beanKeys = categories.length ? categories : ['blend','decaf','single'];
  const source = parse(o.items), old = p ? parse(p.items) : [];
  const positive = source.filter(i=>beanKeys.includes(i.category) && Number(i.qty)>0);
  const refunds = source.filter(i=>Number(i.qty)<0).map(i=>({name:i.name,qty:i.qty}));
  const items = positive.map(i=>{
    const key = (x:any) => i.productId != null ? x.productId===i.productId : x.name===i.name;
    let price = old.find(key)?.unitPrice;
    if (price == null && supplier) {
      for (const prev of db.prepare('SELECT items FROM purchases WHERE supplier_id=? ORDER BY created_at DESC,id DESC').all(supplier.id)) {
        const found = parse(prev.items).find(key); if (found) { price=found.unitPrice; break; }
      }
    }
    if (price == null && i.productId) price = db.prepare('SELECT cost_price FROM products WHERE id=?').get(i.productId)?.cost_price;
    const unitPrice = Number(price ?? 0), qty=Number(i.qty);
    return {productId:i.productId??null,name:i.name,qty,unitPrice,amount:Math.round(qty*unitPrice)};
  });
  const date = effectiveOrderYmd({createdAt:o.created_at,ecountDate:o.ecount_date});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('주문 날짜를 확인해 주세요.');
  const desired = {items:JSON.stringify(items),purchase_date:date,supplier_id:supplier?.id,total_amount:items.reduce((s,i)=>s+i.amount,0)};
  const changed = !!p && snapshot(p)!==snapshot(desired);
  const locked = !!link?.locked;
  const state = o.status==='cancelled' ? 'cancelled' : !positive.length ? 'empty' : !p ? 'missing' : !changed ? 'matched' : locked ? 'locked' : 'changed';
  return {orderId:id,orderNo:o.order_no,purchaseId:p?.id,purchaseNo:p?.purchase_no,state,locked,
    managed:!!link,manualChanged:!!(link&&p&&link.baseline!==snapshot(p)),refunds,
    current:p?{date:p.purchase_date,items:old,amount:p.total_amount}:null,
    proposed:{date,items,amount:desired.total_amount},supplierId:supplier?.id,
    fingerprint:hash([o,p,link]),order:o,desired};
}
export function applyPurchasePlan(db:any,id:number,actorId:number, expected?:string, automatic=false) {
  return db.transaction(()=>{
    const plan=purchasePlan(db,id),o=plan.order;
    if (expected && expected!==plan.fingerprint) throw new Error('주문 또는 발주가 변경됐습니다. 다시 확인해 주세요.');
    if (plan.state==='cancelled'||plan.state==='empty'||plan.locked) throw new Error('취소·발주 품목 없음·확정된 발주는 반영할 수 없습니다.');
    if (!plan.supplierId) throw new Error('공급처를 먼저 등록해 주세요.');
    if (plan.proposed.items.some(i=>!Number.isFinite(i.unitPrice)||i.unitPrice<=0||!Number.isFinite(i.qty)||i.qty<=0||!Number.isFinite(i.amount))) throw new Error('매입단가가 없는 품목이 있습니다. 발주 관리에서 확인해 주세요.');
    if (automatic && plan.purchaseId && (!plan.managed||plan.manualChanged)) return plan;
    if (plan.state==='matched' && plan.managed) return plan;
    let pid=plan.purchaseId;
    const before=pid?db.prepare('SELECT * FROM purchases WHERE id=?').get(pid):null;
    if (pid) db.prepare('UPDATE purchases SET items=?,purchase_date=?,total_amount=? WHERE id=?').run(plan.desired.items,plan.proposed.date,plan.proposed.amount,pid);
    else {
      const customer=db.prepare('SELECT business_name,is_store FROM customers WHERE id=?').get(o.customer_id);
      const prefix='PO-'+plan.proposed.date.replaceAll('-','').slice(2)+'-';
      const used=db.prepare('SELECT purchase_no FROM purchases WHERE purchase_no LIKE ?').all(prefix+'%');
      const n=Math.max(0,...used.map((p:any)=>Number(p.purchase_no.slice(prefix.length))||0))+1;
      const no=prefix+String(n).padStart(4,'0');
      pid=Number(db.prepare(`INSERT INTO purchases(supplier_id,purchase_no,purchase_date,items,total_amount,memo,segment,customer_id,customer_name,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(plan.supplierId,no,plan.proposed.date,plan.desired.items,plan.proposed.amount,
        `거래처주문 ${o.order_no} 자동발주`,(typeof o.is_store_order==='number' && o.is_store_order>=0 ? o.is_store_order===1 : !!customer?.is_store)?'store':'wholesale',o.customer_id,customer?.business_name??'',Date.now()).lastInsertRowid);
      db.prepare('UPDATE orders SET auto_purchase_id=? WHERE id=?').run(pid,id);
    }
    const after=db.prepare('SELECT * FROM purchases WHERE id=?').get(pid);
    db.prepare(`INSERT INTO purchase_links(order_id,purchase_id,baseline) VALUES(?,?,?)
      ON CONFLICT(order_id) DO UPDATE SET purchase_id=excluded.purchase_id,baseline=excluded.baseline,revision=revision+1`).run(id,pid,snapshot(after));
    db.prepare('INSERT INTO purchase_link_history(order_id,purchase_id,before_json,after_json,actor_id,created_at) VALUES(?,?,?,?,?,?)')
      .run(id,pid,before?JSON.stringify(before):null,JSON.stringify(after),actorId,Date.now());
    return purchasePlan(db,id);
  })();
}
export function syncManagedPurchase(db:any,id:number,actor:number) {
  const plan=purchasePlan(db,id);
  if (plan.managed&&!plan.locked&&!plan.manualChanged&&plan.state==='changed') applyPurchasePlan(db,id,actor,undefined,true);
}
export function registerPurchaseLinks(app:Express,db:any,auth:RequestHandler) {
  initPurchaseLinks(db);
  const clean=(p:ReturnType<typeof purchasePlan>)=>{const {order,desired,...rest}=p;return rest;};
  app.get('/api/admin/orders/:id/purchase-check',auth,(req,res)=>{
    try {res.json(clean(purchasePlan(db,Number(req.params.id))));} catch(e:any){res.status(400).json({message:e.message});}
  });
  app.post('/api/admin/orders/:id/purchase-check',auth,(req,res)=>{
    try {
      if (!['apply','lock'].includes(req.body.action)) throw new Error('처리 방식을 확인해 주세요.');
      if (typeof req.body.fingerprint!=='string') throw new Error('변경 내용을 먼저 확인해 주세요.');
      const plan=purchasePlan(db,Number(req.params.id));
      if(req.body.action==='lock') {
        if(plan.fingerprint!==req.body.fingerprint||!plan.purchaseId||plan.state!=='matched') throw new Error('일치하는 발주를 다시 확인해 주세요.');
        applyPurchasePlan(db,plan.orderId,req.session.userId!,plan.fingerprint);
        db.transaction(()=>{
          db.prepare('UPDATE purchase_links SET locked=1 WHERE order_id=?').run(plan.orderId);
          db.prepare('INSERT INTO purchase_link_history(order_id,purchase_id,before_json,after_json,actor_id,created_at) VALUES(?,?,?,?,?,?)').run(plan.orderId,plan.purchaseId,JSON.stringify({locked:false}),JSON.stringify({locked:true}),req.session.userId,Date.now());
        })();
        res.json(clean(purchasePlan(db,plan.orderId)));
      } else res.json(clean(applyPurchasePlan(db,plan.orderId,req.session.userId!,plan.fingerprint)));
    } catch(e:any){res.status(409).json({message:e.message});}
  });
}
