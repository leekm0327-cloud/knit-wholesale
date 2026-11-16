import type Database from 'better-sqlite3';
import type {Express, RequestHandler} from 'express';
import {createHash, randomInt} from 'node:crypto';
import {z} from 'zod';

export function initStaffBeanOrders(db:Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS staff_bean_orders (
    staff_id INTEGER NOT NULL, request_id TEXT NOT NULL, digest TEXT NOT NULL,
    order_id INTEGER NOT NULL UNIQUE, created_at INTEGER NOT NULL,
    PRIMARY KEY(staff_id,request_id)
  );`);
}
export function isStaffBeanOrder(db:Database.Database,id:number) {
  return !!db.prepare('SELECT 1 FROM staff_bean_orders WHERE order_id=?').get(id);
}
const requestSchema=z.object({requestId:z.string().uuid(),items:z.array(z.object({
  productId:z.number().int().positive().safe(),qty:z.number().int().min(1).max(1000)
}).strict()).min(1).max(30)}).strict();
class OrderInputError extends Error {
  constructor(public status:number,message:string){super(message);}
}
const productQuery=`SELECT p.id,p.name,p.category,p.min_order_qty AS minQty,p.cost_price AS cost
  FROM products p JOIN product_categories c ON c.key=p.category
  WHERE c.is_bean=1 AND p.available=1 AND COALESCE(p.hidden,0)=0`;
function destination(db:Database.Database) {
  const candidates=db.prepare(`SELECT id,business_name AS businessName,manager_name AS managerName,phone,
    default_address AS defaultAddress,biz_reg_no AS bizRegNo,tax_email AS taxEmail,payment_method AS paymentMethod
    FROM customers WHERE role='customer' AND is_store=1 ORDER BY id LIMIT 2`).all() as
    {id:number;businessName:string;managerName:string;phone:string;defaultAddress:string;bizRegNo:string;taxEmail:string;paymentMethod:string}[];
  if(candidates.length!==1||!candidates[0].defaultAddress?.trim()||!candidates[0].phone?.trim())
    throw new OrderInputError(409,'관리자가 배송지와 연락처가 등록된 매장 내부 계정 한 곳을 설정해야 합니다.');
  return candidates[0];
}
export function registerStaffBeanOrders(app:Express,db:Database.Database,staff:RequestHandler) {
  initStaffBeanOrders(db);
  const base='/api/staff/bean-orders';
  const wrap=(fn:(req:any,res:any,me:{id:number;name:string})=>void):RequestHandler=>(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    try {
      const me=db.prepare('SELECT id,name FROM staff WHERE id=? AND active=1').get(req.session.staffId) as {id:number;name:string}|undefined;
      if(!me){res.status(401).json({message:'직원 로그인이 필요합니다.'});return;}
      fn(req,res,me);
    } catch(e){
      if(e instanceof OrderInputError){res.status(e.status).json({message:e.message});return;}
      next(e);
    }
  };
  app.get(base,staff,wrap((_req,res,me)=>{
    let configured=false;
    try {destination(db);configured=true;} catch(e) {if(!(e instanceof OrderInputError))throw e;}
    const products=(db.prepare(productQuery+' ORDER BY p.sort_order,p.id').all() as {id:number;name:string;minQty:number}[])
      .map(({id,name,minQty})=>({id,name,minQty}));
    const recent=db.prepare(`SELECT o.order_no AS orderNo,o.status, s.created_at AS createdAt
      FROM staff_bean_orders s JOIN orders o ON o.id=s.order_id WHERE s.staff_id=?
      ORDER BY s.created_at DESC,s.order_id DESC LIMIT 10`).all(me.id);
    res.json({configured,products,recent});
  }));
  app.post(base,staff,wrap((req,res,me)=>{
    const parsed=requestSchema.safeParse(req.body);
    if(!parsed.success)throw new OrderInputError(400,'원두와 주문 수량을 확인해 주세요.');
    const {requestId,items}=parsed.data;
    const sorted=[...items].sort((a,b)=>a.productId-b.productId);
    if(new Set(sorted.map(x=>x.productId)).size!==sorted.length)
      throw new OrderInputError(400,'같은 원두는 한 줄에 담아 주세요.');
    const digest=createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
    const result=db.transaction(()=>{
      const duplicate=db.prepare(`SELECT s.digest,o.order_no AS orderNo FROM staff_bean_orders s JOIN orders o ON o.id=s.order_id
        WHERE s.staff_id=? AND s.request_id=?`).get(me.id,requestId) as {digest:string;orderNo:string}|undefined;
      if(duplicate){
        if(duplicate.digest!==digest)throw new OrderInputError(409,'이미 제출한 요청의 품목이 달라졌습니다. 다시 시작해 주세요.');
        return {orderNo:duplicate.orderNo,replayed:true};
      }
      const customer=destination(db);
      if(sorted.reduce((sum,x)=>sum+x.qty,0)<5)throw new OrderInputError(400,'원두는 합계 최소 5kg(수량 5개)부터 주문 가능합니다.');
      const catalog=db.prepare(productQuery+' AND p.id=?');
      const orderItems=sorted.map(({productId,qty})=>{
        const p=catalog.get(productId) as {name:string;category:string;minQty:number;cost:number}|undefined;
        if(!p)throw new OrderInputError(409,'판매 중인 원두만 주문할 수 있습니다.');
        if(qty<p.minQty)throw new OrderInputError(400,`${p.name}: 최소 수량 ${p.minQty}개를 담아 주세요.`);
        const unitPrice=Number(p.cost);
        if(!Number.isSafeInteger(unitPrice)||unitPrice<0||!Number.isSafeInteger(unitPrice*qty))
          throw new OrderInputError(409,'상품의 매입원가 설정을 확인해 주세요.');
        return {productId,name:p.name,productName:p.name,category:p.category,qty,unitPrice,amount:unitPrice*qty};
      });
      const now=Date.now(),date=new Date(now+9*3600000).toISOString().slice(2,10).replace(/-/g,'');
      let orderNo='';
      const byNumber=db.prepare('SELECT 1 FROM orders WHERE order_no=?');
      for(let attempt=0;attempt<12;attempt++){
        const candidate=`KC-${date}-${randomInt(1000,10000)}`;
        if(!byNumber.get(candidate)){orderNo=candidate;break;}
      }
      if(!orderNo)throw new OrderInputError(503,'주문번호를 생성하지 못했습니다. 같은 주문을 다시 확인해 주세요.');
      const supply=orderItems.reduce((sum,x)=>sum+x.amount,0),vat=Math.round(supply*.1);
      if(!Number.isSafeInteger(supply+vat))throw new OrderInputError(400,'합계가 허용 범위를 벗어났습니다.');
      const {id:customerId,...snapshot}=customer;
      const id=Number(db.prepare(`INSERT INTO orders
        (order_no,customer_id,is_store_order,customer_snapshot,items,supply_amount,vat,total_amount,note,status,created_at)
        VALUES(?,?,1,?,?,?,?,?,?,'pending',?)`)
        .run(orderNo,customerId,JSON.stringify(snapshot),JSON.stringify(orderItems),supply,vat,supply+vat,'직원 화면 · 매장 원두 주문',now).lastInsertRowid);
      db.prepare('INSERT INTO staff_bean_orders(staff_id,request_id,digest,order_id,created_at) VALUES(?,?,?,?,?)').run(me.id,requestId,digest,id,now);
      db.prepare(`INSERT INTO activity_logs(actor_user_id,actor_email,actor_role,action,target_type,target_id,summary,metadata,created_at)
        VALUES(?, '', 'staff','order.staff_bean_create','order',?,?,?,?)`)
        .run(me.id,String(id),`직원 매장 원두 주문 ${orderNo}`,JSON.stringify({staffId:me.id,staffName:me.name}),now);
      return {orderNo,replayed:false};
    }).immediate();
    res.status(result.replayed?200:201).json({orderNo:result.orderNo});
  }));
}
