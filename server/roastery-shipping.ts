import {shippingOrderFingerprint,hasValidShippingTracking} from './roastery-tracking';
import {installRoasteryWorkflow,recordDispatchNotice} from './roastery-workflow';
import {registerRoasteryLinks} from './roastery-link';
import {createHash, randomUUID} from 'node:crypto';
import type {Express, RequestHandler} from 'express';
import type Database from 'better-sqlite3';
import multer from 'multer';
import {z} from 'zod';
import {readWorkbook} from './settlement-files';

const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export {shippingOrderFingerprint} from './roastery-tracking';
const text=z.string().trim().min(1).max(100);
const rowSchema=z.object({orderNo:z.string().trim().max(100),orderId:z.number().int().positive().optional(),carrier:z.enum(['CJ','HANJIN','LOTTE','POST','LOGEN']),tracking:z.string().trim().regex(/^[0-9]{8,30}$/, '송장번호는 8~30자리 숫자로 입력해 주세요.')});
const batchSchema=z.object({rows:z.array(rowSchema).min(1).max(500)});
const parse=(v:string)=>JSON.parse(v);
export function registerRoasteryShipping(app:Express, db:Database.Database, admin:RequestHandler, owner:RequestHandler) {
  // Additive, empty tables only. No automatic grants, assignment, import, or order mutation.
  db.exec(`CREATE TABLE IF NOT EXISTS roastery_members(user_id INTEGER PRIMARY KEY,roastery_id INTEGER NOT NULL,enabled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS roastery_assignments(order_id INTEGER PRIMARY KEY,roastery_id INTEGER NOT NULL,ready INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,packing TEXT NOT NULL DEFAULT '',instruction TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS roastery_shipments(order_id INTEGER PRIMARY KEY,carrier TEXT NOT NULL,tracking TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('submitted','approved','rejected','dispatch_reported','dispatch_confirmed')),version INTEGER NOT NULL DEFAULT 1,reason TEXT NOT NULL DEFAULT '',order_fingerprint TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS roastery_tracking_unique ON roastery_shipments(carrier,tracking) WHERE state!='rejected';
    CREATE TABLE IF NOT EXISTS roastery_previews(id TEXT PRIMARY KEY,actor INTEGER NOT NULL,roastery_id INTEGER NOT NULL,payload TEXT NOT NULL,fingerprint TEXT NOT NULL,created_at INTEGER NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0,result TEXT);
    CREATE TABLE IF NOT EXISTS roastery_audit(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL,actor INTEGER NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL,created_at INTEGER NOT NULL);`);
  registerRoasteryLinks(app,db,owner,shippingOrderFingerprint);
  installRoasteryWorkflow(db);
  const run=<T,>(f:()=>T):T=>{const tx=db.transaction(f);return tx.immediate?tx.immediate():tx();};
  const safe=(fn:(req:any,res:any)=>unknown):RequestHandler=>(req,res)=>{try{fn(req,res);}catch(e){res.status(e instanceof z.ZodError?400:409).json({message:e instanceof z.ZodError?e.issues[0]?.message:'정보가 변경됐거나 요청을 처리할 수 없습니다. 목록을 새로 확인해 주세요.'});}};
  const user=(req:any):any=>req.session?.userId?db.prepare('SELECT id,role,business_name FROM customers WHERE id=?').get(req.session.userId):null;
  // A dedicated roastery role cannot reuse customer/admin APIs to see prices or finances.
  app.use('/api',(req,res,next)=>{const u=user(req);if(u?.role!=='roastery' && req.session?.role!=='roastery')return next();
    res.setHeader('Cache-Control','no-store');
    if(req.path==='/auth/logout'&&req.method==='POST')return next();
    if(req.path==='/auth/me'&&req.method==='GET')return u?.role==='roastery'?res.json({id:u.id,role:u.role,businessName:u.business_name}):res.status(403).json({message:'접근 권한을 확인해 주세요.'});
    if(u?.role==='roastery'&&req.path.startsWith('/roastery/'))return next();
    return res.status(403).json({message:'로스터리 출고 화면만 이용할 수 있습니다.'});
  });
  const scope:RequestHandler=(req:any,res,next)=>{const u=user(req);const m:any=u?.role==='roastery'?db.prepare('SELECT roastery_id FROM roastery_members WHERE user_id=? AND enabled=1').get(u.id):null;
    if(!m)return res.status(403).json({message:'담당 로스터리 접근 권한이 필요합니다.'});req.roasteryId=m.roastery_id;res.setHeader('Cache-Control','no-store');next();};
  const rows=(rid?:number):any[]=>db.prepare(`SELECT a.*,o.order_no,o.items,o.customer_snapshot,o.status AS order_status,o.created_at,o.tracking_no AS legacy_tracking,s.carrier,s.tracking,s.state,s.version AS shipment_version,s.reason,s.order_fingerprint FROM roastery_assignments a JOIN orders o ON o.id=a.order_id LEFT JOIN roastery_shipments s ON s.order_id=a.order_id ${rid===undefined?'':'WHERE a.roastery_id=?'} ORDER BY o.created_at DESC,o.id DESC`).all(...(rid===undefined?[]:[rid]));
  function dto(r:any){const c=parse(r.customer_snapshot);return {id:r.order_id,orderNo:r.order_no,createdAt:r.created_at,roasteryId:r.roastery_id,version:r.version,ready:!!r.ready,confirmed:r.order_status==='done',hasValidTracking:hasValidShippingTracking(r),cancelled:r.order_status==='cancelled',packing:r.packing,instruction:r.instruction,
    recipient:{name:String(c.managerName||c.businessName||''),business:String(c.businessName||''),phone:String(c.phone||''),address:String(c.defaultAddress||'')},
    items:parse(r.items).map((i:any)=>({name:String(i.name),qty:Number(i.qty),weight: String(i.name).match(/\d+(?:\.\d+)?\s*(?:kg|g)\b/i)?.[0]||'중량 확인 필요'})),
    shipment:r.state?{carrier:r.carrier,tracking:r.tracking,state:r.state,version:r.shipment_version,reason:r.reason,changed:r.order_fingerprint!==shippingOrderFingerprint(r)}:null,legacyTracking:!!String(r.legacy_tracking??'').trim(),legacyTrackingNo:String(r.legacy_tracking||'')};}
  const audit=(id:number,actor:number,action:string,detail:unknown)=>db.prepare('INSERT INTO roastery_audit(order_id,actor,action,details,created_at) VALUES(?,?,?,?,?)').run(id,actor,action,JSON.stringify(detail),Date.now());
  app.get('/api/roastery/orders',scope,safe((req,res)=>res.json(rows(req.roasteryId).map(dto))));
  app.patch('/api/roastery/orders/:id/preparation',scope,safe((req,res)=>{const p=z.object({ready:z.boolean(),version:z.number().int()}).parse(req.body);run(()=>{const r=rows(req.roasteryId).find(r=>r.order_id===Number(req.params.id));if(!r||r.order_status==='cancelled'||r.version!==p.version||r.state==='dispatch_reported'||r.state==='dispatch_confirmed')throw Error();db.prepare('UPDATE roastery_assignments SET ready=?,version=version+1 WHERE order_id=?').run(+p.ready,r.order_id);audit(r.order_id,req.session.userId,'preparation',{ready:p.ready});});res.json({ok:true});}));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}}).single('file');
  app.post('/api/roastery/workbook',scope,(req,res,next)=>upload(req,res,e=>e?res.status(400).json({message:'5MB 이하 XLSX 파일 한 개를 선택해 주세요.'}):next()),safe((req,res)=>{
    if(!req.file?.originalname.toLowerCase().endsWith('.xlsx'))return res.status(400).json({message:'일반 XLSX만 지원합니다. XLS·암호 파일은 지원하지 않습니다.'});
    const sheets=readWorkbook(req.file.buffer,undefined,{rejectFormulas:true});
    if(sheets.length>10||sheets.some(s=>s.rows.length>501))return res.status(400).json({message:'시트 10개, 시트당 제목 포함 501행 이하로 나누어 주세요.'});
    res.json({sheets}); // In-memory parse only; no file or customer data retained.
  }));
  function inspect(rid:number,p:z.infer<typeof batchSchema>){const orders=rows(rid),seenOrder=new Set<number>(),seenTracking=new Set<string>();
    const inspected=p.rows.map((row,i)=>{const exact=orders.filter(o=>o.order_no===row.orderNo);const r=row.orderId?orders.find(o=>o.order_id===row.orderId):exact.length===1?exact[0]:null;
      let error='';if(!r)error='담당 주문을 찾지 못했습니다. 주문을 직접 확인해 선택하세요.';
      else if(row.orderId&&exact.length&&exact[0].order_id!==row.orderId)error='주문번호와 선택 주문이 다릅니다.';
      else if(r.order_status==='cancelled')error='취소 주문 제외';
      else if(String(r.legacy_tracking??'').trim())error='기존 관리자 송장이 있습니다. 관리자 검토 필요';
      else if(!parse(r.customer_snapshot).defaultAddress?.trim()||!parse(r.customer_snapshot).phone?.trim())error='배송지 또는 수취인 연락처 확인 필요';
      const key=row.carrier+':'+row.tracking;
      if(r&&seenOrder.has(r.order_id))error='한 주문의 여러 송장은 개별 관리자 검토가 필요합니다.';
      if(seenTracking.has(key))error='파일 안에 중복 송장번호가 있습니다.';
      if(r)seenOrder.add(r.order_id);seenTracking.add(key);
      const other:any=db.prepare("SELECT order_id FROM roastery_shipments WHERE carrier=? AND tracking=? AND state!='rejected'").get(row.carrier,row.tracking);
      if(other&&other.order_id!==r?.order_id)error='이미 등록된 송장번호입니다.';
      const duplicate=!!r&&r.state&&r.state!=='rejected'&&r.tracking===row.tracking&&r.carrier===row.carrier;
      if(r?.state&&r.state!=='rejected'&&!duplicate)error='다른 송장이 이미 등록됐습니다. 관리자 검토 필요';
      return {line:i+1,orderId:r?.order_id,orderNo:r?.order_no||row.orderNo,carrier:row.carrier,tracking:row.tracking,error,duplicate:!!duplicate,manual:!!row.orderId,snapshot:r?hash(r):null,orderFingerprint:r?shippingOrderFingerprint(r):null};
    });return {rows:inspected,fingerprint:hash(inspected)};
  }
  app.post('/api/roastery/preview',scope,safe((req,res)=>{const p=batchSchema.parse(req.body),review=inspect(req.roasteryId,p),id=randomUUID();db.prepare('INSERT INTO roastery_previews(id,actor,roastery_id,payload,fingerprint,created_at) VALUES(?,?,?,?,?,?)').run(id,req.session.userId,req.roasteryId,JSON.stringify(p),review.fingerprint,Date.now());res.json({id,rows:review.rows.map(({snapshot,orderFingerprint,...r})=>r),expiresInSeconds:900});}));
  const ownPreview=(req:any)=>{const p:any=db.prepare('SELECT * FROM roastery_previews WHERE id=? AND actor=? AND roastery_id=?').get(req.params.id,req.session.userId,req.roasteryId);if(!p)throw Error();return p;};
  app.get('/api/roastery/preview/:id',scope,safe((req,res)=>{const p=ownPreview(req);res.json({result:p.result?parse(p.result):null,cancelled:!!p.cancelled});}));
  app.delete('/api/roastery/preview/:id',scope,safe((req,res)=>{run(()=>{const p=ownPreview(req);if(p.result)throw Error();db.prepare('UPDATE roastery_previews SET cancelled=1 WHERE id=?').run(p.id);});res.json({ok:true});}));
  app.post('/api/roastery/preview/:id/apply',scope,safe((req,res)=>{const result=run(()=>{const p=ownPreview(req);if(p.result)return parse(p.result);if(p.cancelled||Date.now()-p.created_at>900000)throw Error();const checked=inspect(req.roasteryId,batchSchema.parse(parse(p.payload)));if(checked.fingerprint!==p.fingerprint||checked.rows.some(r=>r.error))throw Error();let submitted=0;
    for(const r of checked.rows){if(r.duplicate)continue;db.prepare(`INSERT INTO roastery_shipments(order_id,carrier,tracking,state,order_fingerprint,updated_at) VALUES(?,?,?,'dispatch_confirmed',?,?) ON CONFLICT(order_id) DO UPDATE SET carrier=excluded.carrier,tracking=excluded.tracking,state='dispatch_confirmed',version=roastery_shipments.version+1,reason='',order_fingerprint=excluded.order_fingerprint,updated_at=excluded.updated_at`).run(r.orderId,r.carrier,r.tracking,r.orderFingerprint,Date.now());recordDispatchNotice(db,r.orderId!,r.carrier,r.tracking);audit(r.orderId!,req.session.userId,'tracking_submitted',{carrier:r.carrier,tracking:r.tracking});submitted++;}
    const result={submitted,skipped:checked.rows.length-submitted};db.prepare('UPDATE roastery_previews SET result=? WHERE id=?').run(JSON.stringify(result),p.id);return result;});res.json(result);}));
  app.post('/api/roastery/orders/:id/dispatch',scope,safe((req,res)=>{const p=z.object({version:z.number().int(),confirmed:z.literal(true)}).parse(req.body);run(()=>{const r=rows(req.roasteryId).find(r=>r.order_id===Number(req.params.id));if(!r||r.order_status==='cancelled'||!r.ready||r.state!=='approved'||r.order_fingerprint!==shippingOrderFingerprint(r)||r.shipment_version!==p.version)throw Error();db.prepare("UPDATE roastery_shipments SET state='dispatch_reported',version=version+1,updated_at=? WHERE order_id=?").run(Date.now(),r.order_id);audit(r.order_id,req.session.userId,'dispatch_reported',{});});res.json({ok:true});}));
  app.get('/api/roastery/orders/:id/history',scope,safe((req,res)=>{if(!rows(req.roasteryId).some(r=>r.order_id===Number(req.params.id)))throw Error();res.json(db.prepare('SELECT id,action,created_at FROM roastery_audit WHERE order_id=? ORDER BY id DESC').all(Number(req.params.id)));}));
  app.get('/api/admin/roastery-shipping/:id/history',admin,safe((req,res)=>res.json(db.prepare('SELECT id,action,created_at FROM roastery_audit WHERE order_id=? ORDER BY id DESC').all(Number(req.params.id)))));
  app.get('/api/admin/roastery-shipping',admin,safe((_req,res)=>res.json(rows().map(dto))));
  app.get('/api/admin/roastery-shipping/partners',admin,safe((_req,res)=>res.json(db.prepare('SELECT s.id,s.name FROM suppliers s WHERE EXISTS(SELECT 1 FROM roastery_members m WHERE m.roastery_id=s.id AND m.enabled=1) OR EXISTS(SELECT 1 FROM roastery_links l WHERE l.roastery_id=s.id AND l.revoked_at IS NULL AND l.expires_at>?) ORDER BY s.name').all(Date.now()))));
  app.post('/api/admin/roastery-shipping/assign',admin,safe((req,res)=>{const p=z.object({orderNo:text,roasteryId:z.number().int().positive(),packing:z.string().trim().max(500),instruction:z.string().trim().max(500)}).parse(req.body);run(()=>{const order:any=db.prepare("SELECT id FROM orders WHERE order_no=? AND status!='cancelled'").get(p.orderNo);const partner=db.prepare('SELECT 1 WHERE EXISTS(SELECT 1 FROM roastery_members WHERE roastery_id=? AND enabled=1) OR EXISTS(SELECT 1 FROM roastery_links WHERE roastery_id=? AND revoked_at IS NULL AND expires_at>?)').get(p.roasteryId,p.roasteryId,Date.now());if(!order||!partner||db.prepare('SELECT 1 FROM roastery_assignments WHERE order_id=?').get(order.id))throw Error();db.prepare('INSERT INTO roastery_assignments(order_id,roastery_id,packing,instruction) VALUES(?,?,?,?)').run(order.id,p.roasteryId,p.packing,p.instruction);audit(order.id,req.session.userId,'assigned',{roasteryId:p.roasteryId});});res.json({ok:true});}));
  app.post('/api/admin/roastery-shipping/:id/review',admin,safe((req,res)=>{const p=z.object({version:z.number().int(),action:z.enum(['approve','reject','confirm-dispatch']),reason:z.string().trim().max(500).default('')}).parse(req.body);run(()=>{const r=rows().find(r=>r.order_id===Number(req.params.id));if(!r||r.order_status==='cancelled'||r.shipment_version!==p.version)throw Error();if(p.action==='confirm-dispatch'?r.state!=='dispatch_reported':p.action==='reject'?!['submitted','approved','dispatch_confirmed'].includes(r.state):r.state!=='submitted')throw Error();if(p.action!=='reject'&&r.order_fingerprint!==shippingOrderFingerprint(r))throw Error();if(p.action==='reject'&&!p.reason)throw Error();const state=p.action==='approve'?'approved':p.action==='reject'?'rejected':'dispatch_confirmed';db.prepare('UPDATE roastery_shipments SET state=?,reason=?,version=version+1,updated_at=? WHERE order_id=?').run(state,p.reason,Date.now(),r.order_id);audit(r.order_id,req.session.userId,'admin_'+p.action,{reason:p.reason});});res.json({ok:true});}));
}
